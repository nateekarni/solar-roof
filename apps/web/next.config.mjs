/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: [
    "*.trycloudflare.com",
    "upgrading-unlikely-endangered-ferrari.trycloudflare.com",
    "*.loca.lt",
    "localhost:3000",
    "127.0.0.1:3000",
  ],
  experimental: {
    externalDir: true,
  },
  transpilePackages: ["@solar/domain", "@solar/i18n", "@solar/ui"],
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? "",
  },
  async rewrites() {
    const apiTarget = process.env.API_INTERNAL_URL || "http://localhost:3001";
    return [
      {
        source: "/v1/:path*",
        destination: `${apiTarget}/v1/:path*`,
      },
    ];
  },
  async redirects() {
    return [
      {
        source: "/documents",
        destination: "/contracts",
        permanent: false,
      },
      {
        source: "/users",
        destination: "/settings/users",
        permanent: false,
      },
      {
        source: "/audit",
        destination: "/settings/audit",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
