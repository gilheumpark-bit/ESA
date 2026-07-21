import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  /** Required for Docker multi-stage build (see Dockerfile → .next/standalone). */
  output: 'standalone',
  outputFileTracingRoot: process.cwd(),

  // Worktrees contain both the parent and branch lockfiles. Pinning the root
  // prevents Turbopack from treating the parent checkout as this app's root.
  turbopack: {
    root: process.cwd(),
  },

  // pdfjs-dist는 번들 제외 필수 — Turbopack이 말아 넣으면 내부 fake-worker의
  // 동적 임포트(pdf.worker.mjs)가 청크 경로에서 끊겨 모든 PDF 파싱이 실패한다
  // (실도면 라이브 실측으로 발각). node_modules에서 직접 로드해야 워커가 산다.
  serverExternalPackages: ['pdfjs-dist', '@napi-rs/canvas'],

  experimental: {
    // proxy.ts 사용 시 요청 본문이 기본 10MB에서 절단된다(공식 문서 확인).
    // 실측: 24.8MB 실도면 업로드가 절단돼 formData 파싱이 깨지고 "multipart가
    // 아니다"로 오진됐다. PDF 라우트의 계약 상한(100MB)에 맞춘다 — 파일별
    // 상한(DXF 50MB·PDF 100MB·rules 1MB)은 각 라우트가 계속 집행한다.
    proxyClientMaxBodySize: '100mb',
    optimizePackageImports: [
      'lucide-react',
      'recharts',
      'katex',
      '@supabase/supabase-js',
      'exceljs',
    ],
    // View Transitions API — 지원 브라우저에서 페이지 전환 애니메이션
    viewTransition: true,
  },

  // 정적 자산 압축
  compress: true,

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
              // Dev mode needs unsafe-eval for React's callstack reconstruction
              // (HMR + Fast Refresh). Production never uses eval. Without this,
              // dev console shows: "eval() is not supported in this environment".
              process.env.NODE_ENV === 'production'
                ? "script-src 'self' 'unsafe-inline'"
                : "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
              // Source-linked SLD reports render a hash-verified drawing from
              // browser-local IndexedDB through an object URL.
              "img-src 'self' data: blob: https:",
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
