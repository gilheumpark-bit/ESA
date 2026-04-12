import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  /** Required for Docker multi-stage build (see Dockerfile → .next/standalone). */
  output: 'standalone',

  experimental: {
    optimizePackageImports: ['lucide-react', 'recharts', 'katex'],
  },

  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
              "img-src 'self' data: https:",
              "font-src 'self' https://cdn.jsdelivr.net",
              "connect-src 'self' https://*.supabase.co https://*.googleapis.com https://*.firebaseio.com https://api.openai.com https://api.anthropic.com https://generativelanguage.googleapis.com https://api.stripe.com",
              "frame-src 'self' https://js.stripe.com",
            ].join('; '),
          },
        ],
      },
    ];
  },

  async redirects() {
    return [
      { source: '/calculator', destination: '/calc', permanent: true },
    ];
  },
};

export default nextConfig;
