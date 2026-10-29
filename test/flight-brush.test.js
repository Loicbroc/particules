import test from "node:test";
import assert from "node:assert/strict";
import { FlightBrush } from "../src/flight-brush.js";

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
