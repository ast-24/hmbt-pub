import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  images: {
    unoptimized: true,
  },
  transpilePackages: ["@ast24/hmbt-v5-lib"],
  experimental: {
    externalDir: true,
  },
};

export default nextConfig;
