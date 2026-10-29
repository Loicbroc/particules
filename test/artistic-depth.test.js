import test from "node:test";
import assert from "node:assert/strict";
import { artisticDepthFromPixels } from "../src/artistic-depth.js";

test("the offline relief produces a smooth normalized map with the original proportions", () => {
  const width = 32,
    height = 24;
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const subject = x > 9 && x < 23 && y > 4 && y < 21;
      pixels[i] = pixels[i + 1] = pixels[i + 2] = subject ? 220 : 30;
      pixels[i + 3] = 255;
    }
  const map = artisticDepthFromPixels(pixels, width, height);
  assert.equal(map.width, width);
  assert.equal(map.height, height);
  assert.equal(map.data.length, width * height);
  assert.ok(map.data[12 * width + 16] > map.data[2 * width + 2]);
  assert.ok(
    [...map.data].every(
      (value) => Number.isFinite(value) && value >= 0 && value <= 255,
    ),
  );
});

test("transparent and single-pixel images keep a valid finite map", () => {
  const map = artisticDepthFromPixels(
    new Uint8ClampedArray([0, 0, 0, 0]),
    1,
    1,
  );
  assert.equal(map.data.length, 1);
  assert.equal(map.data[0], 0);
  assert.throws(() => artisticDepthFromPixels(new Uint8ClampedArray(3), 1, 1));
});
