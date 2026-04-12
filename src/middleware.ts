import { NextRequest, NextResponse } from 'next/server';

// =============================================================================
// PART 1: Configuration
// =============================================================================

/** Rate limit: 요청/분 (IP당) */
const RATE_LIMIT_PER_MINUTE = 60;

/** Accept-Language → 지원 로케일 매핑 */
const SUPPORTED_LOCALES = ['ko', 'en', 'ja', 'zh'] as const;
type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
const DEFAULT_LOCALE: SupportedLocale = 'ko';

/** Rate limit 추적 (Edge Runtime 메모리 — 인스턴스별) */
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

// =============================================================================
// PART 2: Helpers
// =============================================================================

function getClientIP(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

function detectLocale(request: NextRequest): SupportedLocale {
  // 1) 쿠키에 이미 설정된 로케일 우선
  const cookieLocale = request.cookies.get('esa-locale')?.value;
  if (cookieLocale && SUPPORTED_LOCALES.includes(cookieLocale as SupportedLocale)) {
    return cookieLocale as SupportedLocale;
  }

  // 2) Accept-Language 헤더 파싱
  const acceptLang = request.headers.get('accept-language') || '';
  const languages = acceptLang
    .split(',')
    .map((part) => {
      const [lang, q] = part.trim().split(';q=');
      return { lang: lang.split('-')[0].toLowerCase(), q: q ? parseFloat(q) : 1.0 };
    })
    .sort((a, b) => b.q - a.q);

  for (const { lang } of languages) {
    if (SUPPORTED_LOCALES.includes(lang as SupportedLocale)) {
      return lang as SupportedLocale;
    }
  }

  return DEFAULT_LOCALE;
}

function checkRateLimit(ip: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + 60_000 });
    return { allowed: true, remaining: RATE_LIMIT_PER_MINUTE - 1 };
  }

  entry.count++;
  const remaining = Math.max(0, RATE_LIMIT_PER_MINUTE - entry.count);
  return { allowed: entry.count <= RATE_LIMIT_PER_MINUTE, remaining };
}

// =============================================================================
// PART 3: Security Headers
// =============================================================================

function applySecurityHeaders(response: NextResponse): void {
  // XSS Protection
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  // HSTS (Vercel이 TLS를 처리하지만 명시적으로 설정)
  response.headers.set(
    'Strict-Transport-Security',
    'max-age=63072000; includeSubDomains; preload'
  );

  // Permissions Policy (불필요한 브라우저 기능 차단)
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=()'
  );
}

// =============================================================================
// PART 4: Middleware Entry Point
// =============================================================================

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 정적 파일, _next, favicon은 skip
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/static') ||
    pathname === '/favicon.ico'
  ) {
    return NextResponse.next();
  }

  const ip = getClientIP(request);

  // --- Rate Limiting (API 경로만) ---
  if (pathname.startsWith('/api/')) {
    const { allowed, remaining } = checkRateLimit(ip);

    if (!allowed) {
      return new NextResponse(
        JSON.stringify({
          error: 'ESVA-2005',
          message: 'Rate limit exceeded',
        }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': '60',
            'X-RateLimit-Limit': String(RATE_LIMIT_PER_MINUTE),
            'X-RateLimit-Remaining': '0',
          },
        }
      );
    }

    const response = NextResponse.next();
    response.headers.set('X-RateLimit-Limit', String(RATE_LIMIT_PER_MINUTE));
    response.headers.set('X-RateLimit-Remaining', String(remaining));
    applySecurityHeaders(response);
    return response;
  }

  // --- Locale Detection (페이지 경로) ---
  const locale = detectLocale(request);
  const response = NextResponse.next();

  // 로케일 쿠키 설정 (없으면)
  if (!request.cookies.get('esa-locale')) {
    response.cookies.set('esa-locale', locale, {
      path: '/',
      maxAge: 60 * 60 * 24 * 365, // 1년
      sameSite: 'lax',
    });
  }

  // 보안 헤더 적용
  applySecurityHeaders(response);

  // 커스텀 헤더 (서버 컴포넌트에서 참조 가능)
  response.headers.set('x-esa-locale', locale);
  response.headers.set('x-esa-request-id', crypto.randomUUID());

  return response;
}

// =============================================================================
// PART 5: Matcher — 미들웨어 적용 경로
// =============================================================================

export const config = {
  matcher: [
    // API 경로
    '/api/:path*',
    // 페이지 경로 (정적 파일 제외)
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
