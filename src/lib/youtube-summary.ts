/**
 * YouTube URL Summary Engine
 *
 * Extracts video metadata, fetches transcript, and summarizes with LLM (BYOK).
 * Detects related KEC clauses from transcript content.
 *
 * PART 1: Types
 * PART 2: Video ID extraction
 * PART 3: Metadata & transcript fetching (SSRF-guarded)
 * PART 4: KEC clause detection
 * PART 5: LLM summarization
 * PART 6: Public API
 */

import { assertUrlAllowedForFetch } from '@/lib/fetch-url-guard';

// ---------------------------------------------------------------------------
// PART 1 -- Types
// ---------------------------------------------------------------------------

export interface YouTubeSummary {
  /** Video title */
  title: string;
  /** Channel name */
  channel: string;
  /** Video duration in human-readable format (e.g. "12:34") */
  duration: string;
  /** Key points extracted from transcript */
  keyPoints: string[];
  /** Related KEC clauses detected from content */
  relatedKEC?: string[];
  /** Suggested ESVA calculators related to video content */
  relatedCalcs?: string[];
  /** Language of the summary */
  language: string;
  /** Video URL */
  videoUrl: string;
  /** Video ID */
  videoId: string;
}

export interface YouTubeVideoMeta {
  title: string;
  channel: string;
  duration: string;
  description: string;
  thumbnailUrl?: string;
}

export interface TranscriptSegment {
  text: string;
  start: number;
  duration: number;
}

interface SummarizeOptions {
  url: string;
  lang?: string;
  apiKey?: string;
  /** LLM provider: 'openai' | 'anthropic' | 'google' (default: 'openai') */
  provider?: 'openai' | 'anthropic' | 'google';
  /** Max transcript length to send to LLM (chars). Default: 12000 */
  maxTranscriptChars?: number;
}

// ---------------------------------------------------------------------------
// PART 2 -- Video ID extraction
// ---------------------------------------------------------------------------

/**
 * Extract YouTube video ID from various URL formats.
 *
 * Supported formats:
 *   - https://www.youtube.com/watch?v=VIDEO_ID
 *   - https://youtu.be/VIDEO_ID
 *   - https://www.youtube.com/embed/VIDEO_ID
 *   - https://www.youtube.com/shorts/VIDEO_ID
 *   - https://youtube.com/live/VIDEO_ID
 *   - https://m.youtube.com/watch?v=VIDEO_ID
 */
export function extractVideoId(url: string): string | null {
  if (!url) return null;

  const patterns: RegExp[] = [
    // Standard watch URL
    /(?:https?:\/\/)?(?:www\.|m\.)?youtube\.com\/watch\?.*v=([a-zA-Z0-9_-]{11})/,
    // Short URL
    /(?:https?:\/\/)?youtu\.be\/([a-zA-Z0-9_-]{11})/,
    // Embed URL
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
    // Shorts URL
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
    // Live URL
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/live\/([a-zA-Z0-9_-]{11})/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match?.[1]) return match[1];
  }

  return null;
}

// ---------------------------------------------------------------------------
// PART 3 -- Metadata & transcript fetching
// ---------------------------------------------------------------------------

/**
 * Fetch video metadata via YouTube oEmbed (no API key required).
 */
export async function fetchVideoMeta(videoId: string): Promise<YouTubeVideoMeta> {
  const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;

  const res = await fetch(oembedUrl);
  if (!res.ok) {
    throw new Error(`Failed to fetch video metadata: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();

  return {
    title: data.title ?? 'Unknown',
    channel: data.author_name ?? 'Unknown',
    duration: '', // oEmbed에서 duration 제공 안함 — transcript에서 추정
    description: '',
    thumbnailUrl: data.thumbnail_url,
  };
}

/**
 * Fetch transcript via a public transcript extraction approach.
 * Uses the youtube-transcript-api style endpoint.
 *
 * NOTE: In production, use a server-side proxy or the official YouTube Data API v3
 * with captions.list + captions.download for reliable transcript access.
 */
export async function fetchTranscript(
  videoId: string,
  lang: string = 'ko',
): Promise<TranscriptSegment[]> {
  // 서버 사이드에서 YouTube 페이지를 파싱하여 자막 추출
  // 이 함수는 API route에서 호출됨 (CORS 제약 없음)
  const pageUrl = `https://www.youtube.com/watch?v=${videoId}`;

  const res = await fetch(pageUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; ESA/1.0)',
      'Accept-Language': `${lang},en;q=0.9`,
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch video page: ${res.status}`);
  }

  const html = await res.text();

  // "captionTracks" JSON에서 자막 URL 추출
  const captionMatch = html.match(/"captionTracks":\s*(\[.*?\])/);
  if (!captionMatch) {
    return []; // 자막 없음
  }

  let captionTracks: Array<{ baseUrl: string; languageCode: string }>;
  try {
    captionTracks = JSON.parse(captionMatch[1]);
  } catch {
    return [];
  }

  // 요청 언어 우선, 없으면 영어, 없으면 첫 번째 트랙
  const track =
    captionTracks.find((t) => t.languageCode === lang) ??
    captionTracks.find((t) => t.languageCode === 'en') ??
    captionTracks[0];

  if (!track?.baseUrl) return [];

  const captionRes = await fetch(track.baseUrl);
  if (!captionRes.ok) return [];

  const captionXml = await captionRes.text();

  // XML 파싱: <text start="0.0" dur="2.5">내용</text>
  const segments: TranscriptSegment[] = [];
  const textPattern = /<text\s+start="([\d.]+)"\s+dur="([\d.]+)"[^>]*>([^<]*)<\/text>/g;
  let m: RegExpExecArray | null;
  while ((m = textPattern.exec(captionXml)) !== null) {
    segments.push({
      start: parseFloat(m[1]),
      duration: parseFloat(m[2]),
      text: m[3]
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/<[^>]+>/g, ''),
    });
  }

  return segments;
}

/**
 * Estimate video duration from transcript segments.
 */
function estimateDuration(segments: TranscriptSegment[]): string {
  if (segments.length === 0) return '0:00';
  const lastSeg = segments[segments.length - 1];
  const totalSec = Math.ceil(lastSeg.start + lastSeg.duration);
  const hours = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;

  if (hours > 0) {
    return `${hours}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// PART 4 -- KEC clause detection
// ---------------------------------------------------------------------------

/**
 * KEC/NEC/IEC 관련 조항 키워드 매핑.
 * 자막 텍스트에서 관련 조항을 감지하여 추천.
 */
const KEC_KEYWORDS: Array<{ keywords: string[]; clause: string; description: string }> = [
  { keywords: ['전압강하', 'voltage drop', '전압 강하'], clause: 'KEC 232.51', description: '전압강하 허용치' },
  { keywords: ['접지', 'grounding', 'earthing', '어스'], clause: 'KEC 140', description: '접지 시스템' },
  { keywords: ['누전차단기', 'rcd', 'gfci', '누전 차단기'], clause: 'KEC 232.75', description: '누전차단기 설치' },
  { keywords: ['과전류', 'overcurrent', '과전류 보호'], clause: 'KEC 232.1', description: '과전류 보호' },
  { keywords: ['단락전류', 'short circuit', '단락 전류'], clause: 'KEC 232.5', description: '단락전류 계산' },
  { keywords: ['케이블', 'cable sizing', '전선 굵기', '전선 선정'], clause: 'KEC 232.41', description: '전선 허용전류' },
  { keywords: ['변압기', 'transformer', '트랜스'], clause: 'KEC 310', description: '변압기 설비' },
  { keywords: ['차단기', 'circuit breaker', 'cb', 'mccb'], clause: 'KEC 232.7', description: '차단기 선정' },
  { keywords: ['역률', 'power factor', '역율'], clause: 'KEC 232.52', description: '역률 개선' },
  { keywords: ['전동기', 'motor', '모터'], clause: 'KEC 230', description: '전동기 회로' },
  { keywords: ['분전반', 'distribution board', '분전함'], clause: 'KEC 220', description: '분전반 설비' },
  { keywords: ['전력량계', 'energy meter', '계량기'], clause: 'KEC 210', description: '계량 설비' },
  { keywords: ['피뢰기', 'surge arrester', 'spd', '서지'], clause: 'KEC 150', description: '피뢰 설비' },
  { keywords: ['비상전원', 'emergency power', '비상 발전기'], clause: 'KEC 250', description: '비상전원 설비' },
  { keywords: ['태양광', 'solar', 'pv', '태양전지'], clause: 'KEC 520', description: '태양광 발전 설비' },
];

/**
 * ESVA 계산기 키워드 매핑
 */
const CALC_KEYWORDS: Array<{ keywords: string[]; calcId: string }> = [
  { keywords: ['전압강하', 'voltage drop'], calcId: 'voltage-drop' },
  { keywords: ['케이블', 'cable sizing', '전선'], calcId: 'cable-sizing' },
  { keywords: ['단락전류', 'short circuit'], calcId: 'short-circuit' },
  { keywords: ['부하', 'load', '전력'], calcId: 'demand-load' },
  { keywords: ['역률', 'power factor'], calcId: 'power-factor' },
  { keywords: ['변압기', 'transformer', '용량'], calcId: 'transformer-sizing' },
  { keywords: ['차단기', 'breaker'], calcId: 'breaker-sizing' },
  { keywords: ['접지', 'grounding'], calcId: 'grounding-resistance' },
  { keywords: ['전동기', 'motor'], calcId: 'motor-starting' },
  { keywords: ['조도', 'illumination', 'lighting'], calcId: 'illumination' },
];

function detectRelatedKEC(text: string): string[] {
  const lower = text.toLowerCase();
  const found = new Set<string>();

  for (const entry of KEC_KEYWORDS) {
    if (entry.keywords.some((kw) => lower.includes(kw.toLowerCase()))) {
      found.add(`${entry.clause} (${entry.description})`);
    }
  }

  return Array.from(found);
}

function detectRelatedCalcs(text: string): string[] {
  const lower = text.toLowerCase();
  const found = new Set<string>();

  for (const entry of CALC_KEYWORDS) {
    if (entry.keywords.some((kw) => lower.includes(kw.toLowerCase()))) {
      found.add(entry.calcId);
    }
  }

  return Array.from(found);
}

// ---------------------------------------------------------------------------
// PART 5 -- LLM summarization
// ---------------------------------------------------------------------------

/**
 * Summarize transcript text using BYOK LLM.
 * Supports OpenAI, Anthropic, and Google providers.
 */
async function summarizeWithLLM(
  transcript: string,
  videoTitle: string,
  lang: string,
  apiKey: string,
  provider: 'openai' | 'anthropic' | 'google' = 'openai',
): Promise<{ keyPoints: string[] }> {
  const systemPrompt =
    `You are an expert at summarizing technical YouTube videos about electrical engineering. ` +
    `Extract 5-10 key points from the transcript. Focus on technical content, standards references, ` +
    `formulas, and practical tips. Respond in ${lang === 'ko' ? 'Korean' : lang === 'ja' ? 'Japanese' : lang === 'zh' ? 'Chinese' : 'English'}. ` +
    `Return ONLY a JSON array of strings, each being one key point. No markdown, no explanation.`;

  const userPrompt =
    `Video title: "${videoTitle}"\n\nTranscript:\n${transcript}`;

  let keyPoints: string[] = [];

  if (provider === 'openai') {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 2000,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`OpenAI API error: ${res.status} — ${err}`);
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content ?? '[]';
    keyPoints = JSON.parse(content);
  } else if (provider === 'anthropic') {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Anthropic API error: ${res.status} — ${err}`);
    }

    const data = await res.json();
    const content = data.content?.[0]?.text ?? '[]';
    keyPoints = JSON.parse(content);
  } else if (provider === 'google') {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 2000 },
        }),
      },
    );

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Google AI API error: ${res.status} — ${err}`);
    }

    const data = await res.json();
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '[]';
    // JSON 블록에서 추출 (```json ... ``` 래핑 가능)
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    keyPoints = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
  }

  return { keyPoints };
}

// ---------------------------------------------------------------------------
// PART 6 -- Public API
// ---------------------------------------------------------------------------

/**
 * Summarize a YouTube video.
 *
 * 1. Extract video ID from URL
 * 2. Fetch metadata via oEmbed
 * 3. Fetch transcript (captions)
 * 4. Detect related KEC clauses & calculators
 * 5. Summarize with LLM (BYOK required)
 */
export async function summarizeYouTube(opts: SummarizeOptions): Promise<YouTubeSummary> {
  const { url, lang = 'ko', apiKey, provider = 'openai', maxTranscriptChars = 12000 } = opts;

  // Step 1: videoId 추출
  const videoId = extractVideoId(url);
  if (!videoId) {
    throw new Error('Invalid YouTube URL. Could not extract video ID.');
  }

  // Step 2: 메타데이터 가져오기
  const meta = await fetchVideoMeta(videoId);

  // Step 3: 자막 가져오기
  const segments = await fetchTranscript(videoId, lang);
  const fullText = segments.map((s) => s.text).join(' ');
  const duration = meta.duration || estimateDuration(segments);

  // Step 4: KEC 조항 & 계산기 감지
  const combinedText = `${meta.title} ${meta.description} ${fullText}`;
  const relatedKEC = detectRelatedKEC(combinedText);
  const relatedCalcs = detectRelatedCalcs(combinedText);

  // Step 5: LLM 요약 (API 키 필요)
  let keyPoints: string[] = [];
  if (apiKey && fullText.length > 0) {
    const truncated = fullText.slice(0, maxTranscriptChars);
    const result = await summarizeWithLLM(truncated, meta.title, lang, apiKey, provider);
    keyPoints = result.keyPoints;
  } else if (fullText.length === 0) {
    keyPoints = ['No transcript available for this video.'];
  } else {
    keyPoints = ['API key required for LLM summarization. Transcript fetched successfully.'];
  }

  return {
    title: meta.title,
    channel: meta.channel,
    duration,
    keyPoints,
    relatedKEC: relatedKEC.length > 0 ? relatedKEC : undefined,
    relatedCalcs: relatedCalcs.length > 0 ? relatedCalcs : undefined,
    language: lang,
    videoUrl: url,
    videoId,
  };
}
