import type { NextConfig } from "next";
import { legacyShopifyRedirects } from "./src/lib/seo/legacy-redirects";

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },
  images: {
    // Loader custom (src/lib/image-loader.ts) que delega la optimización en
    // Supabase Image Transformations en lugar del optimizador de Vercel, que
    // tiene cuota mensual y devolvía 402 cuando se agotaba.
    loader: 'custom',
    loaderFile: './src/lib/image-loader.ts',
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'fvjdqazfgjspxmwlvkpg.supabase.co',
        port: '',
        pathname: '/storage/v1/**',
      },
      { protocol: 'https', hostname: 'www.sastreriaprats.com', port: '', pathname: '/**' },
      { protocol: 'https', hostname: 'sastreriaprats.myshopify.com', port: '', pathname: '/**' },
      { protocol: 'https', hostname: 'cdn.suitsupply.com', port: '', pathname: '/**' },
      { protocol: 'https', hostname: 'cdn.shopify.com', port: '', pathname: '/**' },
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '100mb',
    },
  },
  logging: {
    fetches: {
      fullUrl: true,
    },
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains',
          },
          {
            key: 'Content-Security-Policy-Report-Only',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.supabase.co https://www.googletagmanager.com",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https://*.supabase.co https://*.supabase.in",
              "connect-src 'self' https://*.supabase.co https://api.resend.com",
              "frame-src 'self'",
            ].join('; '),
          },
        ],
      },
    ]
  },
  async redirects() {
    return [
      { source: '/admin', destination: '/admin/dashboard', permanent: false },
      // Redirecciones 301 de las URLs antiguas de Shopify (ver src/lib/seo/legacy-redirects.ts)
      ...legacyShopifyRedirects,
    ]
  },
};

export default nextConfig;
