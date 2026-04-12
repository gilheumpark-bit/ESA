// ============================================================
// ESVA Scope-Based Rule Precedence
// ============================================================
// 계산기 검증 규칙의 3계층 정책 관리.
// global(전체) > workspace(프로젝트) > module(개별 계산기) 우선순위.
// 원본: eh-universe-web/packages/quill-engine/src/scope-policy.ts

// ============================================================
// PART 1 — Types
// ============================================================

export type PolicyScope = 'module' | 'workspace' | 'global';
export type PolicyAction = 'enforce' | 'suppress' | 'warn';

export interface ScopedRule {
  ruleId: string;
  scope: PolicyScope;
  action: PolicyAction;
  overriddenBy?: string;
}

interface StoredPolicy {
  global: Record<string, PolicyAction>;
  workspace: Record<string, PolicyAction>;
  modules: Record<string, Record<string, PolicyAction>>;
}

const STORAGE_KEY = 'esa-scope-policy-v1';

// ============================================================
// PART 2 — PolicyManager Singleton
// ============================================================

export class PolicyManager {
  private static instance: PolicyManager | null = null;

  private globalRules: Map<string, ScopedRule> = new Map();
  private workspaceRules: Map<string, ScopedRule> = new Map();
  private moduleRules: Map<string, Map<string, ScopedRule>> = new Map();
  private effectiveCache: Map<string, ScopedRule[]> = new Map();

  private constructor() {
    this.load();
  }

  static getInstance(): PolicyManager {
    if (!PolicyManager.instance) {
      PolicyManager.instance = new PolicyManager();
    }
    return PolicyManager.instance;
  }

  static resetInstance(): void {
    PolicyManager.instance = null;
  }

  setGlobalRule(ruleId: string, action: PolicyAction): void {
    this.globalRules.set(ruleId, { ruleId, scope: 'global', action });
    this.invalidateAllCaches();
  }

  setWorkspaceRule(ruleId: string, action: PolicyAction): void {
    this.workspaceRules.set(ruleId, { ruleId, scope: 'workspace', action });
    this.invalidateAllCaches();
  }

  setModuleRule(calcId: string, ruleId: string, action: PolicyAction): void {
    if (!this.moduleRules.has(calcId)) {
      this.moduleRules.set(calcId, new Map());
    }
    this.moduleRules.get(calcId)!.set(ruleId, { ruleId, scope: 'module', action });
    this.effectiveCache.delete(calcId);
  }

  /** 규칙 해석: global > workspace > module 우선 */
  resolve(ruleId: string, calcId: string): ScopedRule {
    const globalRule = this.globalRules.get(ruleId);
    if (globalRule) return globalRule;

    const wsRule = this.workspaceRules.get(ruleId);
    if (wsRule) return wsRule;

    const modRules = this.moduleRules.get(calcId);
    const modRule = modRules?.get(ruleId);
    if (modRule) return modRule;

    return { ruleId, scope: 'module', action: 'enforce' };
  }

  /** 특정 계산기에 적용되는 모든 규칙 조회 */
  getEffective(calcId: string): ScopedRule[] {
    const cached = this.effectiveCache.get(calcId);
    if (cached) return cached;

    const merged = new Map<string, ScopedRule>();

    const modRules = this.moduleRules.get(calcId);
    if (modRules) {
      for (const [id, rule] of modRules) merged.set(id, { ...rule });
    }
    for (const [id, rule] of this.workspaceRules) merged.set(id, { ...rule });
    for (const [id, rule] of this.globalRules) merged.set(id, { ...rule });

    const result = Array.from(merged.values());
    this.effectiveCache.set(calcId, result);
    return result;
  }

  private invalidateAllCaches(): void {
    this.effectiveCache.clear();
  }

  save(): void {
    if (typeof globalThis.localStorage === 'undefined') return;
    try {
      const data: StoredPolicy = {
        global: Object.fromEntries(
          Array.from(this.globalRules.entries()).map(([id, r]) => [id, r.action]),
        ),
        workspace: Object.fromEntries(
          Array.from(this.workspaceRules.entries()).map(([id, r]) => [id, r.action]),
        ),
        modules: Object.fromEntries(
          Array.from(this.moduleRules.entries()).map(([path, rules]) => [
            path,
            Object.fromEntries(Array.from(rules.entries()).map(([id, r]) => [id, r.action])),
          ]),
        ),
      };
      globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch { /* silent */ }
  }

  load(): void {
    if (typeof globalThis.localStorage === 'undefined') return;
    try {
      const raw = globalThis.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data: StoredPolicy = JSON.parse(raw);

      this.globalRules.clear();
      this.workspaceRules.clear();
      this.moduleRules.clear();

      if (data.global) {
        for (const [id, action] of Object.entries(data.global)) {
          this.globalRules.set(id, { ruleId: id, scope: 'global', action: action as PolicyAction });
        }
      }
      if (data.workspace) {
        for (const [id, action] of Object.entries(data.workspace)) {
          this.workspaceRules.set(id, { ruleId: id, scope: 'workspace', action: action as PolicyAction });
        }
      }
      if (data.modules) {
        for (const [path, rules] of Object.entries(data.modules)) {
          const map = new Map<string, ScopedRule>();
          for (const [id, action] of Object.entries(rules)) {
            map.set(id, { ruleId: id, scope: 'module', action: action as PolicyAction });
          }
          this.moduleRules.set(path, map);
        }
      }
      this.invalidateAllCaches();
    } catch { /* corrupted — ignore */ }
  }
}

// ============================================================
// PART 3 — 검증 결과 필터링 헬퍼
// ============================================================

/** 검증 findings에 scope policy 적용. suppress → 제거, warn → 유지, enforce → 유지 */
export function applyScopePolicy(
  findings: string[],
  calcId: string,
  policy?: PolicyManager,
): string[] {
  const mgr = policy ?? PolicyManager.getInstance();
  if (findings.length === 0) return findings;

  return findings.filter((finding) => {
    const ruleMatch = finding.match(/\[([A-Z_]+(?:-[A-Z0-9]+)*)\]/);
    if (!ruleMatch) return true;
    const resolved = mgr.resolve(ruleMatch[1], calcId);
    return resolved.action !== 'suppress';
  });
}
