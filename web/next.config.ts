import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack: (config) => {
    // Optional native dep pulled in by the MetaMask connector; not used on web.
    config.resolve.alias = {
      ...config.resolve.alias,
      "@react-native-async-storage/async-storage": false,
    };
    return config;
  },
};

export default nextConfig;
