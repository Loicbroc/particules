export function slideshowPhotos(gallery) {
  return gallery.filter((photo) => !photo.isDemo);
}

// Count only time spent displaying a completed photo. This uses the render
// clock instead of timers, so pause and background tabs cannot queue advances.
export class Slideshow {
  constructor(delay = 8) {
    this.running = false;
    this.setDelay(delay);
  }
  setDelay(value) {
    if (typeof value === "string" && !value.trim()) return false;
    const number = Number(value);
    if (!Number.isFinite(number)) return false;
    this.delay = Math.max(1, Math.min(300, Math.round(number)));
    this.resetDelay();
    return true;
  }
  resetDelay() { this.elapsed = 0; this.armed = false; }
  hold() { this.armed = false; }
  start() { this.running = true; this.resetDelay(); }
  stop() { this.running = false; this.resetDelay(); }
  get remaining() { return Math.max(0, Math.ceil(this.delay - this.elapsed)); }
  advance(seconds, ready) {
    if (!this.running || !ready) { this.hold(); return false; }
    if (!this.armed) { this.armed = true; return false; }
    if (!Number.isFinite(seconds) || seconds <= 0) return false;
    this.elapsed += seconds;
    if (this.elapsed + 1e-9 < this.delay) return false;
    this.resetDelay();
    return true;
  }
}
