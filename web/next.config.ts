import type { NextConfig } from "next";

// Expose the team's flag names (from .env.example) to the browser.
const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_USE_MOCKS: process.env.USE_MOCKS ?? "true",
    NEXT_PUBLIC_CAPTURE: process.env.CAPTURE ?? "false",
  },
};

export default nextConfig;
