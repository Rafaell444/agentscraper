import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The channel welcome post uploads a photo through a server action (default limit 1 MB).
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
};

export default nextConfig;
