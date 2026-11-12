import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { Slideshow, slideshowPhotos } from "../src/slideshow.js";
import { DustStorm } from "../src/dust-storm.js";
import { ParticleField } from "../src/particle-field.js";
import { morphDuration } from "../src/photo-morph.js";

// Run the actual UI handlers and frame loop with the renderer replaced. These
// tests cover playback coordination without requiring a WebGL-capable browser.
function fixture() {
  const nodes = new Map();
  const element = (id = "") => {
    const classes = new Set(), attributes = new Map(), handlers = new Map();
    return { id, dataset: {}, hidden: false, disabled: false, value: "8", min: "0", max: "100", open: false,
      children: [], style: { setProperty() {} },
      classList: { toggle(name, on) { if (on) classes.add(name); else classes.delete(name); },
        add(name) { classes.add(name); }, remove(name) { classes.delete(name); }, contains(name) { return classes.has(name); } },
      setAttribute(name, value) { attributes.set(name, value); }, getAttribute(name) { return attributes.get(name); },
      append(child) { this.children.push(child); }, replaceChildren() { this.children = []; }, closest() { return null; },
      addEventListener(name, handler) { handlers.set(name, handler); },
      emit(name) { handlers.get(name)?.({ target: this }); }, focus() {},
    };
  };
  const $ = (id) => { if (!nodes.has(id)) nodes.set(id, element(id)); return nodes.get(id); };
  const document = { getElementById: $, querySelectorAll: () => [], querySelector: () => $("timeline"),
    createElement: () => element(), addEventListener() {} };
  let now = 0;
  const source = readFileSync(new URL("../src/main.js", import.meta.url), "utf8")
    .replace(/^import .*;\n/gm, "").replace(/void start\(\);\s*$/, "") +
    "\nglobalThis.app = { state, slideshow, setupUI, renderGallery, updateUI, tick, setField(value) { field = value; } };";
  const context = vm.createContext({ document, window: { addEventListener() {} },
    matchMedia: () => ({ matches: false }), navigator: { hardwareConcurrency: 8 }, innerWidth: 1280,
    performance: { now: () => now }, requestAnimationFrame: () => 1,
    setTimeout: () => 1, clearTimeout() {}, console,
    Slideshow, slideshowPhotos, morphDuration, DepthEstimator: class { cancel() {} } });
  vm.runInContext(source, context);
  const { app } = context;
  const field = Object.assign(Object.create(ParticleField.prototype), {
    storm: new DustStorm(), currentTime: 0, windStart: -100, points: {}, count: 100,
    pointerActive: 0, orbitDragging: false, orbit: { settled: true }, effects: { wave: false },
    interactionTime: 0, lastFlightTime: -100,
    uniforms: { uProgress: { value: 1 }, uMorph: { value: 1 }, uDrift: { value: 0 } },
    clearPointer() {}, setZoom() {}, adaptResolution() { return false; },
    setImage(image, count, { morph } = {}) { this.uniforms.uMorph.value = morph ? 0 : 1; },
    render(delta, time) { this.currentTime = time; },
  });
  app.setField(field);
  app.setupUI();
  const photo = (name, isDemo = false) => ({ name, isDemo, image: {}, url: name, width: 100, height: 80 });
  const demo = photo("Example", true), a = photo("A"), b = photo("B");
  Object.assign(app.state, { image: a, progress: 1, gallery: [demo, a, b] });
  app.renderGallery(); app.updateUI();
  const advance = (milliseconds) => {
    const end = now + milliseconds;
    while (now < end) { now += Math.min(50, end - now); app.tick(now); }
  };
  return { app, field, $, a, b, demo, advance };
}

test("slideshow UI changes photos in a loop after the full viewing delay and keeps settings open", () => {
  const { app, $, a, b, advance } = fixture();
  $("slideshow-delay").value = "1"; $("slideshow-delay").emit("change");
  $("controls").classList.add("open");
  $("slideshow-button").emit("click");
  advance(950); assert.equal(app.state.image, a);
  advance(250); assert.equal(app.state.image, b);
  assert.ok(app.state.morph);
  assert.equal($("controls").classList.contains("open"), true);
  advance(3500); assert.equal(app.state.morph, null);
  advance(800); assert.equal(app.state.image, b);
  advance(350); assert.equal(app.state.image, a);
  $("slideshow-button").emit("click");
  advance(12000); assert.equal(app.state.image, a);
});

test("the shared Pause button suspends photo playback and resumes its remaining delay", () => {
  const { app, $, a, b, advance } = fixture();
  $("slideshow-delay").value = "1"; $("slideshow-delay").emit("change");
  $("slideshow-button").emit("click");
  advance(500);
  $("pause-button").emit("click");
  advance(5000); assert.equal(app.state.image, a);
  $("pause-button").emit("click");
  advance(700); assert.equal(app.state.image, b);
});

test("a storm can be stopped during a photo morph and remains active until that decision", () => {
  const { app, field, $, advance } = fixture();
  $("burst-button").emit("click");
  advance(30000);
  assert.equal(field.stormRunning, true);
  assert.equal(field.exploding, true);
  app.state.morph = { elapsed: 0, seconds: 3.6 };
  app.updateUI();
  assert.equal($("burst-button").disabled, false);
  $("burst-button").emit("click");
  assert.equal(field.stormRunning, false);
  assert.equal(field.stormStopping, true);
  advance(2500); assert.equal(field.exploding, false);
});

test("removing a photo stops playback when fewer than two imported photos remain", () => {
  const { app, $ } = fixture();
  $("slideshow-button").emit("click");
  $("remove-photo").emit("click");
  assert.equal(app.slideshow.running, false);
  assert.equal($("slideshow-button").disabled, true);
});

test("starting the viewer calms an active storm before counting the photo delay", () => {
  const { app, field, $, a, b, advance } = fixture();
  $("slideshow-delay").value = "1"; $("slideshow-delay").emit("change");
  $("burst-button").emit("click");
  advance(20000);
  $("slideshow-button").emit("click");
  assert.equal(field.stormRunning, false);
  assert.equal(field.stormStopping, true);
  advance(2500); assert.equal(app.state.image, a);
  advance(900); assert.equal(app.state.image, b);
});

test("starting during a transition to the example never includes it in the playlist", () => {
  const { app, $, a, demo, advance } = fixture();
  app.state.image = demo;
  app.state.morph = { elapsed: 0, seconds: 3.6 };
  $("slideshow-button").emit("click");
  advance(3700);
  assert.equal(app.state.image, a);
  assert.equal(app.slideshow.elapsed, 0);
});
