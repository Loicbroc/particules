import test from "node:test";
import assert from "node:assert/strict";
import { sampleDepth, validateDepthMap, waveHeight } from "../src/surface-effects.js";
import { DustStorm, STORM_RETURN_DURATION, stormEnvelope, stormCurrent } from "../src/dust-storm.js";

test("depth interpolation respects image corners and the neutral fallback", () => {
  const map = { width: 2, height: 2, data: new Uint8Array([0, 255, 255, 0]) };
  assert.equal(sampleDepth(map, 0, 0), 0);
  assert.equal(sampleDepth(map, 1, 0), 1);
  assert.equal(sampleDepth(map, 0.5, 0.5), 0.5);
  assert.equal(sampleDepth(null, 0, 0), 0.5);
  assert.throws(() => validateDepthMap({ width: 2, height: 2, data: [0] }));
});

test("the storm continues until explicitly stopped, then returns smoothly to the photograph", () => {
  assert.equal(stormEnvelope(-1), 0);
  assert.equal(stormEnvelope(0), 0);
  assert.ok(stormEnvelope(0.4) > 0 && stormEnvelope(0.4) < 1);
  assert.equal(stormEnvelope(1), 1);
  assert.equal(stormEnvelope(9), 1);
  assert.equal(stormEnvelope(14), 1);
  assert.equal(stormEnvelope(86400), 1);
  assert.ok(stormEnvelope(0.001) < 0.00001);
  const storm = new DustStorm();
  storm.start(10);
  for (const time of [24, 70, 3610, 86410]) {
    assert.equal(storm.sample(time).active, true);
    assert.equal(storm.sample(time).amount, 1);
  }
  assert.equal(storm.stop(86410), true);
  assert.equal(storm.running, false);
  assert.equal(storm.sample(86410).amount, 1);
  assert.equal(storm.sample(86410 + STORM_RETURN_DURATION / 2).stopping, true);
  assert.ok(storm.sample(86410 + STORM_RETURN_DURATION / 2).amount < 1);
  assert.equal(storm.sample(86410 + STORM_RETURN_DURATION + 0.001).amount, 0);
  assert.equal(storm.sample(86410 + STORM_RETURN_DURATION + 0.001).active, false);
});

test("stopping during takeoff cannot increase the dust displacement or restart its return", () => {
  const storm = new DustStorm();
  assert.equal(storm.sample(0).active, false);
  storm.start(0);
  const before = storm.sample(0.3).amount;
  storm.stop(0.3);
  assert.equal(storm.sample(0.3).amount, before);
  assert.ok(storm.sample(0.4).amount < before);
  assert.equal(storm.stop(0.5), false);
  assert.equal(storm.sample(3).amount, 0);
  storm.start(4);
  assert.equal(storm.sample(4).amount, 0);
  assert.equal(storm.running, true);
  storm.reset();
  assert.equal(storm.sample(100).active, false);
});

test("currents accelerate and decelerate continuously with distinct gust patterns", () => {
  const speed = (t, lane) => (stormCurrent(t + 0.001, lane).angle - stormCurrent(t, lane).angle) / 0.001;
  for (let lane = 0; lane < 3; lane++) {
    const speeds = Array.from({ length: 120 }, (_, i) => speed(i / 10, lane));
    assert.ok(Math.max(...speeds) > Math.min(...speeds) * 2, "constant-speed current");
    let rises = 0, falls = 0;
    speeds.slice(1).forEach((value, i) => { if (value > speeds[i]) rises++; else falls++; });
    assert.ok(rises > 10 && falls > 10, "gusts must both accelerate and decelerate");
    assert.ok(Math.abs(speed(3, lane) - speed(3.001, lane)) < 0.02, "discontinuous momentum");
  }
  assert.notEqual(stormCurrent(3, 0).gust, stormCurrent(3, 1).gust);
  assert.notEqual(stormCurrent(3, 0, 0).angle, stormCurrent(3, 0, 2).angle);
});

test("the storm clock is reproducible after pause and reduces motion when requested", () => {
  const paused = stormCurrent(3, 1, 0.7);
  for (let i = 0; i < 120; i++) assert.deepEqual(stormCurrent(3, 1, 0.7), paused);
  const reduced = stormCurrent(6, 1, 0.7, true), slow = stormCurrent(1.8, 1, 0.7);
  assert.ok(Math.abs(reduced.angle - slow.angle) < 1e-12);
  assert.ok(Math.abs(reduced.gust - slow.gust) < 1e-12);
});

test("the wave propagates across the image and vanishes at zero intensity", () => {
  assert.equal(Math.abs(waveHeight(0.3, 0.5, 1, 0)), 0);
  assert.notEqual(waveHeight(0.3, 0.5, 1, 0.4), waveHeight(0.3, 0.5, 2, 0.4));
});

