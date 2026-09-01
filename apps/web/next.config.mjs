/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    externalDir: true
  },
  transpilePackages: ["@solar/domain", "@solar/i18n", "@solar/ui"]
};

export default nextConfig;

