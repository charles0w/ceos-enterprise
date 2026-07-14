import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Standalone server output for the multi-stage Docker image.
  output: 'standalone',
};

export default nextConfig;
