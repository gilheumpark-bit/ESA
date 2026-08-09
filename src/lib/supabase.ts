/**
 * ESVA Supabase Client
 * ---------------------
 * User profile/tier lookup, calculation receipt storage, and paginated queries.
 */

import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js';
import { log } from '@/lib/logger';

/**
 * 저장소를 **쓸 수 없는 상태** — 우리 코드가 깨진 게 아니라 의존성이 없다.
 *
 * 라우트의 catch 가 이걸 평범한 `Error` 로 받으면 전부 500 이 된다. 실측
 * (2026-07-29 · dev): `/api/community` 와 `/api/calculate/{id}` 가 Supabase
 * 미구성만으로 500 을 냈다. **500 은 "우리 잘못" 이고 온콜을 깨운다.** 이건
 * 503 — 의존성 부재이고, 배포 설정으로 고칠 일이다. `/api/health` 는 이미
 * 그 구분을 하는데(critical down → 503) API 라우트만 안 하고 있었다.
 */
export class StoreUnavailableError extends Error {
  readonly code = 'ESVA-5030';

  constructor(message: string) {
    super(message);
    this.name = 'StoreUnavailableError';
  }
}

/** 라우트 catch 에서 쓰는 판별기 — instanceof 는 번들 경계에서 흔들린다. */
export function isStoreUnavailable(err: unknown): err is StoreUnavailableError {
  return err instanceof StoreUnavailableError
    || (err instanceof Error && err.name === 'StoreUnavailableError');
}

// ─── PART 1: Types ────────────────────────────────────────────

export interface CalculationReceipt {
  id?: string;
  user_id: string;
  calculator_id: string;
  calculator_name: string;
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
  formula_used?: string;
  standard_ref?: string;
  lang?: string;
  metadata?: Record<string, unknown>;
  receipt_hash?: string;
  country_code?: string;
  applied_standard?: string;
  unit_system?: 'SI' | 'Imperial';
  difficulty_level?: string;
  steps?: unknown[];
  standards_used?: string[];
  warnings?: string[];
  recommendations?: string[];
  disclaimer_text?: string;
  disclaimer_version?: string;
  calculated_at?: string;
  standard_version?: string;
  standard_verified_at?: string;
  engine_version?: string;
  is_standard_current?: boolean;
  is_public?: boolean;
  created_at?: string;
}

export interface PaginationOptions {
  page?: number;
  pageSize?: number;
  orderBy?: string;
  ascending?: boolean;
}

export interface PaginatedResult<T> {
  data: T[];
  count: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export type UserTier = 'free' | 'pro' | 'team' | 'enterprise';

export interface UserProfile {
  id: string;
  tier: UserTier;
  stripe_customer_id?: string | null;
  created_at?: string;
  updated_at?: string;
}

// ─── PART 2: Client Creation ──────────────────────────────────

let _client: SupabaseClient | null = null;

function getEnvVar(name: string): string {
  const val = process.env[name] ?? '';
  if (!val && process.env.NODE_ENV === 'development') {
    console.warn('[ESVA Supabase] 필수 저장소 구성이 없습니다.');
  }
  return val;
}

/**
 * Get or create the Supabase client singleton.
 * Uses NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.
 */
export function getSupabaseClient(): SupabaseClient {
  if (_client) return _client;

  const url = getEnvVar('NEXT_PUBLIC_SUPABASE_URL');
  const anonKey = getEnvVar('NEXT_PUBLIC_SUPABASE_ANON_KEY');

  if (!url || !anonKey) {
    throw new StoreUnavailableError(
      '저장 서비스를 사용할 수 없습니다. 배포 관리자에게 데이터베이스 구성을 확인해 주세요.',
    );
  }

  _client = createSupabaseClient(url, anonKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: typeof window !== 'undefined',
    },
  });

  return _client;
}

/**
 * Create a Supabase client with a service role key (server-side only).
 */
export function getSupabaseAdmin(): SupabaseClient {
  const url = getEnvVar('NEXT_PUBLIC_SUPABASE_URL');
  const serviceKey = getEnvVar('SUPABASE_SERVICE_ROLE_KEY');

  if (!url || !serviceKey) {
    throw new StoreUnavailableError('서버 저장 서비스를 사용할 수 없습니다.');
  }

  return createSupabaseClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// ─── PART 2.5: User Profile & Tier Lookup ────────────────────

const USERS_TABLE = 'users';

/** Ensure the external Firebase identity has a local profile row for FK-backed data. */
export async function ensureUserProfile(userId: string, email?: string): Promise<void> {
  const client = getSupabaseAdmin();
  const profile: { id: string; email?: string } = { id: userId };
  if (email) profile.email = email;
  const { error } = await client
    .from(USERS_TABLE)
    .upsert(profile, { onConflict: 'id', ignoreDuplicates: false });
  if (error) {
    throw new Error(`[ESVA] Failed to sync Firebase user: ${error.message}`);
  }
}

/**
 * Supabase에서 유저 구독 티어를 조회한다.
 * 프로필이 없으면 'free' 반환 (신규 유저 또는 Supabase 미설정 환경).
 */
export async function getUserTier(userId: string): Promise<UserTier> {
  try {
    const client = getSupabaseAdmin();
    const { data, error } = await client
      .from(USERS_TABLE)
      .select('tier')
      .eq('id', userId)
      .single();

    // «프로필 없음»(신규 유저·정상)과 «조회 실패»(장애)는 다른 사건이다.
    // 예전엔 한 줄로 뭉개고 로그도 없어서, Supabase 장애가 지표상 「free
    // 사용자가 유료 기능을 시도했다」로만 보였다 — 결제 고객이 강등을 겪어도
    // 아무 데도 안 잡혔다. 방향은 그대로 fail-closed(free)로 두되, 장애는
    // 장애로 기록한다. 에러 시 pro 를 돌려주는 식으로 «고치면» 안 된다.
    if (error) {
      log.error('supabase', 'getUserTier 조회 실패 — free 로 강등 응답', {
        userId,
        code: error.code,
        message: error.message,
      });
      return 'free';
    }
    if (!data) return 'free';
    const tier = data.tier as string;
    if (['free', 'pro', 'team', 'enterprise'].includes(tier)) {
      return tier as UserTier;
    }
    return 'free';
  } catch (err) {
    log.error('supabase', 'getUserTier 예외 — free 로 강등 응답', {
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
    return 'free';
  }
}

/** Return the Stripe customer bound to this verified Firebase user. */
export async function getStripeCustomerId(userId: string): Promise<string | null> {
  const client = getSupabaseAdmin();
  const { data, error } = await client
    .from(USERS_TABLE)
    .select('stripe_customer_id')
    .eq('id', userId)
    .maybeSingle();
  if (error) {
    throw new Error(`[ESVA] Failed to load billing profile: ${error.message}`);
  }
  const customerId = data?.stripe_customer_id;
  if (customerId == null || customerId === '') return null;
  if (typeof customerId !== 'string' || !/^cus_[A-Za-z0-9]+$/.test(customerId)) {
    throw new Error('[ESVA] Invalid Stripe customer identifier in billing profile.');
  }
  return customerId;
}

// ─── PART 3: Calculation Receipts ─────────────────────────────

const RECEIPTS_TABLE = 'calculation_receipts';

/**
 * Save a calculation receipt.
 */
export async function saveCalculation(
  userId: string,
  receipt: Omit<CalculationReceipt, 'user_id' | 'created_at'>,
): Promise<CalculationReceipt> {
  await ensureUserProfile(userId);
  const client = getSupabaseAdmin();

  const { data, error } = await client
    .from(RECEIPTS_TABLE)
    .insert({
      id: receipt.id,
      user_id: userId,
      calculator_id: receipt.calculator_id,
      calculator_name: receipt.calculator_name,
      inputs: receipt.inputs,
      outputs: receipt.outputs,
      formula_used: receipt.formula_used ?? null,
      standard_ref: receipt.standard_ref ?? null,
      lang: receipt.lang ?? 'ko',
      metadata: receipt.metadata ?? {},
      receipt_hash: receipt.receipt_hash ?? null,
      country_code: receipt.country_code ?? 'KR',
      applied_standard: receipt.applied_standard ?? null,
      unit_system: receipt.unit_system ?? 'SI',
      difficulty_level: receipt.difficulty_level ?? 'basic',
      steps: receipt.steps ?? [],
      standards_used: receipt.standards_used ?? [],
      warnings: receipt.warnings ?? [],
      recommendations: receipt.recommendations ?? [],
      disclaimer_text: receipt.disclaimer_text ?? null,
      disclaimer_version: receipt.disclaimer_version ?? null,
      calculated_at: receipt.calculated_at ?? new Date().toISOString(),
      standard_version: receipt.standard_version ?? null,
      standard_verified_at: receipt.standard_verified_at ?? null,
      engine_version: receipt.engine_version ?? null,
      is_standard_current: receipt.is_standard_current ?? false,
      is_public: receipt.is_public ?? false,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`[ESVA] Failed to save calculation: ${error.message}`);
  }

  return data as CalculationReceipt;
}

/**
 * Load a single calculation receipt by ID.
 */
export async function loadCalculation(id: string): Promise<CalculationReceipt | null> {
  const client = getSupabaseAdmin();

  const { data, error } = await client
    .from(RECEIPTS_TABLE)
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // Not found
    throw new Error(`[ESVA] Failed to load calculation: ${error.message}`);
  }

  return data as CalculationReceipt;
}

/**
 * List calculations for a user with pagination.
 */
export async function listUserCalculations(
  userId: string,
  opts: PaginationOptions = {},
): Promise<PaginatedResult<CalculationReceipt>> {
  const {
    page = 1,
    pageSize = 20,
    orderBy = 'created_at',
    ascending = false,
  } = opts;

  const client = getSupabaseAdmin();
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  // Get count
  const { count, error: countError } = await client
    .from(RECEIPTS_TABLE)
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);

  if (countError) {
    throw new Error(`[ESVA] Failed to count calculations: ${countError.message}`);
  }

  const totalCount = count ?? 0;

  // Get data
  const { data, error } = await client
    .from(RECEIPTS_TABLE)
    .select('*')
    .eq('user_id', userId)
    .order(orderBy, { ascending })
    .range(from, to);

  if (error) {
    throw new Error(`[ESVA] Failed to list calculations: ${error.message}`);
  }

  return {
    data: (data ?? []) as CalculationReceipt[],
    count: totalCount,
    page,
    pageSize,
    totalPages: Math.ceil(totalCount / pageSize),
  };
}

/**
 * Delete a calculation receipt (soft or hard based on table config).
 */
export async function deleteCalculation(id: string, userId: string): Promise<void> {
  const client = getSupabaseAdmin();

  const { error } = await client
    .from(RECEIPTS_TABLE)
    .delete()
    .eq('id', id)
    .eq('user_id', userId);

  if (error) {
    throw new Error(`[ESVA] Failed to delete calculation: ${error.message}`);
  }
}
