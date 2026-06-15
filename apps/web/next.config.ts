import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  turbopack: {
    root: new URL("../..", import.meta.url).pathname,
  },
};

export default nextConfig;
