// Only model files are downloaded. The photograph stays in this worker.
self.onmessage = async ({ data: { id, width, height, pixels } }) => {
  try {
    self.postMessage({ id, type: "progress", stage: "loading" });
    const { pipeline, RawImage, env } =
      await import("https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/transformers.min.js");
    env.allowLocalModels = false;
    env.backends.onnx.wasm.numThreads = 1;
    env.backends.onnx.wasm.proxy = false;
    const estimator = await pipeline(
      "depth-estimation",
      "onnx-community/depth-anything-v2-small",
      {
        dtype: "q8",
        device: "wasm",
        progress_callback: (progress) => {
          if (
            progress.status === "progress" &&
            progress.file?.endsWith(".onnx")
          ) {
            self.postMessage({
              id,
              type: "progress",
              stage: "downloading",
              progress: progress.progress,
            });
          }
        },
      },
    );
    self.postMessage({ id, type: "progress", stage: "computing" });
    const image = new RawImage(new Uint8ClampedArray(pixels), width, height, 4);
    const { depth } = await estimator(image);
    const result = depth.data.slice();
    self.postMessage(
      {
        id,
        type: "result",
        width: depth.width,
        height: depth.height,
        pixels: result.buffer,
      },
      [result.buffer],
    );
    await estimator.dispose();
  } catch (error) {
    self.postMessage({
      id,
      type: "error",
      message: error.message || "Impossible de calculer le relief.",
    });
  }
};
