/** YouTube 영상 요약 유틸리티 — 전기공학 교육 영상 분석 */

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

export async function fetchTranscript(
  _videoId: string,
  _language?: string
): Promise<{ text: string; start: number; duration: number }[]> {
  // YouTube transcript API는 별도 인증 필요 — placeholder
  return [{ text: '[Transcript not available — YouTube Data API key required]', start: 0, duration: 0 }];
}

interface SummarizeOptions {
  url: string;
  lang?: string;
  apiKey?: string;
  provider?: string;
}

export async function summarizeYouTube(
  options: SummarizeOptions
): Promise<{ summary: string; keywords: string[]; keyPoints?: string[] }> {
  if (!options.apiKey) {
    return {
      summary: 'YouTube 요약 기능은 AI API 키가 필요합니다. 설정에서 API 키를 등록해주세요.',
      keywords: [],
    };
  }

  return {
    summary: `[${options.provider || 'AI'}] API 연동 요약 — 추후 구현 예정`,
    keywords: [],
    keyPoints: [],
  };
}
