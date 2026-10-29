export function flightDuration(seed) {
  return 2.6 + seed * 1.8;
}

// Only inspect image cells touched by the brush. The GPU animates each impulse
// until its own return time; leaving the pointer never cancels an ongoing flight.
export class FlightBrush {
  constructor(width, height, aspect, cellIndices, seeds, random = Math.random) {
    this.width = width;
    this.height = height;
    this.aspect = aspect;
    this.cellIndices = cellIndices;
    this.seeds = seeds;
    this.random = random;
    this.data = new Float32Array(seeds.length);
    for (let i = 0; i < this.data.length; i += 4) this.data[i] = -100;
  }

  stamp(x, y, vx, vy, time, delta, radius) {
    if (delta <= 0 || radius <= 0) return null;
    const { width, height, aspect, data, seeds, cellIndices } = this;
    const left = Math.max(
      0,
      Math.ceil(((x - radius) / (aspect * 2) + 0.5) * width - 0.5),
    );
    const right = Math.min(
      width - 1,
      Math.floor(((x + radius) / (aspect * 2) + 0.5) * width - 0.5),
    );
    const top = Math.max(0, Math.ceil((0.5 - (y + radius) / 2) * height - 0.5));
    const bottom = Math.min(
      height - 1,
      Math.floor((0.5 - (y - radius) / 2) * height - 0.5),
    );
    let first = Infinity;
    let last = -1;
    for (let row = top; row <= bottom; row++) {
      const dy = (0.5 - (row + 0.5) / height) * 2 - y;
      for (let col = left; col <= right; col++) {
        const index = cellIndices[row * width + col];
        if (index < 0) continue;
        const offset = index * 4;
        const age = time - data[offset];
        // Do not pull a particle back or restart it while it is in the air.
        if (
          age <
          flightDuration(seeds[offset + 2]) + 0.2 + seeds[offset + 1] * 0.8
        )
          continue;
        const dx = ((col + 0.5) / width - 0.5) * aspect * 2 - x;
        const distance = Math.hypot(dx, dy);
        if (distance >= radius) continue;
        const falloff = 1 - distance / radius;
        // Stagger takeoffs, including under a stationary pointer. The soft,
        // irregular emission avoids moving every pixel onto a circular rim.
        const rate = (1.8 + seeds[offset + 1] * 2.8) * falloff * falloff;
        if (this.random() >= 1 - Math.exp(-rate * delta)) continue;
        data[offset] = time;
        data[offset + 1] = (0.3 + seeds[offset + 3] * 1.0) * Math.sqrt(falloff);
        data[offset + 2] = Math.max(-4, Math.min(4, vx));
        data[offset + 3] = Math.max(-4, Math.min(4, vy));
        first = Math.min(first, offset);
        last = Math.max(last, offset + 3);
      }
    }
    return last < 0 ? null : { start: first, count: last - first + 1 };
  }
}
