import test from "node:test";
import assert from "node:assert/strict";
import { Group, Matrix4, PerspectiveCamera, Ray, Raycaster, Vector2, Vector3 } from "three";
import { ParticleField } from "../src/particle-field.js";
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

test("pointer picking stays aligned with a tilted depth surface", () => {
  const camera = new PerspectiveCamera(42, 1.5, 0.1, 80);
  camera.position.z = 7;
  camera.updateMatrixWorld();
  const group = new Group();
  group.position.set(0.7, 0.2, 0);
  group.scale.setScalar(1.6);
  group.rotation.set(0.06, -0.12, 0);
  group.updateMatrixWorld(true);
  const x = 0.3, y = -0.2, depth = (180 / 255 - 0.5) * 0.7;
  const point = new Vector3(x * (1 - depth * 1.6 / 7) - 0.7 * depth / 7, y * (1 - depth * 1.6 / 7) - 0.2 * depth / 7, depth);
  point.applyMatrix4(group.matrixWorld).project(camera);
  const field = {
    camera, group, ndc: new Vector2(point.x, point.y), raycaster: new Raycaster(), localRay: new Ray(), inverseMatrix: new Matrix4(),
    depthMap: { width: 1, height: 1, data: new Uint8Array([180]) }, aspect: 1.5, currentTime: 0,
    uniforms: { uWorldScale: { value: 1.6 }, uDepth: { value: 0.7 }, uWave: { value: 0 } }, pointerTarget: new Vector2(),
  };
  ParticleField.prototype.projectPointer.call(field);
  assert.ok(field.pointerTarget.distanceTo(new Vector2(x, y)) < 0.0001);
});
