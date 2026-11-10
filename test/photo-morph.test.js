import test from "node:test";
import assert from "node:assert/strict";
import { remapCloud } from "../src/photo-morph.js";

test("photo transition resamples colours, positions and PNG alpha together", () => {
  const from = {
    position: new Float32Array([-2, 1, 0.2, 2, -1, -0.2]),
    color: new Float32Array([1, 0, 0, 0, 0, 1]),
    opacity: new Float32Array([0.25, 1]),
  };
  const result = remapCloud(from, 4, 0.5);
  assert.deepEqual([...result.color], [1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1]);
  assert.deepEqual([...result.opacity], [0.25, 0.25, 1, 1]);
  assert.equal(result.position[0], -1);
  assert.equal(result.position[6], 1);
  assert.equal(from.position[0], -2);
});

test("different particle budgets produce finite complete destination attributes", () => {
  const source = { position: new Float32Array([2, 3, 4]), color: new Float32Array([0.2, 0.5, 1]), opacity: new Float32Array([1]) };
  const result = remapCloud(source, 137);
  assert.equal(result.position.length, 411);
  assert.equal(result.opacity.length, 137);
  assert.ok([...result.position, ...result.color, ...result.opacity].every(Number.isFinite));
  assert.equal(result.position[410], 4);
});
