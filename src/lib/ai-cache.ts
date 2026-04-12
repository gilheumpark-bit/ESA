// ============================================================
// ESVA AI Response Cache — Cache API 기반 AI 응답 재활용
// ============================================================
// 동일 프롬프트 재요청 시 캐시 히트 → API 호출 0, 토큰 비용 0.
// 브라우저 내장 Cache API 사용 (서버 비용 0원).
// BYOK 환경에서 동일 법규 검색 반복 시 토큰 비용 절감.
// 원본: eh-universe-web/src/lib/browser/ai-cache.ts

const CACHE_NAME = 'esva-ai-responses-v1';
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24시간

// ============================================================
// PART 1 — Hash Key
// ============================================================

async function hashKey(
  provider: string, model: string,
  messages: Array<{ role: string; content: string }>,
  temperature: number,
): Promise<string> {
  const raw = JSON.stringify({ provider, model, messages, temperature });
  const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
  return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ============================================================
// PART 2 — Cache Read / Write
// ============================================================

/** 캐시에서 AI 응답 조회 */
export async function getCachedResponse(
  provider: string, model: string,
  messages: Array<{ role: string; content: string }>,
  temperature: number,
): Promise<string | null> {
  try {
    if (typeof window === 'undefined' || !('caches' in window)) return null;
    const cache = await caches.open(CACHE_NAME);
    const hash = await hashKey(provider, model, messages, temperature);
    const response = await cache.match(new Request(`/ai-cache/${hash}`));
    if (!response) return null;

    const cached = response.headers.get('x-cached-at');
    if (cached && Date.now() - Number(cached) > MAX_AGE_MS) {
      await cache.delete(new Request(`/ai-cache/${hash}`));
      return null;
    }

    return await response.text();
  } catch {
    return null;
  }
}

/** AI 응답을 캐시에 저장 */
export async function cacheResponse(
  provider: string, model: string,
  messages: Array<{ role: string; content: string }>,
  temperature: number,
  responseText: string,
): Promise<void> {
  try {
    if (typeof window === 'undefined' || !('caches' in window)) return;
    // temperature > 0.5면 창의적 응답 → 캐시하지 않음
    if (temperature > 0.5) return;
    // 너무 짧은 응답은 에러일 수 있음
    if (responseText.length < 20) return;

    const cache = await caches.open(CACHE_NAME);
    const hash = await hashKey(provider, model, messages, temperature);
    const response = new Response(responseText, {
      headers: {
        'Content-Type': 'text/plain',
        'x-cached-at': String(Date.now()),
        'x-provider': provider,
        'x-model': model,
      },
    });
    await cache.put(new Request(`/ai-cache/${hash}`), response);
  } catch { /* non-critical */ }
}

// ============================================================
// PART 3 — Cache Management
// ============================================================

/** 캐시 통계 */
export async function cacheStats(): Promise<{ count: number; sizeEstimate: string }> {
  try {
    if (typeof window === 'undefined' || !('caches' in window)) return { count: 0, sizeEstimate: '0 KB' };
    const cache = await caches.open(CACHE_NAME);
    const keys = await cache.keys();
    const sizeKB = keys.length * 2;
    return {
      count: keys.length,
      sizeEstimate: sizeKB > 1024 ? `${(sizeKB / 1024).toFixed(1)} MB` : `${sizeKB} KB`,
    };
  } catch {
    return { count: 0, sizeEstimate: '0 KB' };
  }
}

/** 만료된 캐시 정리 */
export async function pruneExpiredCache(): Promise<number> {
  try {
    if (typeof window === 'undefined' || !('caches' in window)) return 0;
    const cache = await caches.open(CACHE_NAME);
    const keys = await cache.keys();
    let pruned = 0;
    for (const req of keys) {
      const resp = await cache.match(req);
      if (!resp) continue;
      const cachedAt = resp.headers.get('x-cached-at');
      if (cachedAt && Date.now() - Number(cachedAt) > MAX_AGE_MS) {
        await cache.delete(req);
        pruned++;
      }
    }
    return pruned;
  } catch {
    return 0;
  }
}

/** 전체 AI 캐시 삭제 */
export async function clearAICache(): Promise<void> {
  try {
    await caches.delete(CACHE_NAME);
  } catch { /* */ }
}
