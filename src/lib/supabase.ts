/**
 * ESVA Supabase Client
 * ---------------------
 * User profile/tier lookup, calculation receipt storage, user projects, paginated queries.
 */

import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js';

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
  created_at?: string;
}

export interface ProjectData {
  id?: string;
  user_id: string;
  name: string;
  description?: string;
  calculation_ids: string[];
  tags?: string[];
  metadata?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
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
  if (!val) {
    console.warn(`[ESVA Supabase] Missing env var: ${name}`);
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
    throw new Error('[ESVA] Supabase not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.');
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
    throw new Error('[ESVA] Supabase admin not configured. Set SUPABASE_SERVICE_ROLE_KEY.');
  }

  return createSupabaseClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// ─── PART 2.5: User Profile & Tier Lookup ────────────────────

const USER_PROFILES_TABLE = 'user_profiles';

/**
 * Supabase에서 유저 구독 티어를 조회한다.
 * 프로필이 없으면 'free' 반환 (신규 유저 또는 Supabase 미설정 환경).
 */
export async function getUserTier(userId: string): Promise<UserTier> {
  try {
    const client = getSupabaseClient();
    const { data, error } = await client
      .from(USER_PROFILES_TABLE)
      .select('tier')
      .eq('id', userId)
      .single();

    if (error || !data) return 'free';
    const tier = data.tier as string;
    if (['free', 'pro', 'team', 'enterprise'].includes(tier)) {
      return tier as UserTier;
    }
    return 'free';
  } catch {
    return 'free';
  }
}

// ─── PART 3: Calculation Receipts ─────────────────────────────

const RECEIPTS_TABLE = 'calculation_receipts';

/**
 * Save a calculation receipt.
 */
export async function saveCalculation(
  userId: string,
  receipt: Omit<CalculationReceipt, 'id' | 'user_id' | 'created_at'>,
): Promise<CalculationReceipt> {
  const client = getSupabaseClient();

  const { data, error } = await client
    .from(RECEIPTS_TABLE)
    .insert({
      user_id: userId,
      calculator_id: receipt.calculator_id,
      calculator_name: receipt.calculator_name,
      inputs: receipt.inputs,
      outputs: receipt.outputs,
      formula_used: receipt.formula_used ?? null,
      standard_ref: receipt.standard_ref ?? null,
      lang: receipt.lang ?? 'ko',
      metadata: receipt.metadata ?? {},
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
  const client = getSupabaseClient();

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

  const client = getSupabaseClient();
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
  const client = getSupabaseClient();

  const { error } = await client
    .from(RECEIPTS_TABLE)
    .delete()
    .eq('id', id)
    .eq('user_id', userId);

  if (error) {
    throw new Error(`[ESVA] Failed to delete calculation: ${error.message}`);
  }
}

// ─── PART 4: Projects ─────────────────────────────────────────

const PROJECTS_TABLE = 'projects';

/**
 * Save a project (linked calculations).
 */
export async function saveProject(
  userId: string,
  projectData: Omit<ProjectData, 'id' | 'user_id' | 'created_at' | 'updated_at'>,
): Promise<ProjectData> {
  const client = getSupabaseClient();

  const { data, error } = await client
    .from(PROJECTS_TABLE)
    .insert({
      user_id: userId,
      name: projectData.name,
      description: projectData.description ?? null,
      calculation_ids: projectData.calculation_ids,
      tags: projectData.tags ?? [],
      metadata: projectData.metadata ?? {},
    })
    .select()
    .single();

  if (error) {
    throw new Error(`[ESVA] Failed to save project: ${error.message}`);
  }

  return data as ProjectData;
}

/**
 * Load a single project by ID.
 */
export async function loadProject(id: string): Promise<ProjectData | null> {
  const client = getSupabaseClient();

  const { data, error } = await client
    .from(PROJECTS_TABLE)
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw new Error(`[ESVA] Failed to load project: ${error.message}`);
  }

  return data as ProjectData;
}

/**
 * List projects for a user.
 */
export async function listUserProjects(
  userId: string,
  opts: PaginationOptions = {},
): Promise<PaginatedResult<ProjectData>> {
  const {
    page = 1,
    pageSize = 20,
    orderBy = 'updated_at',
    ascending = false,
  } = opts;

  const client = getSupabaseClient();
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { count, error: countError } = await client
    .from(PROJECTS_TABLE)
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);

  if (countError) {
    throw new Error(`[ESVA] Failed to count projects: ${countError.message}`);
  }

  const totalCount = count ?? 0;

  const { data, error } = await client
    .from(PROJECTS_TABLE)
    .select('*')
    .eq('user_id', userId)
    .order(orderBy, { ascending })
    .range(from, to);

  if (error) {
    throw new Error(`[ESVA] Failed to list projects: ${error.message}`);
  }

  return {
    data: (data ?? []) as ProjectData[],
    count: totalCount,
    page,
    pageSize,
    totalPages: Math.ceil(totalCount / pageSize),
  };
}

/**
 * Update a project.
 */
export async function updateProject(
  id: string,
  userId: string,
  updates: Partial<Pick<ProjectData, 'name' | 'description' | 'calculation_ids' | 'tags' | 'metadata'>>,
): Promise<ProjectData> {
  const client = getSupabaseClient();

  const { data, error } = await client
    .from(PROJECTS_TABLE)
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) {
    throw new Error(`[ESVA] Failed to update project: ${error.message}`);
  }

  return data as ProjectData;
}
