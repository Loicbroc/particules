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

test("camera dolly can enter the cloud and retreat well beyond the old zoom stops", () => {
  const camera = new PerspectiveCamera(42, 1.5, 0.002, 80), pivot = new Vector3();
  const orbit = new OrbitView();
  orbit.setZoomLevel(10);
  for (let i = 0; i < 160; i++) orbit.update(camera, pivot, 1 / 60);
  assert.ok(camera.position.distanceTo(pivot) < 0.001);
  orbit.setZoomLevel(-8);
  for (let i = 0; i < 160; i++) orbit.update(camera, pivot, 1 / 60);
  assert.ok(camera.position.distanceTo(pivot) > 20000);
  assert.ok(camera.far > camera.position.distanceTo(pivot));
});

test("Home restores the original view after dolly and movement through the cloud", () => {
  const camera = new PerspectiveCamera(42, 1.5, 0.002, 80), pivot = new Vector3(0.7, 0.2, 0);
  const orbit = new OrbitView();
  orbit.drag(100, -30); orbit.zoomBy(3);
  orbit.panBy(80, 40, 0.02);
  for (let i = 0; i < 160; i++) orbit.update(camera, pivot, 1 / 60);
  assert.ok(camera.position.distanceTo(pivot) < 3);
  orbit.home();
  for (let i = 0; i < 160; i++) orbit.update(camera, pivot, 1 / 60);
  assert.ok(camera.position.distanceTo(new Vector3(0, 0, 7)) < 0.00001);
  assert.ok(camera.quaternion.angleTo(new Quaternion()) < 0.00001);
  assert.equal(orbit.zoomLevel, 0);
  assert.equal(orbit.pan.length(), 0);
});
