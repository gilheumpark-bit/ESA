import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, getClientIp, RATE_LIMIT_PROFILES } from '@/lib/rate-limit';
import { buildSecurityHeaders } from '@/lib/security-headers';

// =============================================================================
// PART 1: Configuration
// =============================================================================

const SUPPORTED_LOCALES = ['ko', 'en', 'ja', 'zh'] as const;
type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
const DEFAULT_LOCALE: SupportedLocale = 'ko';

// =============================================================================
// PART 2: Helpers
// =============================================================================

function detectLocale(request: NextRequest): SupportedLocale {
  const cookieLocale = request.cookies.get('esa-locale')?.value;
  if (cookieLocale && SUPPORTED_LOCALES.includes(cookieLocale as SupportedLocale)) {
    return cookieLocale as SupportedLocale;
  }

  const acceptLang = request.headers.get('accept-language') || '';
  const languages = acceptLang
    .split(',')
    .map((part) => {
      const [lang, q] = part.trim().split(';q=');
      const parsedQ = q ? Number.parseFloat(q) : 1;
      return {
        lang: lang.split('-')[0].toLowerCase(),
        q: Number.isFinite(parsedQ) ? parsedQ : 0,
      };
    })
    .sort((a, b) => b.q - a.q);

  for (const { lang } of languages) {
    if (SUPPORTED_LOCALES.includes(lang as SupportedLocale)) {
      return lang as SupportedLocale;
    }
  }

  return DEFAULT_LOCALE;
}

/**
 * 목록은 `@/lib/security-headers` 하나뿐이다 — `next.config.ts` 도 같은 것을
 * 쓴다. 여기서 따로 적으면 둘이 어긋난다(실제로 어긋나 있었다).
 * CSP 는 설정 파일이 전 경로에 걸므로 여기서는 싣지 않는다.
 */
function applySecurityHeaders(response: NextResponse): void {
  for (const { key, value } of buildSecurityHeaders(process.env.NODE_ENV === 'production', false)) {
    response.headers.set(key, value);
  }
}

// =============================================================================
// PART 3: Proxy entry point
// =============================================================================

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const requestId = crypto.randomUUID();

  if (
    pathname.startsWith('/_next')
    || pathname.startsWith('/static')
    || pathname === '/favicon.ico'
  ) {
    return NextResponse.next();
  }

  if (pathname.startsWith('/api/')) {
    const result = checkRateLimit(getClientIp(request.headers), 'default');

    if (!result.allowed) {
      const response = NextResponse.json(
        {
          success: false,
          error: {
            code: 'ESVA-2005',
            message: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.',
          },
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(result.retryAfter ?? 60),
            'X-RateLimit-Limit': String(RATE_LIMIT_PROFILES.default.maxRequests),
            'X-RateLimit-Remaining': '0',
            'x-esa-request-id': requestId,
          },
        },
      );
      applySecurityHeaders(response);
      return response;
    }

    const response = NextResponse.next();
    response.headers.set('X-RateLimit-Limit', String(RATE_LIMIT_PROFILES.default.maxRequests));
    response.headers.set('X-RateLimit-Remaining', String(result.remaining));
    response.headers.set('x-esa-request-id', requestId);
    applySecurityHeaders(response);
    return response;
  }

  const locale = detectLocale(request);
  const response = NextResponse.next();

  if (!request.cookies.get('esa-locale')) {
    response.cookies.set('esa-locale', locale, {
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    });
  }

  applySecurityHeaders(response);
  response.headers.set('x-esa-locale', locale);
  response.headers.set('x-esa-request-id', requestId);
  return response;
}

export const config = {
  matcher: [
    '/api/:path*',
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
