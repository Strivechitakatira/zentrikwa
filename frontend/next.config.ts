import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Standalone output for Railway / Docker deployment
  output: 'standalone',

  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.supabase.co',  // Supabase Storage
      },
    ],
    formats: ['image/avif', 'image/webp'],
  },

  // Strict mode catches potential issues early
  reactStrictMode: true,

  // Redirect bare root to dashboard (authenticated users)
  async redirects() {
    return [
      {
        source: '/',
        destination: '/dashboard',
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
