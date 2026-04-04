const tf = require('@tensorflow/tfjs');
const CONFIG = require('../config');

function createModel(inputSize = 256, layers = 3, neurons = 128, activation = 'relu') {
  const model = tf.sequential();
  model.add(tf.layers.dense({
    inputShape: [inputSize],
    units: neurons,
    activation: activation === 'leaky' ? undefined : activation
  }));

  // LeakyReLU needs layer after
  if (activation === 'leaky') {
    model.add(tf.layers.leakyReLU());
  }

  for (let i = 1; i < layers; i++) {
    model.add(tf.layers.dense({
      units: neurons,
      activation: activation === 'leaky' ? undefined : activation
    }));
    if (activation === 'leaky') {
      model.add(tf.layers.leakyReLU());
    }
  }

  // Hidden shared layers (common)
  const sharedUnits = Math.max(32, Math.floor(neurons / 2));
  model.add(tf.layers.dense({ units: sharedUnits, activation: 'relu' }));

  // Policy head
  model.add(tf.layers.dense({ units: 32, activation: 'relu' }));

  // Output will be dynamically sized based on legalMoves count
  // We use a fixed output and mask, or reshape dynamically
  // For simplicity: 32 output units (max legal moves ~30)
  model.add(tf.layers.dense({ units: 32, activation: 'linear' }));

  return model;
}

async function predict(model, boardInput, legalMoves, epsilon = 0.3) {
  // boardInput: flat[64] int (0-4)
  // Convert to 4-channel input from perspective of current player
  const channels = boardToChannels(boardInput);
  const input = tf.tensor2d([channels], [1, 256]);

  if (Math.random() < epsilon) {
    input.dispose();
    // Random move
    const idx = Math.floor(Math.random() * legalMoves.length);
    const value = Math.random() * 2 - 1; // random -1 to 1
    return { moveIdx: idx, value, random: true };
  }

  const prediction = model.predict(input);
  const values = await prediction.data();
  input.dispose();
  prediction.dispose();

  // Softmax on policy
  const legalCount = legalMoves.length;
  const logits = [];
  for (let i = 0; i < legalCount; i++) {
    logits.push(values[i] || 0);
  }

  // Softmax
  const maxLogit = Math.max(...logits);
  const exps = logits.map(x => Math.exp(x - maxLogit));
  const sumExps = exps.reduce((a, b) => a + b, 0);
  const probs = exps.map(x => x / sumExps);

  // Sample from probabilities
  const cumulative = [];
  let sum = 0;
  for (const p of probs) {
    sum += p;
    cumulative.push(sum);
  }
  const rand = Math.random();
  let moveIdx = 0;
  for (let i = 0; i < cumulative.length; i++) {
    if (rand <= cumulative[i]) {
      moveIdx = i;
      break;
    }
  }

  const value = values[legalCount] || 0; // value from extra output

  return { moveIdx, value, probs, random: false };
}

function boardToChannels(board) {
  // board: flat[64] with values 0-4
  // 1=wPawn, 2=wKing, 3=bPawn, 4=bKing
  // Channel 1: my pawns, Channel 2: my kings, Channel 3: opp pawns, Channel 4: opp kings
  // Assuming "me" = white (perspective)
  const channels = new Float32Array(256); // 64 * 4
  for (let i = 0; i < 64; i++) {
    const v = board[i] || 0;
    if (v === 1) channels[i] = 1; // wPawn in ch1
    else if (v === 2) channels[64 + i] = 1; // wKing in ch2
    else if (v === 3) channels[128 + i] = 1; // bPawn in ch3
    else if (v === 4) channels[192 + i] = 1; // bKing in ch4
  }
  return Array.from(channels);
}

function flipBoardInput(board) {
  // Flip board 180° and swap colors
  // board: flat[64], index i = row*8 + col
  const flipped = new Array(64);
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const origIdx = (7 - row) * 8 + (7 - col);
      let val = board[origIdx] || 0;
      // Swap colors: 1↔3, 2↔4
      if (val === 1) val = 3;
      else if (val === 2) val = 4;
      else if (val === 3) val = 1;
      else if (val === 4) val = 2;
      flipped[row * 8 + col] = val;
    }
  }
  return flipped;
}

async function train(model, batch, options = {}) {
  const { lr = 0.001, epochs = 1, gamma = 0.95 } = options;

  const optimizer = tf.train.adam(lr);

  let loss = 0;
  for (let epoch = 0; epoch < epochs; epoch++) {
    const { valueLoss } = optimizer.minimize(() => {
      const losses = batch.map(entry => {
        const input = boardToChannels(entry.board);
        const x = tf.tensor2d([input], [1, 256]);
        const pred = model.predict(x);
        const target = tf.tensor2d([[entry.valueTarget]], [1, 1]);
        const l = tf.losses.meanSquaredError(target, pred.slice([0, 0], [1, 1]));
        x.dispose();
        pred.dispose();
        target.dispose();
        return l;
      });
      const totalLoss = losses.reduce((a, b) => a.add(b), tf.scalar(0));
      loss = totalLoss.dataSync()[0];
      return totalLoss;
    }, true);
  }

  return { loss, samples: batch.length };
}

async function saveModel(model, dirPath, name) {
  try {
    await model.save(`file://${dirPath}/${name}`);
  } catch (e) {
    console.error(`Model save error: ${e.message}`);
  }
}

async function loadModel(dirPath, name) {
  try {
    const model = await tf.loadLayersModel(`file://${dirPath}/${name}/model.json`);
    return model;
  } catch (e) {
    return null;
  }
}

function disposeModel(model) {
  if (model) model.dispose();
}

module.exports = {
  createModel,
  predict,
  train,
  saveModel,
  loadModel,
  disposeModel,
  boardToChannels,
  flipBoardInput
};