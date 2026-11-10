// Resample the departing cloud onto the next cloud's particle count. Keeping
// spatial order avoids a flash while allowing different sizes and PNG masks.
export function remapCloud(source, count, scale = 1) {
  const oldCount = source.opacity.length;
  if (!oldCount || count < 1) throw new Error("Nuage de particules vide.");
  const position = new Float32Array(count * 3);
  const color = new Float32Array(count * 3);
  const opacity = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const from = Math.min(oldCount - 1, Math.floor(i * oldCount / count));
    for (let axis = 0; axis < 3; axis++) {
      position[i * 3 + axis] = source.position[from * 3 + axis] * scale;
      color[i * 3 + axis] = source.color[from * 3 + axis];
    }
    opacity[i] = source.opacity[from];
  }
  return { position, color, opacity };
}

export function morphDuration(reducedMotion) {
  return reducedMotion ? 0.65 : 3.6;
}
