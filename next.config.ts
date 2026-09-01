import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The floating dev badge sits over the floor plan's bottom-left corner.
  devIndicators: false,
  // Route handlers have no body cap by default; this only raises the limit for
  // Server Actions, should any be added later. Upload size is enforced
  // explicitly in src/app/api/layout/extract/route.ts (5MB).
  experimental: {
    serverActions: { bodySizeLimit: "12mb" },
  },
};

export default nextConfig;
