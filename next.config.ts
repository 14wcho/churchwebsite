import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // tesseract.js spawns its own worker_threads and resolves .wasm/.traineddata paths
  // relative to node_modules; letting Turbopack bundle it breaks that resolution and
  // the OCR request hangs forever. Force plain Node `require` instead.
  serverExternalPackages: ["tesseract.js"],
  // Vercel's deploy bundler traces which files each route needs and prunes the rest.
  // It can't see into tesseract.js's dynamically-spawned worker_thread script, so it
  // was pruning files that worker requires relative to itself — the worker then died
  // on `Cannot find module '..'` the moment it started, eating the full 60s timeout.
  // Force the whole package trees (plus tessdata/eng.traineddata, which is read via a
  // runtime-computed path and so isn't picked up by require()-based tracing either).
  outputFileTracingIncludes: {
    "/api/ocr": [
      "./tessdata/**/*",
      "./node_modules/tesseract.js/**/*",
      "./node_modules/tesseract.js-core/**/*",
      // tesseract.js's own dependencies, required from inside its worker_thread
      // script — the tracer doesn't follow those requires (see commit history
      // for the two rounds of MODULE_NOT_FOUND this took to find), so every one
      // of its package.json `dependencies` has to be listed explicitly here.
      "./node_modules/bmp-js/**/*",
      "./node_modules/idb-keyval/**/*",
      "./node_modules/is-url/**/*",
      "./node_modules/node-fetch/**/*",
      "./node_modules/regenerator-runtime/**/*",
      "./node_modules/wasm-feature-detect/**/*",
      "./node_modules/zlibjs/**/*",
    ],
  },
};

export default nextConfig;
