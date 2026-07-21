/**
 * POST /api/rules/validate
 * ------------------------
 * 사내 규정 룰셋 린트 전용 — 도면 없이 룰셋 저작 중 구조를 검증한다.
 *
 * 판정이 아니라 린트이므로 "무효 룰셋"도 요청 자체는 성공이다:
 * 200 + { valid:false, errors } — 400은 몸체가 JSON조차 아닐 때만.
 */

import { NextRequest } from 'next/server';
import { withApiHandler } from '@/lib/api';
import { parseCustomRuleSet } from '@/engine/standards/custom-rules';

export const runtime = 'nodejs';

const RULES_MAX_BYTES = 1024 * 1024;

export const POST = withApiHandler(
  { rateLimit: 'calculate', checkOrigin: true },
  async (req: NextRequest, ctx) => {
    const text = await req.text();
    // text.length는 UTF-16 단위라 한글 위주 룰셋에서 실바이트의 1/3까지 과소측정
    // — 캡은 전송 바이트 기준이어야 한다 (독립 심사 발각).
    if (Buffer.byteLength(text, 'utf8') > RULES_MAX_BYTES) {
      return ctx.error('ESVA-4413', `룰셋이 너무 큽니다 (최대 ${RULES_MAX_BYTES / 1024}KB)`, 400);
    }

    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      return ctx.error('ESVA-4400', '요청 본문이 JSON이 아닙니다', 400);
    }

    const lint = parseCustomRuleSet(raw);
    return ctx.ok({
      valid: lint.ok,
      errors: lint.errors,
      warnings: lint.warnings,
      summary: lint.summary ?? null,
    });
  },
);
