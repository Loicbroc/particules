import test from "node:test";
import assert from "node:assert/strict";
import { FlightBrush, updateFlowVelocity } from "../src/flight-brush.js";

function fixture() {
  let seed = 42;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const width = 80;
  const indices = Int32Array.from({ length: width * width }, (_, i) => i);
  const seeds = Float32Array.from({ length: indices.length * 4 }, random);
  return new FlightBrush(width, width, 1, indices, seeds, random);
}

function active(brush) {
  const result = [];
  for (let i = 0; i < brush.data.length; i += 4) {
    if (brush.data[i + 1] > 0) result.push(i);
  }
  return result;
}

test("the approach launches a staggered subset of nearby particles", () => {
  const brush = fixture();
  const changed = brush.stamp(0, 0, 1, -1, 0, 1 / 60, 0.4);
  const launched = active(brush);
  assert.ok(changed);
  assert.ok(launched.length > 0 && launched.length < 100);
  for (const offset of launched) {
    const cell = offset / 4;
    const x = ((cell % 80) + 0.5) / 40 - 1;
    const y = 1 - (Math.floor(cell / 80) + 0.5) / 40;
    assert.ok(Math.hypot(x, y) < 0.4);
  }
});

test("continued hovering does not restart or snap back an airborne particle", () => {
  const brush = fixture();
  brush.stamp(0, 0, 1, 0, 1, 0.05, 0.4);
  const launched = active(brush);
  const before = new Float32Array(brush.data);
  for (let frame = 1; frame <= 30; frame++) {
    brush.stamp(0, 0, -1, 1, 1 + frame / 60, 1 / 60, 0.4);
  }
  for (const offset of launched) {
    assert.deepEqual(brush.data.slice(offset, offset + 4), before.slice(offset, offset + 4));
  }
});

test("moving away retains the flight records and leaves distant particles untouched", () => {
  const brush = fixture();
  brush.stamp(0, 0, 1, 0, 1, 0.05, 0.4);
  const before = new Float32Array(brush.data);
  assert.equal(brush.stamp(5, 5, 0, 0, 2, 1 / 60, 0.4), null);
  assert.deepEqual(brush.data, before);
});

test("transparent image cells do not create phantom flying particles", () => {
  const brush = fixture();
  brush.cellIndices.fill(-1);
  assert.equal(brush.stamp(0, 0, 1, 1, 1, 1, 1), null);
  assert.equal(active(brush).length, 0);
});

test("a fast sweep launches more grains and lends them the gesture's direction", () => {
  const slow = fixture(), fast = fixture();
  slow.stamp(0, 0, 0.1, 0, 1, 0.05, 0.4);
  fast.stamp(0, 0, -6, 2, 1, 0.05, 0.4);
  assert.ok(active(fast).length > active(slow).length);
  for (const offset of active(fast)) {
    assert.equal(fast.data[offset + 2], -6);
    assert.equal(fast.data[offset + 3], 2);
  }
});

test("an extreme diagonal gesture is bounded without changing its direction", () => {
  const brush = fixture();
  brush.stamp(0, 0, 30, 40, 1, 0.05, 0.4);
  for (const offset of active(brush)) {
    const x = brush.data[offset + 2], y = brush.data[offset + 3];
    assert.ok(Math.abs(Math.hypot(x, y) - 9) < 0.00001);
    assert.ok(Math.abs(x / y - 0.75) < 0.00001);
  }
});

test("velocity filtering preserves momentum and behaves consistently at 60 and 120 Hz", () => {
  const simulate = (fps) => {
    const velocity = { x: 0, y: 0 };
    for (let i = 0; i < fps / 2; i++) updateFlowVelocity(velocity, 4 / fps, -2 / fps, 1 / fps);
    return velocity;
  };
  const a = simulate(60), b = simulate(120);
  assert.ok(Math.abs(a.x - b.x) < 0.00001);
  assert.ok(Math.abs(a.y - b.y) < 0.00001);
  updateFlowVelocity(a, 0, 0, 1 / 60);
  assert.ok(a.x > 2 && a.x < b.x);
  assert.ok(a.y < 0);
});
