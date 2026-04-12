/**
 * Centralized API Handler — S-Grade Error Boundary
 * --------------------------------------------------
 * 모든 API 라우트를 감싸는 통합 에러 핸들러.
 * 일관된 응답 형식 + 구조화 로깅 + 레이트리밋 + CORS.
 *
 * 사용법:
 *   export const POST = withApiHandler({ rateLimit: 'calculate' }, async (req, ctx) => {
 *     const body = await req.json();
 *     return ctx.ok({ result: 42 });
 *   });
 */

import { NextRequest, NextResponse } from 'next/server';
import { log } from '@/lib/logger';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { sanitizeInput } from '@/lib/security-hardening';

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

export interface ApiContext {
  ip: string;
  startTime: number;
  /** 200 성공 응답 */
  ok: (data: unknown, headers?: Record<string, string>) => NextResponse;
  /** 4xx/5xx 에러 응답 (일관된 형식) */
  error: (code: string, message: string, status?: number, extra?: Record<string, unknown>) => NextResponse;
  /** 입력 문자열 sanitize */
  sanitize: (input: string) => string;
}

export interface ApiHandlerOptions {
  /** 레이트리밋 프로필 (null = 안 함) */
  rateLimit?: string | null;
  /** 최대 요청 바디 크기 (bytes, 기본 10MB) */
  maxBodySize?: number;
  /** CORS origin 체크 (기본 true) */
  checkOrigin?: boolean;
}

type ApiHandlerFn = (req: NextRequest, ctx: ApiContext) => Promise<NextResponse>;

// ═══════════════════════════════════════════════════════════════════════════════
// CORS
// ═══════════════════════════════════════════════════════════════════════════════

const ALLOWED_ORIGINS = new Set([
  'https://esva.engineer',
  'https://www.esva.engineer',
  'http://localhost:3000',
  'http://localhost:3001',
]);

function isOriginAllowed(origin: string | null): boolean {
  if (!origin) return true; // same-origin
  if (ALLOWED_ORIGINS.has(origin)) return true;
  if (/^https:\/\/.*\.vercel\.app$/.test(origin)) return true;
  return false;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Response builders (일관된 형식)
// ═══════════════════════════════════════════════════════════════════════════════

function buildOk(data: unknown, headers?: Record<string, string>): NextResponse {
  return NextResponse.json(
    { success: true, data },
    { status: 200, headers },
  );
}

function buildError(
  code: string,
  message: string,
  status: number = 500,
  extra?: Record<string, unknown>,
): NextResponse {
  return NextResponse.json(
    { success: false, error: { code, message, ...extra } },
    { status },
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Handler wrapper
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * API 라우트를 감싸는 HOC.
 * 1. CORS 체크
 * 2. 레이트리밋
 * 3. try-catch + 구조화 에러 응답
 * 4. 응답 시간 로깅
 */
export function withApiHandler(
  options: ApiHandlerOptions,
  handler: ApiHandlerFn,
) {
  return async (req: NextRequest): Promise<NextResponse> => {
    const startTime = Date.now();
    const ip = getClientIp(req.headers);
    const route = req.nextUrl.pathname;

    // CORS
    if (options.checkOrigin !== false) {
      const origin = req.headers.get('origin');
      if (!isOriginAllowed(origin)) {
        log.warn('api', 'CORS blocked', { ip, route, origin });
        return buildError('ESVA-9001', 'Invalid origin', 403);
      }
    }

    // Rate limit
    if (options.rateLimit) {
      const rl = checkRateLimit(ip, options.rateLimit);
      if (!rl.allowed) {
        log.warn('api', 'Rate limited', { ip, route, profile: options.rateLimit });
        return buildError('ESVA-9002', 'Rate limit exceeded', 429, {
          retryAfter: rl.retryAfter,
        });
      }
    }

    // Context
    const ctx: ApiContext = {
      ip,
      startTime,
      ok: (data, headers) => buildOk(data, headers),
      error: (code, message, status, extra) => buildError(code, message, status, extra),
      sanitize: sanitizeInput,
    };

    try {
      const response = await handler(req, ctx);

      // 응답 시간 로깅
      const durationMs = Date.now() - startTime;
      log.info('api', `${req.method} ${route}`, {
        status: response.status,
        durationMs,
        ip,
      });

      return response;
    } catch (err) {
      const durationMs = Date.now() - startTime;
      const message = err instanceof Error ? err.message : 'Internal server error';
      const stack = err instanceof Error ? err.stack : undefined;

      log.error('api', `${req.method} ${route} FAILED`, {
        error: message,
        stack,
        durationMs,
        ip,
      });

      // ESVA-XXXX 코드가 에러 메시지에 있으면 추출
      const codeMatch = message.match(/ESVA-\d{4}/);
      const code = codeMatch ? codeMatch[0] : 'ESVA-9999';

      return buildError(code, message, 500);
    }
  };
}
