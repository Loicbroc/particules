const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function sampleDepth(map, u, v) {
  if (!map) return 0.5;
  const x = clamp(u, 0, 1) * (map.width - 1);
  const y = clamp(v, 0, 1) * (map.height - 1);
  const x0 = Math.floor(x),
    y0 = Math.floor(y);
  const x1 = Math.min(x0 + 1, map.width - 1);
  const y1 = Math.min(y0 + 1, map.height - 1);
  const tx = x - x0,
    ty = y - y0;
  const top =
    map.data[y0 * map.width + x0] * (1 - tx) +
    map.data[y0 * map.width + x1] * tx;
  const bottom =
    map.data[y1 * map.width + x0] * (1 - tx) +
    map.data[y1 * map.width + x1] * tx;
  return (top * (1 - ty) + bottom * ty) / 255;
}

export function waveHeight(x, y, time, amplitude) {
  return Math.sin(x * 3.2 + y * 1.1 - time * 1.65) * amplitude;
}

export function validateDepthMap(map) {
  if (
    !Number.isInteger(map?.width) ||
    !Number.isInteger(map?.height) ||
    map.width < 1 ||
    map.height < 1 ||
    !map.data ||
    map.data.length !== map.width * map.height
  ) {
    throw new Error("La carte de profondeur est invalide.");
  }
  return map;
}
