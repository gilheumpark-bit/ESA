/**
 * YouTube 영상 요약 유틸리티 — 전기공학 교육 영상 분석
 *
 * 구현 상태 (2026-05-12):
 *   ✓ extractVideoId   — URL 파싱 (구현 완료)
 *   ✓ fetchVideoMeta   — YouTube oembed 메타 (구현 완료)
 *   ✗ fetchTranscript  — YouTube Data API + 캡션 권한 필요 (미구현)
 *   ✗ summarizeYouTube — LLM 통합 필요 (미구현)
 *
 * 미구현 함수는 `Error('ESA-6021' | 'ESA-6031')`을 throw하여 호출자가
 * 503/502 응답으로 사용자에게 정확히 전달하도록 한다.
 * (placeholder 문자열을 성공 응답으로 반환하지 않는다.)
 */

export function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

export async function fetchVideoMeta(videoId: string): Promise<{ title: string; duration: string }> {
  const res = await fetch(`https://www.youtube.com/oembed?url=https://youtube.com/watch?v=${videoId}&format=json`);
  if (!res.ok) throw new Error(`Video meta fetch failed: ${res.status}`);
  const data = await res.json();
  return { title: data.title || 'Unknown', duration: 'N/A' };
}

/**
 * YouTube 자막 추출 — 미구현.
 *
 * 정직 정책: 가짜 placeholder 문자열을 성공 응답으로 반환하지 않는다.
 * 호출자가 503/502로 사용자에게 정확히 전달하도록 throw한다.
 *
 * 구현 시 필요:
 *   - YouTube Data API v3 captions.list + captions.download (OAuth scope)
 *   - 또는 youtube-transcript npm 패키지 (비공식, 안정성 낮음)
 */
export async function fetchTranscript(
  _videoId: string,
  _language?: string
): Promise<{ text: string; start: number; duration: number }[]> {
  throw new Error('ESA-6021: YouTube transcript fetch not implemented (requires YouTube Data API captions scope)');
}

interface SummarizeOptions {
  url: string;
  lang?: string;
  apiKey?: string;
  provider?: string;
}

/**
 * YouTube 영상 LLM 요약 — 미구현.
 *
 * 정직 정책: 가짜 "추후 구현 예정" 문자열을 성공 응답으로 반환하지 않는다.
 * 호출자가 503/502로 사용자에게 정확히 전달하도록 throw한다.
 *
 * 구현 시 필요:
 *   - fetchTranscript 선행 구현
 *   - BYOK LLM 호출 (services/server-ai 경유)
 *   - KEC/NEC/IEC 조항 감지 (engine/standards/registry)
 *   - keywords/keyPoints 추출 프롬프트
 */
export async function summarizeYouTube(
  _options: SummarizeOptions
): Promise<{ summary: string; keywords: string[]; keyPoints?: string[] }> {
  throw new Error('ESA-6031: YouTube LLM summarization not implemented (requires transcript pipeline + BYOK LLM integration)');
}
