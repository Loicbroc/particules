// A local-space grid keeps hover queries proportional to the brush footprint,
// rather than scanning all 240k particles for every pointer sample.
export class ParticlePicker {
  constructor(positions) { this.rebuild(positions); }
  rebuild(positions) {
    this.positions = positions;
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < positions.length; i++) {
      const axis = i % 3;
      min[axis] = Math.min(min[axis], positions[i]);
      max[axis] = Math.max(max[axis], positions[i]);
    }
    this.min = min; this.max = max;
    this.cell = Math.max(0.18, ...max.map((n, a) => (n - min[a]) / 64));
    this.size = max.map((n, a) => Math.floor((n - min[a]) / this.cell) + 1);
    const [nx, ny, nz] = this.size;
    this.heads = new Int32Array(nx * ny * nz).fill(-1);
    this.next = new Int32Array(positions.length / 3);
    this.visited = new Uint32Array(this.heads.length);
    this.generation = 0;
    for (let i = 0; i < this.next.length; i++) {
      const x = Math.floor((positions[i * 3] - min[0]) / this.cell);
      const y = Math.floor((positions[i * 3 + 1] - min[1]) / this.cell);
      const z = Math.floor((positions[i * 3 + 2] - min[2]) / this.cell);
      const bin = (z * ny + y) * nx + x;
      this.next[i] = this.heads[bin]; this.heads[bin] = i;
    }
  }
  query(ray, matrix, ndc, width, height, radius, visit, sweep = null) {
    const { min, max, cell, positions, size, heads, next } = this;
    const origin = [ray.origin.x, ray.origin.y, ray.origin.z];
    const direction = [ray.direction.x, ray.direction.y, ray.direction.z];
    const far = Math.hypot(...max.map((n, a) => Math.max(Math.abs(n - origin[a]), Math.abs(min[a] - origin[a]))));
    // Perspective cone, enlarged to a capsule for grid traversal. Exact screen
    // distance below rejects excess candidates at every depth and camera angle.
    const reach = Math.max(0.01, far * radius / height * 0.77);
    let enter = 0, leave = Infinity;
    for (let a = 0; a < 3; a++) {
      if (Math.abs(direction[a]) < 1e-9) {
        if (origin[a] < min[a] - reach || origin[a] > max[a] + reach) return;
      } else {
        let a0 = (min[a] - reach - origin[a]) / direction[a];
        let a1 = (max[a] + reach - origin[a]) / direction[a];
        if (a0 > a1) [a0, a1] = [a1, a0];
        enter = Math.max(enter, a0); leave = Math.min(leave, a1);
      }
    }
    if (leave < enter) return;
    this.generation = (this.generation + 1) >>> 0;
    if (!this.generation) { this.visited.fill(0); this.generation = 1; }
    const generation = this.generation, e = matrix.elements;
    const [nx, ny, nz] = size, padding = Math.ceil(reach / cell) + 1;
    const half = cell / 2;
    const wRadius = half * (Math.abs(e[3]) + Math.abs(e[7]) + Math.abs(e[11]));
    const dx = sweep ? (sweep.to.x - sweep.from.x) * width / 2 : 0;
    const dy = sweep ? (sweep.to.y - sweep.from.y) * height / 2 : 0;
    const lengthSquared = dx * dx + dy * dy;
    for (let t = enter; t <= leave + cell; t += cell) {
      const bx = Math.floor((origin[0] + direction[0] * t - min[0]) / cell);
      const by = Math.floor((origin[1] + direction[1] * t - min[1]) / cell);
      const bz = Math.floor((origin[2] + direction[2] * t - min[2]) / cell);
      for (let z = Math.max(0, bz - padding); z <= Math.min(nz - 1, bz + padding); z++)
        for (let y = Math.max(0, by - padding); y <= Math.min(ny - 1, by + padding); y++)
          for (let x = Math.max(0, bx - padding); x <= Math.min(nx - 1, bx + padding); x++) {
            const bin = (z * ny + y) * nx + x;
            if (this.visited[bin] === generation) continue;
            this.visited[bin] = generation;
            // Reject projected cell bounds before touching its particles. This
            // also keeps dense side views inexpensive in Detail mode.
            const cx = min[0] + (x + 0.5) * cell, cy = min[1] + (y + 0.5) * cell, cz = min[2] + (z + 0.5) * cell;
            const cw = e[3] * cx + e[7] * cy + e[11] * cz + e[15];
            if (cw > wRadius) {
              const sx = (e[0] * cx + e[4] * cy + e[8] * cz + e[12]) / cw;
              const sy = (e[1] * cx + e[5] * cy + e[9] * cz + e[13]) / cw;
              const rx = half * (Math.abs(e[0] - sx * e[3]) + Math.abs(e[4] - sx * e[7]) + Math.abs(e[8] - sx * e[11])) / (cw - wRadius);
              const ry = half * (Math.abs(e[1] - sy * e[3]) + Math.abs(e[5] - sy * e[7]) + Math.abs(e[9] - sy * e[11])) / (cw - wRadius);
              if ((Math.abs(sx - ndc.x) - rx) * width / 2 > radius || (Math.abs(sy - ndc.y) - ry) * height / 2 > radius) continue;
            }
            for (let i = heads[bin]; i >= 0; i = next[i]) {
              const px = positions[i * 3], py = positions[i * 3 + 1], pz = positions[i * 3 + 2];
              const w = e[3] * px + e[7] * py + e[11] * pz + e[15];
              if (w <= 0) continue;
              const sx = (e[0] * px + e[4] * py + e[8] * pz + e[12]) / w;
              const sy = (e[1] * px + e[5] * py + e[9] * pz + e[13]) / w;
              let pxDistance = (sx - (sweep ? sweep.from.x : ndc.x)) * width / 2;
              let pyDistance = (sy - (sweep ? sweep.from.y : ndc.y)) * height / 2;
              if (lengthSquared > 0) {
                const t = Math.max(0, Math.min(1, (pxDistance * dx + pyDistance * dy) / lengthSquared));
                pxDistance -= dx * t; pyDistance -= dy * t;
              }
              const distance = Math.hypot(pxDistance, pyDistance);
              const brushRadius = sweep ? sweep.radius : radius;
              if (distance < brushRadius) visit(i, 1 - distance / brushRadius);
            }
          }
    }
  }
}
