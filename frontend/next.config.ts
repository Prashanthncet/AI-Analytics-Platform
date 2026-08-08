import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    const backend = process.env.BACKEND_URL || "http://localhost:5000";
    return [
      {
        source: "/api/:path*",
        destination: `${backend}/api/:path*`,
      },
      {
        // Embeddable visitor-tracking snippet (hosted on the platform origin).
        source: "/t.js",
        destination: `${backend}/t.js`,
      },
    ];
  },
};

export default nextConfig;
