import { BufferAttribute, BufferGeometry, Group, Matrix4, PerspectiveCamera, Points, Ray, Raycaster, Vector2 } from "three";
import { ParticleField } from "../src/particle-field.js";

const count = 240000;
const positions = new Float32Array(count * 3), seeds = new Float32Array(count * 4);
let seed = 42;
for (let i = 0; i < count; i++) {
  positions[i * 3] = (i % 600 + 0.5) / 600 * 3 - 1.5;
  positions[i * 3 + 1] = 1 - (Math.floor(i / 600) + 0.5) / 400 * 2;
  for (let a = 0; a < 4; a++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    seeds[i * 4 + a] = seed / 4294967296;
  }
}
const geometry = new BufferGeometry();
geometry.setAttribute("position", new BufferAttribute(positions, 3));
geometry.setAttribute("aDepth", new BufferAttribute(new Float32Array(count).fill(0.5), 1));
geometry.setAttribute("aRandom", new BufferAttribute(seeds, 4));
const camera = new PerspectiveCamera(42, 1.5, 0.002, 80), group = new Group();
camera.position.set(0, 0, 7); group.scale.setScalar(1.2); group.updateMatrixWorld(true);
const field = { camera, group, points: new Points(geometry), ndc: new Vector2(),
  raycaster: new Raycaster(), localRay: new Ray(), inverseMatrix: new Matrix4(), pickMatrix: new Matrix4(),
  uniforms: { uWorldScale: { value: 1.2 }, uDepth: { value: 0 }, uVolume: { value: 1.65 }, uWave: { value: 0.35 } },
  currentTime: 0, interactionTime: 1 };
for (let i = 0; i < 5; i++) ParticleField.prototype.rebuildPicker.call(field);
const start = performance.now();
for (let i = 0; i < 30; i++) ParticleField.prototype.rebuildPicker.call(field);
const rebuildMs = (performance.now() - start) / 30;
ParticleField.prototype.projectPointer.call(field);
const queryStart = performance.now();
let hits = 0;
for (let i = 0; i < 120; i++) {
  field.picker.query(field.localRay, field.pickMatrix, field.ndc, 1200, 800, 54,
    () => hits++, null, { wave: 0.35, time: i / 60, source: positions });
}
console.log(JSON.stringify({ count, rebuildMs: +rebuildMs.toFixed(3), queryMs: +((performance.now() - queryStart) / 120).toFixed(3), hitsPerQuery: Math.round(hits / 120) }));
