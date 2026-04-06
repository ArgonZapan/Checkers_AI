// Worker subprocess for training a single DQN model
// Used via child_process.fork() — communicates through IPC (process.on('message') / process.send())
require('@tensorflow/tfjs-node'); // block main thread binding early
const tf = require('@tensorflow/tfjs');
const path = require('path');
const fs = require('fs');

const { createModel, boardToChannels } = require('./model');

let model = null;
let modelName = null;
let modelConfig = null;

// Model configs matching trainer.js
const MODEL_CONFIGS = {
  agresor: { inputSize: 256, layers: 4, neurons: 256, activation: 'relu' },
  forteca: { inputSize: 256, layers: 3, neurons: 128, activation: 'relu' }
};

async function loadOrCreateModel(name, weightsPath) {
  const cfg = MODEL_CONFIGS[name] || MODEL_CONFIGS.agresor;
  modelConfig = cfg;
  modelName = name;

  if (weightsPath && fs.existsSync(weightsPath)) {
    try {
      model = await tf.loadLayersModel(`file://${weightsPath}`);
      console.log(`[Worker:${name}] Loaded from ${weightsPath}`);
      return;
    } catch (e) {
      console.warn(`[Worker:${name}] Load failed (${e.message}), creating fresh`);
    }
  }
  model = createModel(cfg.inputSize, cfg.layers, cfg.neurons, cfg.activation);
  console.log(`[Worker:${name}] Created fresh model`);
}

async function handleTask(msg) {
  switch (msg.cmd) {
    case 'init': {
      try {
        await loadOrCreateModel(msg.name, msg.weightsPath);
        process.send({ status: 'ready', name: msg.name });
      } catch (e) {
        process.send({ status: 'error', error: e.message });
      }
      break;
    }

    case 'train': {
      if (!model) {
        process.send({ cmd: 'train_result', error: 'Model not initialized' });
        return;
      }
      const { batch, lr, gamma, epochs, subBatchSize, weightsPath } = msg;
      let result = {};
      try {
        result = await runTraining(batch, lr, gamma, epochs, subBatchSize, weightsPath);
        process.send({ cmd: 'train_result', ...result });
      } catch (e) {
        process.send({ cmd: 'train_result', error: e.message });
      }
      break;
    }

    case 'get_weights': {
      if (!model) {
        process.send({ cmd: 'weights', error: 'Model not initialized' });
        return;
      }
      const weights = model.getWeights().map(w => w.arraySync());
      process.send({ cmd: 'weights', weights });
      break;
    }

    case 'set_weights': {
      if (!model) {
        process.send({ status: 'weights_set', error: 'Model not initialized' });
        return;
      }
      model.setWeights(msg.weights.map(w => tf.tensor(w)));
      process.send({ status: 'weights_set' });
      break;
    }

    case 'shutdown': {
      if (model) { model.dispose(); model = null; }
      tf.disposeVariables();
      setTimeout(() => process.exit(0), 100);
      break;
    }

    default:
      process.send({ error: 'Unknown command: ' + msg.cmd });
  }
}

async function runTraining(batch, lr, gamma, epochs, subBatchSize, weightsPath) {
  const optimizer = tf.train.adam(lr);
  let lastLoss = 0;
  let iters = 0;

  for (let epoch = 0; epoch < epochs; epoch++) {
    // If this is the first epoch and parent didn't pre-compute targets, do it here
    let trainBatch = batch;
    if (epoch === 0 && batch.length > 0 && typeof batch[0].valueTarget !== 'number') {
      // Parent sent raw buffer entries — compute TD targets in worker
      trainBatch = [];
      for (const entry of batch) {
        let valueTarget;
        if (entry.isTerminal) {
          valueTarget = entry.reward;
        } else {
          const nextValue = await getStateValue(entry.next_board);
          valueTarget = entry.reward + gamma * nextValue;
        }
        trainBatch.push({ ...entry, valueTarget });
      }
    }

    for (let start = 0; start < trainBatch.length; start += (subBatchSize || 32)) {
      const end = Math.min(start + (subBatchSize || 32), trainBatch.length);
      const subBatch = trainBatch.slice(start, end);

      const n = end - start;
      const inputs = new Array(n);
      const targets = new Array(n);
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
        lastLoss = lossVal.dataSync()[0];
        lossVal.dispose();
      }
      iters++;

      for (const t of inputs) { if (t) t.dispose(); }
      for (const t of targets) { if (t) t.dispose(); }
    }
  }

  // Save model weights to disk
  const savePath = weightsPath || `models/${modelName}.json`;
  const dir = path.dirname(savePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  await model.save(`file://${savePath}`);

  tf.disposeVariables();

  return { loss: lastLoss, iters, epochs };
}

async function getStateValue(boardInput) {
  // V(s) = max_a Q(s,a)
  const channels = boardToChannels(boardInput);
  const input = tf.tensor2d([channels], [1, 256]);
  const prediction = model.predict(input);
  const values = await prediction.data();
  input.dispose();
  prediction.dispose();
  return Math.max(...Array.from(values));
}

// IPC message handler
process.on('message', handleTask);

// Handle parent disconnect / crash
process.on('disconnect', () => {
  console.log(`[Worker] Parent disconnected, shutting down`);
  if (model) { model.dispose(); model = null; }
  process.exit(0);
});

process.on('uncaughtException', (err) => {
  console.error(`[Worker] Uncaught exception:`, err.message);
  process.send({ cmd: 'train_result', error: err.message });
});

console.log('[Worker] Started, waiting for init command');
