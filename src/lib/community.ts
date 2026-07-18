/**
 * ESVA Community Q&A — Data Layer
 * ─────────────────────────────────
 * Questions, answers, votes, expert profiles.
 * All persistence via Supabase.
 *
 * PART 1: Types
 * PART 2: Questions CRUD
 * PART 3: Answers CRUD
 * PART 4: Voting
 * PART 5: Expert profiles
 */

import { getSupabaseClient, getSupabaseAdmin, type PaginationOptions, type PaginatedResult } from '@/lib/supabase';
import { sanitizeInput } from '@/lib/security-hardening';

// ─── PART 1: Types ────────────────────────────────────────────

export type QuestionStatus = 'open' | 'resolved';
export type VoteDirection = 'up' | 'down';

export interface Question {
  id: string;
  title: string;
  body: string;
  tags: string[];
  authorId: string;
  authorName?: string;
  /** References to standard clauses, e.g. ["KEC 232.41", "IEC 60364-5-52"] */
  standardRefs: string[];
  /** Calculator IDs referenced in this question */
  calcRefs: string[];
  votes: number;
  answerCount: number;
  status: QuestionStatus;
  createdAt: string;
  updatedAt?: string;
}

export interface Answer {
  id: string;
  questionId: string;
  body: string;
  authorId: string;
  authorName?: string;
  isExpert: boolean;
  standardRefs: string[];
  votes: number;
  isAccepted: boolean;
  createdAt: string;
}

export interface ExpertProfile {
  userId: string;
  displayName?: string;
  certifications: string[];
  verifiedAt?: string;
  specialties: string[];
  reputation: number;
}

export interface Vote {
  id: string;
  userId: string;
  targetType: 'question' | 'answer';
  targetId: string;
  direction: VoteDirection;
  createdAt: string;
}

export interface QuestionListOptions extends PaginationOptions {
  tags?: string[];
  sort?: 'newest' | 'votes' | 'unanswered';
  search?: string;
  status?: QuestionStatus;
}

// ─── Table Names ──────────────────────────────────────────────

const T = {
  questions: 'community_questions',
  answers: 'community_answers',
  votes: 'community_votes',
  experts: 'expert_profiles',
} as const;

// ─── PART 2: Questions ────────────────────────────────────────

export async function createQuestion(q: {
  title: string;
  body: string;
  tags: string[];
  authorId: string;
  standardRefs?: string[];
  calcRefs?: string[];
}): Promise<Question> {
  const client = getSupabaseClient();

  const { data, error } = await client
    .from(T.questions)
    .insert({
      title: q.title,
      body: q.body,
      tags: q.tags,
      author_id: q.authorId,
      standard_refs: q.standardRefs ?? [],
      calc_refs: q.calcRefs ?? [],
      votes: 0,
      answer_count: 0,
      status: 'open',
    })
    .select('*')
    .single();

  if (error) {
    throw new Error(`[ESA-7001] Failed to create question: ${error.message}`);
  }

  return rowToQuestion(data);
}

export async function getQuestions(
  opts: QuestionListOptions = {},
): Promise<PaginatedResult<Question>> {
  const {
    page = 1,
    pageSize = 20,
    tags,
    sort = 'newest',
    search,
    status,
  } = opts;

  const client = getSupabaseClient();
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  // Build query
  let query = client.from(T.questions).select('*', { count: 'exact' });

  if (tags && tags.length > 0) {
    query = query.overlaps('tags', tags);
  }

  if (status) {
    query = query.eq('status', status);
  }

  if (search) {
    // PostgREST .or() 필터 DSL 인젝션 방지: 제어문자 제거 후 DSL 메타문자(,()* 및
    // LIKE 와일드카드 %_ , 백슬래시)를 공백으로 치환하여 필터 구조 탈출을 차단한다.
    const safeSearch = sanitizeInput(search).replace(/[\\%_,()*]/g, ' ').trim();
    if (safeSearch) {
      query = query.or(`title.ilike.%${safeSearch}%,body.ilike.%${safeSearch}%`);
    }
  }

  // Sort
  switch (sort) {
    case 'votes':
      query = query.order('votes', { ascending: false });
      break;
    case 'unanswered':
      query = query.eq('answer_count', 0).order('created_at', { ascending: false });
      break;
    case 'newest':
    default:
      query = query.order('created_at', { ascending: false });
      break;
  }

  query = query.range(from, to);

  const { data, error, count } = await query;

  if (error) {
    throw new Error(`[ESA-7002] Failed to list questions: ${error.message}`);
  }

  const totalCount = count ?? 0;

  return {
    data: (data ?? []).map(rowToQuestion),
    count: totalCount,
    page,
    pageSize,
    totalPages: Math.ceil(totalCount / pageSize),
  };
}

export async function getQuestion(id: string): Promise<Question | null> {
  const client = getSupabaseClient();

  const { data, error } = await client
    .from(T.questions)
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    throw new Error(`[ESA-7003] Failed to get question: ${error.message}`);
  }

  return data ? rowToQuestion(data) : null;
}

// ─── PART 3: Answers ──────────────────────────────────────────

export async function createAnswer(a: {
  questionId: string;
  body: string;
  authorId: string;
  isExpert?: boolean;
  standardRefs?: string[];
}): Promise<Answer> {
  const client = getSupabaseClient();

  const { data, error } = await client
    .from(T.answers)
    .insert({
      question_id: a.questionId,
      body: a.body,
      author_id: a.authorId,
      is_expert: a.isExpert ?? false,
      standard_refs: a.standardRefs ?? [],
      votes: 0,
      is_accepted: false,
    })
    .select('*')
    .single();

  if (error) {
    throw new Error(`[ESA-7004] Failed to create answer: ${error.message}`);
  }

  // Increment answer count on question
  const admin = getSupabaseAdmin();
  try {
    await admin.rpc('increment_answer_count', { question_id: a.questionId });
  } catch {
    // Fallback: ignore — answer count may be stale
  }

  return rowToAnswer(data);
}

export async function getAnswersForQuestion(
  questionId: string,
  sortByVotes = true,
): Promise<Answer[]> {
  const client = getSupabaseClient();

  let query = client
    .from(T.answers)
    .select('*')
    .eq('question_id', questionId);

  if (sortByVotes) {
    // Accepted answer first, then by votes
    query = query
      .order('is_accepted', { ascending: false })
      .order('votes', { ascending: false });
  } else {
    query = query.order('created_at', { ascending: true });
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`[ESA-7005] Failed to list answers: ${error.message}`);
  }

  return (data ?? []).map(rowToAnswer);
}

// ─── PART 4: Voting ───────────────────────────────────────────

export async function voteQuestion(
  questionId: string,
  userId: string,
  direction: VoteDirection,
): Promise<{ votes: number }> {
  return vote('question', questionId, userId, direction, T.questions);
}

export async function voteAnswer(
  answerId: string,
  userId: string,
  direction: VoteDirection,
): Promise<{ votes: number }> {
  return vote('answer', answerId, userId, direction, T.answers);
}

async function vote(
  targetType: 'question' | 'answer',
  targetId: string,
  userId: string,
  direction: VoteDirection,
  targetTable: string,
): Promise<{ votes: number }> {
  const client = getSupabaseClient();
  const delta = direction === 'up' ? 1 : -1;

  // Check for existing vote
  const { data: existingVote } = await client
    .from(T.votes)
    .select('*')
    .eq('user_id', userId)
    .eq('target_type', targetType)
    .eq('target_id', targetId)
    .maybeSingle();

  if (existingVote) {
    const oldDirection = existingVote.direction as VoteDirection;
    if (oldDirection === direction) {
      // Same vote — remove it (toggle off)
      await client.from(T.votes).delete().eq('id', existingVote.id);
      const reverseDelta = direction === 'up' ? -1 : 1;
      return updateVoteCount(targetTable, targetId, reverseDelta);
    }
    // Opposite vote — update and apply double delta
    await client
      .from(T.votes)
      .update({ direction })
      .eq('id', existingVote.id);
    return updateVoteCount(targetTable, targetId, delta * 2);
  }

  // New vote
  const { error } = await client
    .from(T.votes)
    .insert({
      user_id: userId,
      target_type: targetType,
      target_id: targetId,
      direction,
    });

  if (error) {
    // 동시성: unique(user_id,target_type,target_id) 위반(23505)은 동시 요청이 이미
    // 투표를 삽입했음을 의미 — 중복 집계 없이 현재 카운트만 반환한다.
    if ((error as { code?: string }).code === '23505') {
      return updateVoteCount(targetTable, targetId, 0);
    }
    throw new Error(`[ESA-7006] Failed to vote: ${error.message}`);
  }

  return updateVoteCount(targetTable, targetId, delta);
}

async function updateVoteCount(
  table: string,
  id: string,
  delta: number,
): Promise<{ votes: number }> {
  const admin = getSupabaseAdmin();

  // 원자적 증감 RPC로 read-modify-write 경쟁 제거 (increment_answer_count와 동일 패턴).
  // delta=0이면 값 변경 없이 현재 votes를 조회하는 용도로 재사용된다.
  try {
    const { data, error } = await admin.rpc('increment_vote_count', {
      target_table: table,
      target_id: id,
      delta,
    });

    if (error) throw error;

    return { votes: (data as number) ?? 0 };
  } catch (rpcError) {
    // Fallback: increment_vote_count RPC 미배포(마이그레이션 미적용) 시에도 투표가
    // 동작하도록 read-modify-write로 대체한다. 원자적이지 않아 동시성 경쟁이 있으나,
    // RPC 배포 전까지의 기능 유지가 우선. RPC는 여전히 기본 경로로 유지된다.
    console.warn(
      `[ESA-7006] increment_vote_count RPC unavailable, falling back to read-modify-write:`,
      rpcError,
    );

    const { data: current, error: readError } = await admin
      .from(table)
      .select('votes')
      .eq('id', id)
      .single();

    if (readError) {
      throw new Error(`[ESA-7006] Failed to update vote count: ${readError.message}`);
    }

    const nextVotes = ((current?.votes as number) ?? 0) + delta;

    // delta=0이면 쓰기 없이 현재 값만 반환 (조회 전용 재사용 경로).
    if (delta === 0) {
      return { votes: nextVotes };
    }

    const { data: updated, error: writeError } = await admin
      .from(table)
      .update({ votes: nextVotes })
      .eq('id', id)
      .select('votes')
      .single();

    if (writeError) {
      throw new Error(`[ESA-7006] Failed to update vote count: ${writeError.message}`);
    }

    return { votes: (updated?.votes as number) ?? nextVotes };
  }
}

// ─── PART 5: Expert Profile Helpers ──────────────────────────

export async function getExpertProfile(userId: string): Promise<ExpertProfile | null> {
  const client = getSupabaseClient();

  const { data, error } = await client
    .from(T.experts)
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) return null;
  if (!data) return null;

  return {
    userId: data.user_id as string,
    displayName: data.display_name as string | undefined,
    certifications: (data.certifications ?? []) as string[],
    verifiedAt: data.verified_at as string | undefined,
    specialties: (data.specialties ?? []) as string[],
    reputation: (data.reputation ?? 0) as number,
  };
}

// ─── Row Mappers ──────────────────────────────────────────────

interface QuestionRow {
  id: string;
  title: string;
  body: string;
  tags: string[];
  author_id: string;
  author_name?: string;
  standard_refs: string[];
  calc_refs: string[];
  votes: number;
  answer_count: number;
  status: string;
  created_at: string;
  updated_at?: string;
}

function rowToQuestion(row: QuestionRow): Question {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    tags: row.tags ?? [],
    authorId: row.author_id,
    authorName: row.author_name,
    standardRefs: row.standard_refs ?? [],
    calcRefs: row.calc_refs ?? [],
    votes: row.votes ?? 0,
    answerCount: row.answer_count ?? 0,
    status: (row.status as QuestionStatus) ?? 'open',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

interface AnswerRow {
  id: string;
  question_id: string;
  body: string;
  author_id: string;
  author_name?: string;
  is_expert: boolean;
  standard_refs: string[];
  votes: number;
  is_accepted: boolean;
  created_at: string;
}

function rowToAnswer(row: AnswerRow): Answer {
  return {
    id: row.id,
    questionId: row.question_id,
    body: row.body,
    authorId: row.author_id,
    authorName: row.author_name,
    isExpert: row.is_expert ?? false,
    standardRefs: row.standard_refs ?? [],
    votes: row.votes ?? 0,
    isAccepted: row.is_accepted ?? false,
    createdAt: row.created_at,
  };
}
