import type { NextConfig } from "next";

function backendOrigin(raw: string | undefined): string {
  const fallback = "http://localhost:8002";
  const value = raw?.trim().split(/[\r\n]+/)[0]?.trim();
  if (!value) return fallback;
  try {
    return new URL(value).origin;
  } catch {
    return fallback;
  }
}

const nextConfig: NextConfig = {
  images: {
    qualities: [70, 75, 88, 90],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
  },
  experimental: {
    // Large textbook PDFs exceed the default 10MB proxy limit for /vidyaai rewrites.
    proxyClientMaxBodySize: "500mb",
  },
  async rewrites() {
    const backend = backendOrigin(process.env.NEXT_PUBLIC_API_URL);
    return [
      {
        source: "/vidyaai/:path*",
        destination: `${backend}/vidyaai/:path*`,
      },
    ];
  },
};

export default nextConfig;
