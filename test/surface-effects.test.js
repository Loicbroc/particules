import test from "node:test";
import assert from "node:assert/strict";
import { explosionEnvelope, sampleDepth, validateDepthMap, waveHeight } from "../src/surface-effects.js";

test("depth interpolation respects image corners and the neutral fallback", () => {
  const map = { width: 2, height: 2, data: new Uint8Array([0, 255, 255, 0]) };
  assert.equal(sampleDepth(map, 0, 0), 0);
  assert.equal(sampleDepth(map, 1, 0), 1);
  assert.equal(sampleDepth(map, 0.5, 0.5), 0.5);
  assert.equal(sampleDepth(null, 0, 0), 0.5);
  assert.throws(() => validateDepthMap({ width: 2, height: 2, data: [0] }));
});

test("the explosion starts at rest, expands, and restores the photo", () => {
  assert.equal(explosionEnvelope(-1), 0);
  assert.equal(explosionEnvelope(0), 0);
  assert.ok(explosionEnvelope(0.4) > 0 && explosionEnvelope(0.4) < 1);
  assert.equal(explosionEnvelope(1), 1);
  assert.ok(explosionEnvelope(3) < explosionEnvelope(2));
  assert.equal(explosionEnvelope(5.8), 0);
});

test("the wave propagates across the image and vanishes at zero intensity", () => {
  assert.equal(Math.abs(waveHeight(0.3, 0.5, 1, 0)), 0);
  assert.notEqual(waveHeight(0.3, 0.5, 1, 0.4), waveHeight(0.3, 0.5, 2, 0.4));
});

