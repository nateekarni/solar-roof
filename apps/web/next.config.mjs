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
  // /v1 is proxied by app/v1/[...path]/route.ts using the runtime API URL.
  // A build-time rewrite would silently override that route after deployment.
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
