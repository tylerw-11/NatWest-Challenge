import type { NextConfig } from "next";

const engineOrigin = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000").replace(/\/$/, "");

// Expose the team's flag names (from .env.example) to the browser.
const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_USE_MOCKS: process.env.USE_MOCKS ?? "true",
    NEXT_PUBLIC_CAPTURE: process.env.CAPTURE ?? "false",
  },
  async rewrites() {
    return [{ source: "/engine/:path*", destination: `${engineOrigin}/:path*` }];
  },
};

export default nextConfig;
