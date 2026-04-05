const tf = require('@tensorflow/tfjs');

function createModel(inputSize = 256, layers = 3, neurons = 128, activation = 'relu') {
  const model = tf.sequential();
  model.add(tf.layers.dense({
    inputShape: [inputSize],
    units: neurons,
    activation: activation === 'leaky' ? undefined : activation
  }));
  if (activation === 'leaky') model.add(tf.layers.leakyReLU());

  for (let i = 1; i < layers; i++) {
    model.add(tf.layers.dense({
      units: neurons,
      activation: activation === 'leaky' ? undefined : activation
    }));
    if (activation === 'leaky') model.add(tf.layers.leakyReLU());
  }

  // Shared trunk
  const sharedUnits = Math.max(32, Math.floor(neurons / 2));
  model.add(tf.layers.dense({ units: sharedUnits, activation: 'relu' }));

  // Policy head - output 32 values for move selection
  model.add(tf.layers.dense({ units: 32, activation: 'linear' }));

  return model;
}

async function predict(model, boardInput, legalMoves, epsilon = 0.3) {
  const channels = boardToChannels(boardInput);
  const input = tf.tensor2d([channels], [1, 256]);

  if (Math.random() < epsilon) {
    input.dispose();
    const idx = Math.floor(Math.random() * legalMoves.length);
    return { moveIdx: idx, value: 0, random: true };
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

  const maxLogit = Math.max(...logits);
  const exps = logits.map(x => Math.exp(x - maxLogit));
  const sumExps = exps.reduce((a, b) => a + b, 0);
  const probs = exps.map(x => x / sumExps);

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

  // Value = max policy value (proxy for position strength)
  const value = Math.max(...logits);

  return { moveIdx, value, probs, random: false };
}

function boardToChannels(board) {
  const channels = new Float32Array(256);
  for (let i = 0; i < 64; i++) {
    const v = board[i] || 0;
    if (v === 1) channels[i] = 1;
    else if (v === 2) channels[64 + i] = 1;
    else if (v === 3) channels[128 + i] = 1;
    else if (v === 4) channels[192 + i] = 1;
  }
  return Array.from(channels);
}

function flipBoardInput(board) {
  const flipped = new Array(64);
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const origIdx = (7 - row) * 8 + (7 - col);
      let val = board[origIdx] || 0;
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
    const lossVal = optimizer.minimize(() => {
      const losses = batch.map(entry => {
        const input = boardToChannels(entry.board);
        const x = tf.tensor2d([input], [1, 256]);
        const pred = model.predict(x);
        const predMax = tf.max(pred, 1, true);
        const target = tf.tensor2d([[entry.valueTarget]], [1, 1]);
        const l = tf.losses.meanSquaredError(target, predMax);
        x.dispose();
        pred.dispose();
        predMax.dispose();
        target.dispose();
        return l;
      });
      const totalLoss = losses.reduce((a, b) => a.add(b), tf.scalar(0));
      loss = totalLoss.dataSync()[0];
      return totalLoss;
    }, true);
    if (lossVal) lossVal.dispose();  // Free the tensor returned by minimize
  }
  // Note: TF.js optimizer internal variables (momentum) are freed when
  // the model is disposed via disposeModel(). No explicit cleanup needed.

  return { loss, samples: batch.length };
}

function disposeModel(model) {
  if (model) model.dispose();
}

module.exports = {
  createModel,
  predict,
  train,
  disposeModel,
  boardToChannels,
  flipBoardInput
};