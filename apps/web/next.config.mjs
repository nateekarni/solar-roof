/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    externalDir: true,
  },
  transpilePackages: ["@solar/domain", "@solar/i18n", "@solar/ui"],
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001",
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
