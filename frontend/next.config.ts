import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    let backend = (process.env.BACKEND_URL || "http://localhost:5000").trim();
    if (backend.startsWith('"') && backend.endsWith('"')) backend = backend.slice(1, -1);
    if (backend.startsWith("'") && backend.endsWith("'")) backend = backend.slice(1, -1);
    if (!backend.startsWith("http://") && !backend.startsWith("https://")) {
      backend = `https://${backend}`;
    }
    if (backend.endsWith("/")) backend = backend.slice(0, -1);
    console.log("Resolved backend URL for rewrites:", backend);
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
