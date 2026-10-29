export function flightDuration(seed) {
  return 4.4 + seed * 2.4;
}

// Filter velocity in seconds, with a vector limit so diagonal sweeps have the
// same energy as horizontal ones. A delayed frame cannot create a huge impulse.
export function updateFlowVelocity(velocity, dx, dy, delta) {
  if (delta <= 0) return velocity;
  const speed = Math.hypot(dx, dy) / delta;
  const limit = Math.min(1, 9 / Math.max(speed, 0.001));
  const blend = 1 - Math.exp(-delta / 0.07);
  velocity.x += (dx / delta * limit - velocity.x) * blend;
  velocity.y += (dy / delta * limit - velocity.y) * blend;
  return velocity;
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
    const speed = Math.hypot(vx, vy);
    const limit = Math.min(1, 9 / Math.max(speed, 0.001));
    const gust = 1 - Math.exp(-speed * 0.45);
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
        const rate = (2.0 + seeds[offset + 1] * 2.8) * (1 + gust * 2.2) * falloff * falloff;
        if (this.random() >= 1 - Math.exp(-rate * delta)) continue;
        data[offset] = time;
        data[offset + 1] = (0.32 + seeds[offset + 3] * 0.75) * Math.sqrt(falloff) * (1 + gust * 0.3);
        data[offset + 2] = vx * limit;
        data[offset + 3] = vy * limit;
        first = Math.min(first, offset);
        last = Math.max(last, offset + 3);
      }
    }
    return last < 0 ? null : { start: first, count: last - first + 1 };
  }
}
