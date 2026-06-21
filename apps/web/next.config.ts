import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@paax/ui', '@paax/schemas', '@paax/types', '@paax/constants', '@paax/design-system'],
};

export default nextConfig;
