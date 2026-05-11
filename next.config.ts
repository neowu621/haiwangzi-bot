import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Docker / Zeabur 部署需要
  output: "standalone",

  // 圖片來源 (Cloudflare R2 public bucket)
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.r2.cloudflarestorage.com",
      },
      {
        protocol: "https",
        hostname: "**.r2.dev",
      },
      {
        protocol: "https",
        hostname: "profile.line-scdn.net",
      },
    ],
  },

  experimental: {
    // Next 16 RSC / Server Actions 安全限制
    serverActions: {
      bodySizeLimit: "8mb",
    },
  },
};

export default nextConfig;
