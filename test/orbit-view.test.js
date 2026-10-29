import test from "node:test";
import assert from "node:assert/strict";
import { PerspectiveCamera, Quaternion, Vector3 } from "three";
import { OrbitView } from "../src/orbit-view.js";

test("orbit travels around the photograph and Home restores the exact original camera", () => {
  const camera = new PerspectiveCamera(42, 1.5, 0.1, 80);
  const pivot = new Vector3(0.7, 0.3, 0), orbit = new OrbitView();
  orbit.drag(-700, 90);
  for (let i = 0; i < 90; i++) orbit.update(camera, pivot, 1 / 60);
  assert.ok(camera.position.z < 0);
  assert.ok(Math.abs(camera.position.distanceTo(pivot) - new Vector3(0, 0, 7).distanceTo(pivot)) < 0.00001);
  orbit.home();
  for (let i = 0; i < 160; i++) orbit.update(camera, pivot, 1 / 60);
  assert.ok(camera.position.distanceTo(new Vector3(0, 0, 7)) < 0.00001);
  assert.ok(camera.quaternion.angleTo(new Quaternion()) < 0.00001);
});
