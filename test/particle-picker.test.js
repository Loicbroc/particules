import test from "node:test";
import assert from "node:assert/strict";
import { BufferAttribute, BufferGeometry, Group, Matrix4, PerspectiveCamera, Points, Ray, Raycaster, Vector2, Vector3 } from "three";
import { OrbitView } from "../src/orbit-view.js";
import { ParticleField } from "../src/particle-field.js";
import { FlightBrush } from "../src/flight-brush.js";

function fixture() {
  const count = 6000, positions = new Float32Array(count * 3), seeds = new Float32Array(count * 4);
  let seed = 42;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (i % 100 + 0.5) / 100 * 3 - 1.5;
    positions[i * 3 + 1] = 1 - (Math.floor(i / 100) + 0.5) / 60 * 2;
    for (let a = 0; a < 4; a++) seeds[i * 4 + a] = random();
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setAttribute("aDepth", new BufferAttribute(new Float32Array(count).fill(0.5), 1));
  geometry.setAttribute("aRandom", new BufferAttribute(seeds, 4));
  const camera = new PerspectiveCamera(42, 1.5, 0.1, 80), group = new Group();
  group.scale.setScalar(1.2); group.position.set(0.7, 0.3, 0); group.updateMatrixWorld(true);
  const field = { camera, group, points: new Points(geometry),
    ndc: new Vector2(), raycaster: new Raycaster(), localRay: new Ray(), inverseMatrix: new Matrix4(), pickMatrix: new Matrix4(),
    uniforms: { uWorldScale: { value: 1.2 }, uDepth: { value: 0 }, uVolume: { value: 1.65 }, uWave: { value: 0 } }, currentTime: 0, interactionTime: 1 };
  ParticleField.prototype.rebuildPicker.call(field);
  return { field, orbit: new OrbitView(), positions, count, seeds };
}

test("random depths preserve the exact photograph when viewed from the original camera", () => {
  const { field, orbit, positions } = fixture();
  orbit.update(field.camera, field.group.position, 0);
  let min = Infinity, max = -Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    const flat = new Vector3(positions[i], positions[i + 1], 0).applyMatrix4(field.group.matrixWorld).project(field.camera);
    const volume = new Vector3().fromArray(field.picker.positions, i);
    min = Math.min(min, volume.z); max = Math.max(max, volume.z);
    volume.applyMatrix4(field.group.matrixWorld).project(field.camera);
    assert.ok(Math.hypot(volume.x - flat.x, volume.y - flat.y) < 0.000001);
  }
  assert.ok(max - min > 1.6);
});

test("volume hover matches an exhaustive screen-space check from the front, side and back", () => {
  const { field, orbit, count } = fixture();
  const positions = field.picker.positions;
  for (const yaw of [0, 0.8, Math.PI / 2, 2.7, Math.PI, -Math.PI / 2]) {
    orbit.yaw = orbit.targetYaw = yaw; orbit.pitch = orbit.targetPitch = 0.3;
    orbit.update(field.camera, field.group.position, 0);
    for (const index of [50, 3045, 5950]) {
      const point = new Vector3().fromArray(positions, index * 3).applyMatrix4(field.group.matrixWorld).project(field.camera);
      field.ndc.set(point.x, point.y);
      ParticleField.prototype.projectPointer.call(field);
      const actual = new Set(), expected = new Set();
      field.picker.query(field.localRay, field.pickMatrix, field.ndc, 1200, 800, 24, (i) => actual.add(i));
      for (let i = 0; i < count; i++) {
        const p = new Vector3().fromArray(positions, i * 3).applyMatrix4(field.group.matrixWorld).project(field.camera);
        if (Math.hypot((p.x - point.x) * 600, (p.y - point.y) * 400) < 24) expected.add(i);
      }
      assert.ok(actual.has(index), `missed hovered grain at ${yaw}`);
      assert.deepEqual(actual, expected, `wrong hover footprint at ${yaw}`);
    }
  }
});

test("a gesture from the side can lend momentum along the photograph's depth", () => {
  const { seeds, count } = fixture();
  const brush = new FlightBrush(100, 60, 1.5, Int32Array.from({ length: count }, (_, i) => i), seeds, () => 0);
  assert.equal(brush.kick(3045, 1, 0, 0, -6, 1, 0.02), true);
  assert.equal(brush.zData[3045], -6);
  assert.equal(brush.kick(3045, 1, 0, 0, 6, 2, 0.02), false);
  assert.equal(brush.zData[3045], -6);
});

test("one swept hover query covers a fast gesture without gaps or excess grains", () => {
  const { field, orbit, count } = fixture();
  orbit.yaw = orbit.targetYaw = 1.2;
  orbit.update(field.camera, field.group.position, 0);
  const from = new Vector2(-0.15, -0.08), to = new Vector2(0.3, 0.18);
  field.ndc.copy(from).add(to).multiplyScalar(0.5);
  ParticleField.prototype.projectPointer.call(field);
  const dx = (to.x - from.x) * 600, dy = (to.y - from.y) * 400;
  const actual = new Set(), expected = new Set(), radius = 24;
  field.picker.query(field.localRay, field.pickMatrix, field.ndc, 1200, 800,
    radius + Math.hypot(dx, dy) / 2, (i) => actual.add(i), { from, to, radius });
  for (let i = 0; i < count; i++) {
    const p = new Vector3().fromArray(field.picker.positions, i * 3).applyMatrix4(field.group.matrixWorld).project(field.camera);
    const x = (p.x - from.x) * 600, y = (p.y - from.y) * 400;
    const t = Math.max(0, Math.min(1, (x * dx + y * dy) / (dx * dx + dy * dy)));
    if (Math.hypot(x - dx * t, y - dy * t) < radius) expected.add(i);
  }
  assert.ok(actual.size > 0);
  assert.deepEqual(actual, expected);
});
