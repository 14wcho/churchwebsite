import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // tesseract.js spawns its own worker_threads and resolves .wasm/.traineddata paths
  // relative to node_modules; letting Turbopack bundle it breaks that resolution and
  // the OCR request hangs forever. Force plain Node `require` instead.
  serverExternalPackages: ["tesseract.js"],
};

export default nextConfig;
