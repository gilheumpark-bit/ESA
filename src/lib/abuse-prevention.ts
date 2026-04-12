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

import { getSupabaseClient, getSupabaseAdmin } from '@/lib/supabase';

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

/** Patterns indicating spam */
const SPAM_PATTERNS: RegExp[] = [
  // Excessive URLs
  /https?:\/\/\S+/gi,
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
 */
export function checkContent(text: string): ContentCheckResult {
  if (!text || typeof text !== 'string') {
    return { safe: false, reason: 'Content is empty' };
  }

  const trimmed = text.trim();

  // Minimum length
  if (trimmed.length < MIN_CONTENT_LENGTH) {
    return { safe: false, reason: `Content too short (minimum ${MIN_CONTENT_LENGTH} characters)` };
  }

  // Excessive links
  const linkMatches = trimmed.match(/https?:\/\/\S+/g) ?? [];
  if (linkMatches.length > MAX_LINKS_ALLOWED) {
    return { safe: false, reason: `Too many links (maximum ${MAX_LINKS_ALLOWED})` };
  }

  // Repeated character abuse (e.g., "aaaaaaaaaa" or "ㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋ")
  const charCounts = new Map<string, number>();
  for (const ch of trimmed) {
    charCounts.set(ch, (charCounts.get(ch) ?? 0) + 1);
  }
  const maxCharCount = Math.max(...charCounts.values());
  if (maxCharCount / trimmed.length > MAX_REPEATED_CHAR_RATIO && trimmed.length > 20) {
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
  const latinChars = trimmed.replace(/[^a-zA-Z]/g, '');
  if (latinChars.length > 20) {
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
  contentId: string,
  reporterId: string,
  reason: string,
): Promise<{ reportCount: number; autoHidden: boolean }> {
  const client = getSupabaseClient();

  // Prevent duplicate reports from same user
  const { data: existing } = await client
    .from(REPORTS_TABLE)
    .select('id')
    .eq('content_id', contentId)
    .eq('reporter_id', reporterId)
    .maybeSingle();

  if (existing) {
    // Already reported — just return current count
    const { count } = await client
      .from(REPORTS_TABLE)
      .select('*', { count: 'exact', head: true })
      .eq('content_id', contentId);

    return { reportCount: count ?? 1, autoHidden: false };
  }

  // Insert report
  const { error } = await client
    .from(REPORTS_TABLE)
    .insert({
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
    .eq('content_id', contentId);

  const reportCount = count ?? 1;
  let autoHidden = false;

  // Auto-hide if threshold reached
  if (reportCount >= AUTO_HIDE_THRESHOLD) {
    autoHidden = await hideContent(contentId);
  }

  return { reportCount, autoHidden };
}

/**
 * Hide content by setting a hidden flag.
 * Tries both questions and answers tables.
 */
async function hideContent(contentId: string): Promise<boolean> {
  const admin = getSupabaseAdmin();

  // Try hiding in questions
  const { error: qErr } = await admin
    .from('community_questions')
    .update({ hidden: true, hidden_reason: 'auto-hidden: multiple reports' })
    .eq('id', contentId);

  if (!qErr) return true;

  // Try hiding in answers
  const { error: aErr } = await admin
    .from('community_answers')
    .update({ hidden: true, hidden_reason: 'auto-hidden: multiple reports' })
    .eq('id', contentId);

  return !aErr;
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
  const client = getSupabaseClient();

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
