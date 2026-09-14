import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  serverExternalPackages: ["pdf-parse", "pdfjs-dist"],
  experimental: {
    serverActions: {
      // uploadMaterial (materials/actions.ts) accepts PDFs up to 20MB —
      // Next.js's default Server Action body limit is 1MB, which would
      // silently 413 any upload over that before uploadMaterial's own
      // MAX_FILE_SIZE_BYTES check ever runs. Set a bit above 20MB to
      // leave room for multipart/form-data boundary/header overhead.
      bodySizeLimit: "22mb",
    },
  },
};

export default nextConfig;
