import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'fvjdqazfgjspxmwlvkpg.supabase.co',
        port: '',
        pathname: '/storage/v1/object/public/**',
      },
      { protocol: 'https', hostname: 'www.sastreriaprats.com', port: '', pathname: '/**' },
      { protocol: 'https', hostname: 'cdn.suitsupply.com', port: '', pathname: '/**' },
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
  logging: {
    fetches: {
      fullUrl: true,
    },
  },
  async redirects() {
    return [
      { source: '/admin', destination: '/admin/dashboard', permanent: false },
    ]
  },
};

export default nextConfig;
