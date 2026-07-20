import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, getClientIp, RATE_LIMIT_PROFILES } from '@/lib/rate-limit';

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

function applySecurityHeaders(response: NextResponse): void {
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set(
    'Strict-Transport-Security',
    'max-age=63072000; includeSubDomains; preload',
  );
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=()',
  );
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
