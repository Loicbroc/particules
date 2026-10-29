import { defineConfig } from "vite";

export default defineConfig({
  server: { host: "0.0.0.0", allowedHosts: ["terminal.local"] },
  build: {
    chunkSizeWarningLimit: 600,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [{ name: "three", test: /node_modules[\\/]three/ }],
        },
      },
    },
  },
});
