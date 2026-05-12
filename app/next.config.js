/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ['pino', 'pino-pretty'],
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      path: false,
      os: false,
      'pino-pretty': false,
    };
    // Remove unused wallet adapter packages from bundle
    config.resolve.alias = {
      ...config.resolve.alias,
      '@solana/wallet-adapter-wallets': false,
      '@solana-mobile/wallet-adapter-mobile': false,
    };
    return config;
  },
};

module.exports = nextConfig;