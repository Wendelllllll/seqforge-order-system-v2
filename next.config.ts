import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      { source: "/", destination: "/brand/index.html" },
      ...["about", "contact", "services/molecular", "services/sanger", "services/nanopore"].map((route) => ({
        source: `/${route}`, destination: `/brand/${route}/index.html`,
      })),
    ];
  },
};

export default nextConfig;
