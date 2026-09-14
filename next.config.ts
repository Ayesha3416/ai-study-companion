import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Step 35 deployment fix: @napi-rs/canvas added alongside pdf-parse and
  // pdfjs-dist. Without it explicitly listed here, Vercel's bundler tried
  // to bundle @napi-rs/canvas's native platform binary (rather than
  // externalizing it to load from node_modules at runtime like it does for
  // pdf-parse/pdfjs-dist), which doesn't work for a native addon — this
  // was the real cause of production's "ReferenceError: DOMMatrix is not
  // defined" (pdf-parse's DOM-global polyfills come from this package; see
  // process-material.ts's import comment for the other half of this fix).
  serverExternalPackages: ["pdf-parse", "pdfjs-dist", "@napi-rs/canvas"],
};

export default nextConfig;
