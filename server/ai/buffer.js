const fs = require('fs');
const path = require('path');

class ReplayBuffer {
  constructor(maxSize = 500000) {
    this.maxSize = maxSize;
    this.buffer = [];
  }

  add(entry) {
    // {board: int[64], from: [r,c], to: [r,c], turn: ±1, reward: float}
    if (this.buffer.length >= this.maxSize) {
      this.buffer.shift(); // FIFO
    }
    this.buffer.push({ ...entry });
  }

  sampleRandom(n) {
    const batch = [];
    const size = this.buffer.length;
    if (size === 0) return batch;
    // Sampling WITHOUT replacement using Fisher-Yates partial shuffle
    const count = Math.min(n, size);
    const indices = new Set();
    while (indices.size < count) {
      indices.add(Math.floor(Math.random() * size));
    }
    for (const idx of indices) {
      batch.push(this.buffer[idx]);
    }
    return batch;
  }

  clear() {
    this.buffer = [];
  }

  size() {
    return this.buffer.length;
  }

  save(filePath) {
    try {
      fs.writeFileSync(filePath, JSON.stringify(this.buffer));
    } catch (e) {
      console.error(`Buffer save error: ${e.message}`);
    }
  }

  load(filePath) {
    try {
      if (fs.existsSync(filePath)) {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        this.buffer = data.slice(-this.maxSize);
        console.log(`Buffer loaded: ${this.buffer.length} entries`);
      }
    } catch (e) {
      console.error(`Buffer load error: ${e.message}`);
    }
  }
}

module.exports = { ReplayBuffer };