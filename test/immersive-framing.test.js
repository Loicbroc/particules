import test from "node:test";
import assert from "node:assert/strict";
import { Group, PerspectiveCamera, Vector2 } from "three";
import { ParticleField } from "../src/particle-field.js";

test("hiding the interface centres and expands the frame, and restoring it recovers the original view", (t) => {
  const originalDocument = globalThis.document;
  t.after(() => { globalThis.document = originalDocument; });
  let hidden = false;
  globalThis.document = {
    body: { classList: { contains: () => hidden } },
    querySelector: (selector) => ({ getBoundingClientRect: () =>
      selector === ".header" ? { bottom: 100 } : selector === ".scene-status" ? { bottom: 120 } : { top: 700 } }),
  };
  for (const width of [390, 1280]) {
    const cameraState = { yaw: 1.2, pitch: 0.3, zoom: 2, pan: [1, 2, 0] };
    const field = { container: { getBoundingClientRect: () => ({ width, height: 800, top: 0 }) },
      renderer: { setSize() {} }, camera: new PerspectiveCamera(42, 1, 0.002, 80), group: new Group(),
      aspect: width === 390 ? 0.4 : 1.5, gridWidth: 400, orbit: cameraState,
      uniforms: { uViewport: { value: new Vector2() }, uWorldScale: {}, uCenter: { value: new Vector2() }, uSize: {} } };
    hidden = false;
    ParticleField.prototype.resize.call(field);
    const normal = { scale: field.baseScale, position: field.group.position.clone() };
    hidden = true;
    ParticleField.prototype.resize.call(field);
    assert.ok(field.baseScale > normal.scale, `unused space at width ${width}`);
    assert.equal(field.group.position.x, 0);
    assert.equal(field.group.position.y, 0);
    assert.deepEqual(field.orbit, cameraState);
    hidden = false;
    ParticleField.prototype.resize.call(field);
    assert.equal(field.baseScale, normal.scale);
    assert.deepEqual(field.group.position, normal.position);
  }
});
