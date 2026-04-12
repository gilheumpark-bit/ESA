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

export class IsolationMatrix {
  private readonly auditLog: CrossAccessLog[] = [];

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
    this.auditLog.push(entry);

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
    this.auditLog.push(entry);
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
