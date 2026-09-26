import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";

export default defineConfig({
  root: resolve(import.meta.dirname),
  publicDir: resolve(import.meta.dirname, "public"),
  plugins: [react(), tailwindcss()],
  build: {
    outDir: resolve(import.meta.dirname, "dist"),
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      input: {
        index: resolve(import.meta.dirname, "index.html"),
        pebble: resolve(import.meta.dirname, "pebble.html"),
        overlay: resolve(import.meta.dirname, "overlay.html"),
      },
      output: {
        manualChunks(id) {
          if (id.includes("three") || id.includes("postprocessing")) return "apex-3d";
          if (id.includes("framer-motion")) return "apex-motion";
        },
      },
    },
  },
});
