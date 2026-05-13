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

  // LIFF deep-link path-append 修補
  //
  // LINE LIFF 的 endpoint URL 設成 https://haiwangzi.zeabur.app/liff/welcome；
  // 打開 liff.line.me/<LIFF_ID>/calendar 時 LINE 會把 path append 上去變成
  //   /liff/welcome/calendar → 404
  // 這條 redirect 把 /liff/welcome/<anything> 轉到 /liff/<anything>
  async redirects() {
    return [
      {
        source: "/liff/welcome/:path+",
        destination: "/liff/:path+",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
