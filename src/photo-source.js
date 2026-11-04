// Particle sampling needs far fewer pixels than a phone's original photograph.
// Keep a local, bounded working copy instead of retaining eight full decodes.
export async function preparePhoto(source, name, isDemo = false) {
  const ownedURL = typeof source !== "string";
  let url = ownedURL ? URL.createObjectURL(source) : source;
  const image = new Image();
  try {
    image.src = url;
    await image.decode();
    const width = image.naturalWidth, height = image.naturalHeight;
    const scale = Math.min(1, 1600 / Math.max(width, height));
    if (ownedURL && scale < 1) {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", 0.94));
        if (blob) {
          const nextURL = URL.createObjectURL(blob);
          const resized = new Image();
          resized.src = nextURL;
          try {
            await resized.decode();
            image.src = "";
            URL.revokeObjectURL(url);
            url = nextURL;
            return { image: resized, url, name, isDemo, ownedURL, width, height };
          } catch { URL.revokeObjectURL(nextURL); }
        }
      }
    }
    return { image, url, name, isDemo, ownedURL, width, height };
  } catch (error) {
    if (ownedURL) URL.revokeObjectURL(url);
    throw error;
  }
}
