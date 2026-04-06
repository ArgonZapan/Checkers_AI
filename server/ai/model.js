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

async function getStateValue(model, boardInput) {
  if (!model) return 0; // Guard for uninitialized models
  // Compute V(s) = max_a Q(s,a) for a given board state (no exploration)
  const channels = boardToChannels(boardInput);
  const input = tf.tensor2d([channels], [1, 256]);
  const prediction = model.predict(input);
  const values = await prediction.data();
  input.dispose();
  prediction.dispose();

  // V(s) = max over all Q-values (32 outputs from policy head)
  const allValues = Array.from(values);
  const maxQ = Math.max(...allValues);
  return maxQ;
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
  const { lr = 0.001, epochs = 1, gamma = 0.95, subBatchSize = 16 } = options;
  const optimizer = tf.train.adam(lr);

  // Split batch into sub-batches to yield event loop and keep HTTP responsive
  let totalLoss = 0;
  let totalSamples = 0;

  for (let epoch = 0; epoch < epochs; epoch++) {
    for (let start = 0; start < batch.length; start += subBatchSize) {
      const end = Math.min(start + subBatchSize, batch.length);
      const subBatch = batch.slice(start, end);

      // Pre-allocate tensors for this sub-batch
      const inputs = new Array(end - start);
      const targets = new Array(end - start);
      for (let i = 0; i < subBatch.length; i++) {
        const entry = subBatch[i];
        const ch = boardToChannels(entry.board);
        inputs[i] = tf.tensor2d([ch], [1, 256]);
        targets[i] = tf.tensor2d([[entry.valueTarget]], [1, 1]);
      }

      const lossVal = optimizer.minimize(() => {
        const losses = [];
        for (let i = 0; i < inputs.length; i++) {
          const x = inputs[i];
          const pred = model.predict(x);
          const predMax = tf.max(pred, 1, true);
          const target = targets[i];
          const l = tf.losses.meanSquaredError(target, predMax);
          pred.dispose();
          predMax.dispose();
          losses.push(l);
        }
        const total = losses.reduce((a, b) => a.add(b), tf.scalar(0));
        return total;
      }, true);
      if (lossVal) {
        totalLoss = lossVal.dataSync()[0];
        lossVal.dispose();
      }
      totalSamples += inputs.length;

      // Cleanup sub-batch tensors
      for (const t of inputs) { if (t) t.dispose(); }
      for (const t of targets) { if (t) t.dispose(); }

      // Yield to event loop every sub-batch
      await new Promise(r => setImmediate(r));
    }
  }

  return { loss: totalLoss, samples: totalSamples };
}

function disposeModel(model) {
  if (model) model.dispose();
}

module.exports = {
  createModel,
  predict,
  getStateValue,
  train,
  disposeModel,
  boardToChannels,
  flipBoardInput
};