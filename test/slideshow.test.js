import test from "node:test";
import assert from "node:assert/strict";
import { Slideshow, slideshowPhotos } from "../src/slideshow.js";

test("each fully formed photo receives its complete delay, outside its transition", () => {
  const show = new Slideshow(5);
  show.start();
  assert.equal(show.advance(8, false), false); // image formation
  assert.equal(show.advance(8, true), false); // first visible frame after a long load
  assert.equal(show.advance(4.9, true), false);
  assert.equal(show.advance(0.1, true), true);
  assert.equal(show.advance(3.6, false), false); // morph to the next image
  assert.equal(show.advance(0.05, true), false);
  assert.equal(show.advance(4.9, true), false);
  assert.equal(show.advance(0.1, true), true);
});

test("pause, hidden tabs and a storm cannot accumulate or catch up slideshow advances", () => {
  const show = new Slideshow(8);
  show.start();
  show.advance(0, true);
  show.advance(3, true);
  show.advance(120, false);
  assert.equal(show.remaining, 5);
  show.hold();
  assert.equal(show.advance(3600, true), false);
  assert.equal(show.advance(4, true), false);
  assert.equal(show.advance(1, true), true);
  assert.equal(show.advance(100, true), false);
  assert.equal(show.advance(100, true), true); // one advance, never a queue
});

test("changing delay or choosing a photo starts a fresh interval, and Stop prevents later advances", () => {
  const show = new Slideshow(8);
  show.start(); show.advance(0, true); show.advance(7, true);
  show.setDelay(3);
  show.advance(0, true);
  assert.equal(show.advance(2.9, true), false);
  assert.equal(show.advance(0.1, true), true);
  show.advance(0, true); show.advance(2, true);
  show.resetDelay();
  show.advance(0, true);
  assert.equal(show.advance(2, true), false);
  show.stop();
  assert.equal(show.advance(300, true), false);
  assert.equal(show.running, false);
});

test("delay input stays bounded and invalid or empty values keep the last setting", () => {
  const show = new Slideshow();
  show.setDelay(0); assert.equal(show.delay, 1);
  show.setDelay(999); assert.equal(show.delay, 300);
  show.setDelay("12"); assert.equal(show.delay, 12);
  for (const value of ["", " ", "invalid", NaN, Infinity]) {
    assert.equal(show.setDelay(value), false);
    assert.equal(show.delay, 12);
  }
});

test("the slideshow preserves imported photo order and excludes the demonstration", () => {
  const a = { name: "A" }, b = { name: "B", isDemo: false }, demo = { isDemo: true };
  const gallery = [a, demo, b];
  assert.deepEqual(slideshowPhotos(gallery), [a, b]);
  assert.deepEqual(gallery, [a, demo, b]);
});
