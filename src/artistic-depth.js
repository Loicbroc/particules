// A deliberately artistic fallback, not a semantic estimate of real distance.
// It needs no model, download or external service.
export function artisticDepthFromPixels(pixels, width, height) {
  if (pixels.length !== width * height * 4 || width < 1 || height < 1)
    throw new Error("Les pixels de la photo sont invalides.");
  const background = [0, 0, 0];
  let borderCount = 0;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      if (x > 1 && x < width - 2 && y > 1 && y < height - 2) continue;
      const i = (y * width + x) * 4;
      if (pixels[i + 3] < 16) continue;
      for (let c = 0; c < 3; c++) background[c] += pixels[i + c];
      borderCount++;
    }
  for (let c = 0; c < 3; c++) background[c] /= Math.max(1, borderCount);
  let values = new Float32Array(width * height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const u = (x + 0.5) / width,
        v = (y + 0.5) / height;
      const center = Math.exp(
        -(((u - 0.5) / 0.42) ** 2 + ((v - 0.48) / 0.56) ** 2),
      );
      const contrast =
        (Math.abs(pixels[i * 4] - background[0]) +
          Math.abs(pixels[i * 4 + 1] - background[1]) +
          Math.abs(pixels[i * 4 + 2] - background[2])) /
        765;
      values[i] =
        (0.18 + center * 0.32 + contrast * 0.38 + v * 0.12) *
        (pixels[i * 4 + 3] / 255);
    }
  // Smooth details into broad surfaces instead of turning image grain into spikes.
  for (let pass = 0; pass < 3; pass++) {
    const next = new Float32Array(values.length);
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        let sum = 0,
          count = 0;
        for (let dy = -2; dy <= 2; dy++)
          for (let dx = -2; dx <= 2; dx++) {
            const sx = Math.max(0, Math.min(width - 1, x + dx));
            const sy = Math.max(0, Math.min(height - 1, y + dy));
            sum += values[sy * width + sx];
            count++;
          }
        next[y * width + x] = sum / count;
      }
    values = next;
  }
  let min = Infinity,
    max = -Infinity;
  for (const value of values) {
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  const range = Math.max(0.001, max - min);
  const data = Uint8Array.from(values, (value) =>
    Math.round(((value - min) / range) * 255),
  );
  return { width, height, data };
}

export function createArtisticDepth(image) {
  const scale = Math.min(
    1,
    128 / Math.max(image.naturalWidth, image.naturalHeight),
  );
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx)
    throw new Error("Impossible de lire cette photo pour créer le relief.");
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  return artisticDepthFromPixels(
    ctx.getImageData(0, 0, canvas.width, canvas.height).data,
    canvas.width,
    canvas.height,
  );
}
