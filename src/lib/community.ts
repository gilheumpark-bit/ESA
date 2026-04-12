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
    query = query.or(`title.ilike.%${search}%,body.ilike.%${search}%`);
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

  // Read current votes, apply delta, write back
  const { data: current } = await admin
    .from(table)
    .select('votes')
    .eq('id', id)
    .single();

  const newVotes = ((current?.votes as number) ?? 0) + delta;

  await admin
    .from(table)
    .update({ votes: newVotes })
    .eq('id', id);

  return { votes: newVotes };
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
