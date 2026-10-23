import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Every page is per-user and dynamic, so the scaffold's Cache Components mode is off (see ARCHITECTURE.md decision log).
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
