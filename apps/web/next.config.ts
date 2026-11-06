import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@resolvetrace/protocol",
    "@resolvetrace/sdk",
  ],
  // Node.js-only packages used in server components and API routes
  serverExternalPackages: ["@resolvetrace/storage"],
  // Security headers
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
