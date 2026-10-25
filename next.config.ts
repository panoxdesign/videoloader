import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Ohne Bildoptimierung und ohne sharp/@img im Output: keine LGPL-Komponente im Image.
  images: { unoptimized: true },
  outputFileTracingExcludes: {
    // "*" trifft auch den Server-Trace (next-server), nicht nur die Routen.
    "*": ["node_modules/sharp/**", "node_modules/@img/**"],
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
