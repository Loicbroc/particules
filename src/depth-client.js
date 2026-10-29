export class DepthEstimator {
  constructor() {
    this.worker = null;
    this.request = null;
    this.sequence = 0;
  }

  estimate(image, onProgress) {
    this.cancel();
    const maxSide = 768;
    const scale = Math.min(
      1,
      maxSide / Math.max(image.naturalWidth, image.naturalHeight),
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx)
      return Promise.reject(new Error("Impossible de préparer cette photo."));
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const worker = (this.worker = new Worker("/depth-worker.js", {
      type: "module",
    }));
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const finish = (error, map) => {
        if (this.request?.id !== id) return;
        clearTimeout(this.request.timer);
        this.request = null;
        worker.terminate();
        if (this.worker === worker) this.worker = null;
        if (error) reject(error);
        else resolve(map);
      };
      const timer = setTimeout(
        () =>
          finish(
            new Error(
              "Le calcul du relief a pris trop de temps. Vous pouvez réessayer.",
            ),
          ),
        180000,
      );
      this.request = { id, timer, reject };
      worker.onmessage = ({ data }) => {
        if (data.id !== id) return;
        if (data.type === "progress") onProgress?.(data);
        else if (data.type === "result")
          finish(null, {
            width: data.width,
            height: data.height,
            data: new Uint8Array(data.pixels),
          });
        else if (data.type === "error") finish(new Error(data.message));
      };
      worker.onerror = (event) =>
        finish(
          new Error(
            event.message ||
              "Le module de calcul local du relief n’a pas pu démarrer.",
          ),
        );
      worker.postMessage(
        {
          id,
          width: canvas.width,
          height: canvas.height,
          pixels: pixels.buffer,
        },
        [pixels.buffer],
      );
    });
  }

  cancel() {
    if (this.request) {
      clearTimeout(this.request.timer);
      this.request.reject(new DOMException("Calcul annulé", "AbortError"));
      this.request = null;
    }
    this.worker?.terminate();
    this.worker = null;
  }
}
