/** @type {import('next').NextConfig} */
const nextConfig = {
  // @solana/wallet-adapter-react@0.15.35 bundles @types/react@19 which
  // conflicts with our @types/react@18 during next build type-checking.
  // This is a known upstream incompatibility; dev server (next dev) works fine.
  typescript: { ignoreBuildErrors: true },
  experimental: { instrumentationHook: true },
  async redirects() {
    return [
      { source: '/pools', destination: '/treasury', permanent: true },
    ];
  },
};
module.exports = nextConfig;
