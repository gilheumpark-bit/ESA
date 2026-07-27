/**
 * ESVA Abuse Prevention — Community Content Safety
 * ──────────────────────────────────────────────────
 * Spam detection, content reporting, reputation system.
 *
 * PART 1: Types
 * PART 2: Content safety check (spam, link abuse, repetition)
 * PART 3: Reporting system (3 reports → auto-hide)
 * PART 4: Reputation scoring
 * PART 5: Quality enforcement (근거 조항 명시 필수)
 */

import { ensureUserProfile, getSupabaseAdmin } from '@/lib/supabase';

// ─── PART 1: Types ────────────────────────────────────────────

export interface ContentCheckResult {
  safe: boolean;
  reason?: string;
}

export interface ContentReport {
  id: string;
  contentId: string;
  contentType: 'question' | 'answer';
  reporterId: string;
  reason: string;
  createdAt: string;
}

// ─── Constants ────────────────────────────────────────────────

const REPORTS_TABLE = 'content_reports';
const AUTO_HIDE_THRESHOLD = 3;

/**
 * Patterns indicating spam.
 *
 * URL 은 **여기 넣지 않는다.** 링크 개수는 아래에서 `MAX_LINKS_ALLOWED` 로
 * 따로 세고 전용 사유를 돌려준다 — 여기에도 넣으면 임계(>2)가 더 낮아
 * 링크 3 개짜리 글이 "최대 3 개" 라고 안내해 놓고 "스팸" 사유로 막혔다.
 */
const SPAM_PATTERNS: RegExp[] = [
  // Korean/English spam phrases
  /무료\s*상담/gi,
  /click\s*here/gi,
  /buy\s*now/gi,
  /free\s*money/gi,
  /카톡\s*\d{4}/gi,
  /텔레그램\s*@/gi,
];

const MAX_LINKS_ALLOWED = 3;
const MIN_CONTENT_LENGTH = 10;
const MAX_REPEATED_CHAR_RATIO = 0.5;

// ─── PART 2: Content Safety Check ─────────────────────────────

/**
 * Check text content for spam, abuse, and quality issues.
 * Returns { safe: true } or { safe: false, reason: "..." }.
 *
 * `minLength` 는 부르는 쪽이 정한다. 제목과 본문은 최소 길이가 다른데
 * (제목 5 · 본문 10) 여기서 본문 값을 강요하면 라우트가 "최소 5 자" 라고
 * 검증해 통과시킨 제목을 바로 다음 줄에서 "최소 10 자" 로 되막는다 —
 * 사용자는 한 요청에서 서로 다른 숫자 두 개를 듣는다.
 */
export function checkContent(
  text: string,
  options: { minLength?: number } = {},
): ContentCheckResult {
  if (!text || typeof text !== 'string') {
    return { safe: false, reason: 'Content is empty' };
  }

  const minLength = options.minLength ?? MIN_CONTENT_LENGTH;
  const trimmed = text.trim();

  // Minimum length
  if (trimmed.length < minLength) {
    return { safe: false, reason: `Content too short (minimum ${minLength} characters)` };
  }

  // Excessive links
  const linkMatches = trimmed.match(/https?:\/\/\S+/g) ?? [];
  if (linkMatches.length > MAX_LINKS_ALLOWED) {
    return { safe: false, reason: `Too many links (maximum ${MAX_LINKS_ALLOWED})` };
  }

  // Repeated character abuse (e.g., "aaaaaaaaaa" or "ㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋ")
  //
  // 공백은 세지 않는다. 여기 올라오는 글에는 정렬한 회로 표를 그대로 붙여
  // 넣는 경우가 많은데, 그러면 공백이 절반을 넘어 정상 글이 막힌다.
  // 공백을 빼면 "ㅋ ㅋ ㅋ" 처럼 띄어서 도배하는 것도 같이 걸린다.
  const dense = trimmed.replace(/\s+/g, '');
  const charCounts = new Map<string, number>();
  for (const ch of dense) {
    charCounts.set(ch, (charCounts.get(ch) ?? 0) + 1);
  }
  const maxCharCount = Math.max(...charCounts.values(), 0);
  if (dense.length > 20 && maxCharCount / dense.length > MAX_REPEATED_CHAR_RATIO) {
    return { safe: false, reason: 'Excessive repeated characters detected' };
  }

  // Known spam patterns
  for (const pattern of SPAM_PATTERNS) {
    // Reset lastIndex for global patterns
    pattern.lastIndex = 0;
    const matches = trimmed.match(pattern);
    if (matches && matches.length > 2) {
      return { safe: false, reason: 'Content flagged as potential spam' };
    }
  }

  // All caps abuse (Latin text only)
  //
  // 대문자 비율만으로는 못 가른다. 이 게시판의 정상 답변은 대문자 약어로
  // 가득하다 — KEC · IEC · IEEE · ANSI · MOF · VCB · ZCT · GPT · OCGR.
  // "22.9kV 수전반은 LBS-PF-MOF-VCB-TR 순서고 보호는 OCR/OCGR, KEC 와
  // IEC 를 보세요" 는 대문자 비율 0.98 이다(실측). PART 5 가 "근거 조항을
  // 명시해 주세요" 라고 권하는 바로 그 글이 막혔다.
  //
  // 가르는 것은 **본문이 라틴 문자만으로 되어 있는가** 다. 약어를 아무리
  // 많이 써도 한국어 글에는 조사와 명사가 남는다(실측 최대 0.81). 고함은
  // 라틴만으로 채워진다(1.00). 그래서 거의 전부 라틴일 때만 대문자를 본다.
  const latinChars = trimmed.replace(/[^a-zA-Z]/g, '');
  const latinShare = dense.length > 0 ? latinChars.length / dense.length : 0;
  if (latinChars.length > 20 && latinShare > 0.9) {
    const upperRatio = latinChars.replace(/[^A-Z]/g, '').length / latinChars.length;
    if (upperRatio > 0.8) {
      return { safe: false, reason: 'Excessive use of capital letters' };
    }
  }

  return { safe: true };
}

// ─── PART 3: Reporting System ─────────────────────────────────

/**
 * Report a piece of content. 3 reports → auto-hide.
 * Returns the total report count after this report.
 */
export async function reportContent(
  contentType: 'question' | 'answer',
  contentId: string,
  reporterId: string,
  reason: string,
): Promise<{ reportCount: number; autoHidden: boolean }> {
  await ensureUserProfile(reporterId);
  const client = getSupabaseAdmin();

  // Prevent duplicate reports from same user
  const { data: existing } = await client
    .from(REPORTS_TABLE)
    .select('id')
    .eq('content_type', contentType)
    .eq('content_id', contentId)
    .eq('reporter_id', reporterId)
    .maybeSingle();

  if (existing) {
    // Already reported — just return current count
    const { count } = await client
      .from(REPORTS_TABLE)
      .select('*', { count: 'exact', head: true })
      .eq('content_type', contentType)
      .eq('content_id', contentId);

    return { reportCount: count ?? 1, autoHidden: false };
  }

  // Insert report
  const { error } = await client
    .from(REPORTS_TABLE)
    .insert({
      content_type: contentType,
      content_id: contentId,
      reporter_id: reporterId,
      reason,
    });

  if (error) {
    throw new Error(`[ESA-7020] Failed to report content: ${error.message}`);
  }

  // Count total reports
  const { count } = await client
    .from(REPORTS_TABLE)
    .select('*', { count: 'exact', head: true })
    .eq('content_type', contentType)
    .eq('content_id', contentId);

  const reportCount = count ?? 1;
  let autoHidden = false;

  // Auto-hide if threshold reached
  if (reportCount >= AUTO_HIDE_THRESHOLD) {
    autoHidden = await hideContent(contentType, contentId);
  }

  return { reportCount, autoHidden };
}

/**
 * Hide content by setting a hidden flag.
 * Tries both questions and answers tables.
 */
async function hideContent(
  contentType: 'question' | 'answer',
  contentId: string,
): Promise<boolean> {
  const admin = getSupabaseAdmin();
  const table = contentType === 'question' ? 'community_questions' : 'community_answers';
  const { error } = await admin
    .from(table)
    .update({ hidden: true, hidden_reason: 'auto-hidden: multiple reports' })
    .eq('id', contentId);
  return !error;
}

// ─── PART 4: Reputation Scoring ──────────────────────────────

/**
 * Calculate user reputation based on votes received on their content.
 *
 * Scoring:
 * - Question upvote: +5
 * - Answer upvote: +10
 * - Accepted answer: +15
 * - Downvote received: -2
 */
export async function getUserReputation(userId: string): Promise<number> {
  const client = getSupabaseAdmin();

  // Sum votes on user's questions
  const { data: questions } = await client
    .from('community_questions')
    .select('votes')
    .eq('author_id', userId);

  const questionScore = (questions ?? []).reduce(
    (sum, q) => sum + ((q.votes as number) ?? 0) * 5,
    0,
  );

  // Sum votes on user's answers + accepted bonus
  const { data: answers } = await client
    .from('community_answers')
    .select('votes, is_accepted')
    .eq('author_id', userId);

  const answerScore = (answers ?? []).reduce((sum, a) => {
    const votePoints = ((a.votes as number) ?? 0) * 10;
    const acceptedBonus = (a.is_accepted as boolean) ? 15 : 0;
    return sum + votePoints + acceptedBonus;
  }, 0);

  return Math.max(0, questionScore + answerScore);
}

// ─── PART 5: Quality Enforcement ─────────────────────────────

/**
 * Check if an answer includes a standard reference (근거 조항).
 * Encourages quality answers by requiring a citation.
 *
 * Returns a warning (not a block) — soft enforcement.
 */
export function checkAnswerQuality(body: string): {
  hasStandardRef: boolean;
  warning?: string;
} {
  // Look for common standard reference patterns
  const standardPatterns = [
    /KEC\s*\d/i,
    /NEC\s*\d/i,
    /IEC\s*\d/i,
    /JIS\s*[A-Z]/i,
    /GB\s*\d/i,
    /AS\/NZS\s*\d/i,
    /VDE\s*\d/i,
    /IEEE\s*\d/i,
    /제\s*\d+\s*조/,     // Korean article reference: 제XX조
    /§\s*\d/,
    /Article\s*\d/i,
    /Clause\s*\d/i,
    /조항/,
  ];

  const hasRef = standardPatterns.some((p) => p.test(body));

  if (!hasRef) {
    return {
      hasStandardRef: false,
      warning: '근거 조항을 명시해 주세요. 표준/규정 번호를 포함하면 답변의 신뢰도가 높아집니다.',
    };
  }

  return { hasStandardRef: true };
}
