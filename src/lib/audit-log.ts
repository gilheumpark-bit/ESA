/**
 * ESVA Enterprise Audit Logging
 * ------------------------------
 * Append-only audit trail for enterprise compliance.
 * Production writes require Supabase. Process-memory storage is explicit and
 * limited to development/test environments.
 *
 * PART 1: Types
 * PART 2: Write operations
 * PART 3: Query operations
 * PART 4: CSV export
 */

import { randomUUID } from 'crypto';
import { getSupabaseAdmin } from '@/lib/supabase';
import { allowEphemeralStorage } from '@/lib/storage-policy';

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1 — Types
// ═══════════════════════════════════════════════════════════════════════════════

export type AuditAction =
  | 'calc.execute'
  | 'calc.export'
  | 'search.query'
  | 'auth.login'
  | 'auth.logout'
  | 'project.create'
  | 'project.share'
  | 'notarize'
  | 'settings.change'
  | 'ocr.recognize'
  | 'sld.analyze'
  | 'admin.tenant_update'
  | 'admin.user_manage';

export interface AuditEntry {
  id: string;
  tenantId: string;
  userId: string;
  action: AuditAction;
  resource: string;
  resourceId?: string;
  details?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
  createdAt: string;
}

export interface AuditQueryOptions {
  userId?: string;
  action?: AuditAction;
  resource?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export interface AuditQueryResult {
  entries: AuditEntry[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2 — Write Operations
// ═══════════════════════════════════════════════════════════════════════════════

const AUDIT_TABLE = 'audit_log';

/**
 * Development/test-only ephemeral store, limited to 10,000 entries per tenant.
 * Production must never present this process-local data as a durable audit log.
 */
const memoryStore = new Map<string, AuditEntry[]>();
const MAX_MEMORY_ENTRIES = 10_000;

function requireEphemeralStorage(operation: string): void {
  if (!allowEphemeralStorage()) {
    throw new Error(`감사로그 ${operation} 저장소를 사용할 수 없습니다.`);
  }
}

function getSupabaseClientSafe() {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return null;
    return getSupabaseAdmin();
  } catch {
    return null;
  }
}

/**
 * Write an audit log entry.
 * Uses durable Supabase storage in production. Ephemeral storage is available
 * only when explicitly allowed for development/test.
 */
export async function logAudit(
  entry: Omit<AuditEntry, 'id' | 'createdAt'>,
): Promise<void> {
  const fullEntry: AuditEntry = {
    ...entry,
    id: generateId(),
    createdAt: new Date().toISOString(),
  };

  // Try Supabase
  const client = getSupabaseClientSafe();
  if (client) {
    try {
      const { error } = await client.from(AUDIT_TABLE).insert({
        id: fullEntry.id,
        tenant_id: fullEntry.tenantId,
        user_id: fullEntry.userId,
        action: fullEntry.action,
        resource: fullEntry.resource,
        resource_id: fullEntry.resourceId ?? null,
        details: fullEntry.details ?? null,
        ip: fullEntry.ip ?? null,
        user_agent: fullEntry.userAgent ?? null,
        created_at: fullEntry.createdAt,
      });

      if (error) throw error;
      return;
    } catch {
      requireEphemeralStorage('기록');
    }
  }

  requireEphemeralStorage('기록');
  const tenantEntries = memoryStore.get(entry.tenantId) ?? [];
  tenantEntries.push(fullEntry);

  // Trim if over limit
  if (tenantEntries.length > MAX_MEMORY_ENTRIES) {
    tenantEntries.splice(0, tenantEntries.length - MAX_MEMORY_ENTRIES);
  }

  memoryStore.set(entry.tenantId, tenantEntries);
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 3 — Query Operations
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Query audit log entries for a tenant.
 */
export async function getAuditLog(
  tenantId: string,
  opts: AuditQueryOptions = {},
): Promise<AuditQueryResult> {
  const { page = 1, pageSize = 50 } = opts;

  // Try Supabase
  const client = getSupabaseClientSafe();
  if (client) {
    try {
      let query = client
        .from(AUDIT_TABLE)
        .select('*', { count: 'exact' })
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false });

      if (opts.userId) query = query.eq('user_id', opts.userId);
      if (opts.action) query = query.eq('action', opts.action);
      if (opts.resource) query = query.eq('resource', opts.resource);
      if (opts.from) query = query.gte('created_at', opts.from);
      if (opts.to) query = query.lte('created_at', opts.to);

      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      query = query.range(from, to);

      const { data, count, error } = await query;

      if (error) throw error;
      const entries = (data ?? []).map(mapDbToEntry);
      const total = count ?? 0;
      return {
        entries,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      };
    } catch {
      requireEphemeralStorage('조회');
    }
  }

  requireEphemeralStorage('조회');
  let entries = memoryStore.get(tenantId) ?? [];

  // Apply filters
  if (opts.userId) entries = entries.filter(e => e.userId === opts.userId);
  if (opts.action) entries = entries.filter(e => e.action === opts.action);
  if (opts.resource) entries = entries.filter(e => e.resource === opts.resource);
  if (opts.from) entries = entries.filter(e => e.createdAt >= opts.from!);
  if (opts.to) entries = entries.filter(e => e.createdAt <= opts.to!);

  // Sort by date descending
  entries = [...entries].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const total = entries.length;
  const start = (page - 1) * pageSize;
  const paged = entries.slice(start, start + pageSize);

  return {
    entries: paged,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 4 — CSV Export
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Export audit log as CSV Blob.
 * Fetches ALL entries matching the filter (not paginated).
 */
export async function exportAuditLog(
  tenantId: string,
  opts: Omit<AuditQueryOptions, 'page' | 'pageSize'> = {},
): Promise<Blob> {
  // Fetch all entries (use large page size)
  const result = await getAuditLog(tenantId, { ...opts, page: 1, pageSize: 100_000 });
  const { entries } = result;

  const headers = ['ID', 'Timestamp', 'User ID', 'Action', 'Resource', 'Resource ID', 'Details', 'IP', 'User Agent'];
  const rows = entries.map(e => [
    e.id,
    e.createdAt,
    e.userId,
    e.action,
    e.resource,
    e.resourceId ?? '',
    e.details ? JSON.stringify(e.details) : '',
    e.ip ?? '',
    e.userAgent ?? '',
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')),
  ].join('\n');

  return new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8' });
}

// ═══════════════════════════════════════════════════════════════════════════════
// Internal Helpers
// ═══════════════════════════════════════════════════════════════════════════════

function generateId(): string {
  return randomUUID();
}

function mapDbToEntry(row: Record<string, unknown>): AuditEntry {
  return {
    id: row.id as string,
    tenantId: row.tenant_id as string,
    userId: row.user_id as string,
    action: row.action as AuditAction,
    resource: row.resource as string,
    resourceId: (row.resource_id as string) ?? undefined,
    details: (row.details as Record<string, unknown>) ?? undefined,
    ip: (row.ip as string) ?? undefined,
    userAgent: (row.user_agent as string) ?? undefined,
    createdAt: row.created_at as string,
  };
}
