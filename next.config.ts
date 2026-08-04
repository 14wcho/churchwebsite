import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // tesseract.js spawns its own worker_threads and resolves .wasm/.traineddata paths
  // relative to node_modules; letting Turbopack bundle it breaks that resolution and
  // the OCR request hangs forever. Force plain Node `require` instead.
  serverExternalPackages: ["tesseract.js"],
  // The trace-based deploy bundler wouldn't otherwise notice tessdata/eng.traineddata
  // since it's read via a runtime-computed path, not require()'d — without this the
  // file is missing in production and tesseract.js falls back to fetching it from a
  // CDN on every cold start, which is what caused OCR requests to time out.
  outputFileTracingIncludes: {
    "/api/ocr": ["./tessdata/**/*"],
  },
};

export default nextConfig;
