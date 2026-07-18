/**
 * ESVA Isolation Matrix
 * ────────────────────
 * Enforces sandbox isolation: no direct sandbox-to-sandbox communication.
 * All cross-sandbox data flow MUST go through the Bridge Agent.
 *
 * PART 1: IsolationMatrix class
 * PART 2: Data scope validation
 * PART 3: Audit logging
 */

import type { SandboxId, CrossAccessLog, CountryCode, Genre } from '@agent/types';
import { SANDBOX_REGISTRY } from './sandbox-registry';

// ─── PART 1: IsolationMatrix ────────────────────────────────────

// 감사 로그 최대 보관 엔트리 수 — 프로세스 수명 동안 무한 증가 방지 (CLAUDE.md In-memory Maps 규칙)
const MAX_AUDIT_ENTRIES = 5000;

export class IsolationMatrix {
  private readonly auditLog: CrossAccessLog[] = [];

  /**
   * 감사 로그에 엔트리를 추가하되, MAX_AUDIT_ENTRIES 상한을 넘으면
   * 가장 오래된 엔트리부터 제거(FIFO)하여 heap 무한 증가를 방지한다.
   */
  private appendLog(entry: CrossAccessLog): void {
    this.auditLog.push(entry);
    if (this.auditLog.length > MAX_AUDIT_ENTRIES) {
      // 초과분만큼 앞에서 잘라냄 (오래된 것 우선 폐기)
      this.auditLog.splice(0, this.auditLog.length - MAX_AUDIT_ENTRIES);
    }
  }

  /**
   * Assert that direct communication between two sandboxes is forbidden.
   * This method ALWAYS throws — it exists to enforce the type-level constraint
   * that sandboxes cannot directly call each other.
   *
   * @throws Always throws IsolationViolationError
   */
  assertIsolation(from: SandboxId, to: SandboxId): never {
    const entry: CrossAccessLog = {
      timestamp: new Date().toISOString(),
      from,
      to,
      reason: `BLOCKED: Direct access attempted from ${from} to ${to}`,
      bridgeMediated: false,
    };
    this.appendLog(entry);

    throw new IsolationViolationError(
      `Direct sandbox communication forbidden: ${from} → ${to}. ` +
      `All cross-sandbox access must be mediated by the Bridge Agent.`,
    );
  }

  /**
   * Validate that a sandbox is allowed to access a document
   * based on its configured data scope.
   *
   * Rules:
   * - A sandbox can only access documents from its own country scope
   * - A sandbox can only access documents from its own genre scope
   * - 'global' country scope can access any country's documents
   */
  validateDataScope(
    sandboxId: SandboxId,
    documentCountry: CountryCode | 'global',
    documentGenre: Genre,
  ): boolean {
    const config = SANDBOX_REGISTRY.get(sandboxId);
    if (!config) return false;

    // Country check: sandbox's country must match document's country
    // Exception: 'global' scope sandboxes can access any country
    const countryAllowed =
      config.country === 'global' ||
      documentCountry === 'global' ||
      config.country === documentCountry;

    // Genre check: sandbox's genre must match document's genre
    const genreAllowed = config.genre === documentGenre;

    return countryAllowed && genreAllowed;
  }

  /**
   * Log a bridge-mediated cross-sandbox access.
   * This is the ONLY legitimate way for data to flow between sandboxes.
   */
  logCrossAccess(from: SandboxId, to: SandboxId, reason: string): void {
    const entry: CrossAccessLog = {
      timestamp: new Date().toISOString(),
      from,
      to,
      reason,
      bridgeMediated: true,
    };
    this.appendLog(entry);
  }

  /**
   * Get all audit log entries.
   */
  getAuditLog(): ReadonlyArray<CrossAccessLog> {
    return [...this.auditLog];
  }

  /**
   * Get only violation entries (direct access attempts).
   */
  getViolations(): ReadonlyArray<CrossAccessLog> {
    return this.auditLog.filter(entry => !entry.bridgeMediated);
  }

  /**
   * Clear the audit log (for testing or session reset).
   */
  clearLog(): void {
    this.auditLog.length = 0;
  }
}

// ─── PART 2: Error Types ────────────────────────────────────────

export class IsolationViolationError extends Error {
  public readonly from: SandboxId | undefined;
  public readonly to: SandboxId | undefined;

  constructor(message: string, from?: SandboxId, to?: SandboxId) {
    super(message);
    this.name = 'IsolationViolationError';
    this.from = from;
    this.to = to;
  }
}

// ─── PART 3: Singleton ──────────────────────────────────────────

/**
 * Global isolation matrix instance.
 * Shared across the entire agent system for consistent enforcement.
 */
let _instance: IsolationMatrix | null = null;

export function getIsolationMatrix(): IsolationMatrix {
  if (!_instance) {
    _instance = new IsolationMatrix();
  }
  return _instance;
}

/**
 * Reset the global isolation matrix (testing only).
 */
export function resetIsolationMatrix(): void {
  _instance = null;
}
