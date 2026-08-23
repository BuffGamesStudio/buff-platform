import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  experimental: {
    cpus: 1,
    webpackMemoryOptimizations: true,
  },
  async headers() {
    return [
      {
        source: "/media/movie-buff/:path*",
        headers: [
          {
            key: "Cache-Control",
            value:
              "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
          },
          {
            key: "Access-Control-Allow-Origin",
            value: "*",
          },
        ],
      },
    ];
  },
  outputFileTracingExcludes: {
    "/*": [
      "public/media/movie-buff/public-domain/**/*",
    ],
  },
};

export default nextConfig;
