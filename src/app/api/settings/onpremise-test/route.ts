/**
 * POST /api/settings/onpremise-test
 *
 * On-Premise LLM 서버 연결 테스트 — 서버사이드 프록시
 *
 * 동작: 클라이언트 → 이 라우트 → 로컬 LLM 서버
 * 주의: Vercel 클라우드 배포 시 내부망(192.168.x.x) 접근 불가.
 *       ESVA를 내부망에 직접 배포한 경우 작동.
 *
 * PART 1: 타입 및 상수
 * PART 2: 핸들러
 */

import { NextRequest } from 'next/server';
import { withApiHandler } from '@/lib/api/api-handler';

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1 — 타입 및 상수
// ═══════════════════════════════════════════════════════════════════════════════

interface TestRequest {
  serverUrl: string;
  apiType: 'ollama' | 'vllm' | 'localai' | 'openai-compat';
  modelName: string;
  apiKey?: string;
  timeout?: number;
}

/** API 타입별 헬스체크 엔드포인트 */
const HEALTH_ENDPOINTS: Record<string, string> = {
  ollama:        '/api/tags',
  vllm:          '/v1/models',
  localai:       '/v1/models',
  'openai-compat': '/v1/models',
};

/** API 타입별 채팅 엔드포인트 */
const CHAT_ENDPOINTS: Record<string, string> = {
  ollama:        '/api/generate',
  vllm:          '/v1/chat/completions',
  localai:       '/v1/chat/completions',
  'openai-compat': '/v1/chat/completions',
};

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2 — 핸들러
// ═══════════════════════════════════════════════════════════════════════════════

export const POST = withApiHandler(
  { rateLimit: 'default', checkOrigin: true },
  async (req: NextRequest, ctx) => {
    const body = await req.json() as TestRequest;
    const { serverUrl, apiType, modelName, apiKey, timeout = 10 } = body;

    if (!serverUrl || !apiType || !modelName) {
      return ctx.error('ESA-4001', 'serverUrl, apiType, modelName 필수', 400);
    }

    // URL 형식 검증
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(serverUrl);
    } catch {
      return ctx.error('ESA-4002', '유효하지 않은 서버 URL 형식', 400);
    }

    // 보안: 외부 공개 IP는 차단 (프라이빗 IP·로컬호스트만 허용)
    const hostname = parsedUrl.hostname;
    const isPrivate =
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      /^10\./.test(hostname) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(hostname) ||
      /^192\.168\./.test(hostname) ||
      hostname === '::1';

    if (!isPrivate) {
      return ctx.error(
        'ESA-4003',
        '보안 정책: On-Premise 테스트는 프라이빗 IP(192.168.x.x, 10.x.x.x, localhost)만 허용됩니다.',
        400,
      );
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

    const t0 = Date.now();

    try {
      // ── 1단계: 헬스체크 (모델 목록 조회)
      const healthPath = HEALTH_ENDPOINTS[apiType] ?? '/v1/models';
      const healthRes = await fetch(`${serverUrl.replace(/\/$/, '')}${healthPath}`, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(timeout * 1000),
      });

      if (!healthRes.ok) {
        return ctx.error(
          'ESA-6001',
          `서버 응답 오류: HTTP ${healthRes.status} — ${healthPath}`,
          502,
        );
      }

      // ── 2단계: 간단한 추론 테스트
      let testLatencyMs: number | null = null;
      try {
        const chatPath = CHAT_ENDPOINTS[apiType] ?? '/v1/chat/completions';
        const isOllama = apiType === 'ollama';

        const chatBody = isOllama
          ? { model: modelName, prompt: 'Hi', stream: false }
          : {
              model: modelName,
              messages: [{ role: 'user', content: 'Hi' }],
              max_tokens: 1,
              stream: false,
            };

        const t1 = Date.now();
        const chatRes = await fetch(`${serverUrl.replace(/\/$/, '')}${chatPath}`, {
          method: 'POST',
          headers,
          body: JSON.stringify(chatBody),
          signal: AbortSignal.timeout(Math.min(timeout, 15) * 1000),
        });
        testLatencyMs = Date.now() - t1;

        if (!chatRes.ok) {
          // 추론 테스트 실패 → 헬스체크는 성공이었으므로 경고만
          return ctx.ok({
            model: modelName,
            apiType,
            healthOk: true,
            inferenceOk: false,
            warning: `헬스체크 성공 (모델 목록 응답), 추론 테스트 실패 (HTTP ${chatRes.status}). 모델명을 확인하세요.`,
            latencyMs: Date.now() - t0,
          });
        }
      } catch {
        // 추론 타임아웃도 경고 수준 (헬스체크 통과했으면 서버는 살아있음)
        return ctx.ok({
          model: modelName,
          apiType,
          healthOk: true,
          inferenceOk: false,
          warning: '헬스체크 성공, 추론 타임아웃. 모델 로딩 중일 수 있습니다.',
          latencyMs: Date.now() - t0,
        });
      }

      return ctx.ok({
        model: modelName,
        apiType,
        healthOk: true,
        inferenceOk: true,
        latencyMs: testLatencyMs ?? Date.now() - t0,
        message: `연결 성공 — ${apiType} 서버 정상 응답`,
      });

    } catch (err) {
      const msg = err instanceof Error ? err.message : '연결 실패';
      const isTimeout = msg.includes('timeout') || msg.includes('abort');
      return ctx.error(
        'ESA-6001',
        isTimeout
          ? `연결 타임아웃 (${timeout}초). 서버 URL과 포트를 확인하세요.`
          : `연결 실패: ${msg}`,
        502,
      );
    }
  },
);
