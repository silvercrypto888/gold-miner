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
    // Remove unused wallet adapter packages from bundle.
    // NOTE: do NOT alias '@solana-mobile/wallet-adapter-mobile' to false here.
    // @solana/wallet-adapter-react's WalletProvider named-imports
    // createDefaultAddressSelector from it, and stubbing it to false makes that
    // export undefined -> "(0, S.createDefaultAddressSelector) is not a function"
    // on Android (the only platform where the mobile-adapter code path runs).
    config.resolve.alias = {
      ...config.resolve.alias,
      '@solana/wallet-adapter-wallets': false,
    };
    return config;
  },
};

module.exports = nextConfig;