import type { CoverageLedger, CoverageRegionRecord, RoleId } from './types-v3';

export interface CoverageRegionPlan {
  regionId: string;
  pageIndex: number;
  kind: CoverageRegionRecord['kind'];
  bounds: CoverageRegionRecord['bounds'];
  requiredRoles: RoleId[];
  skippedEmptyEvidenceHash?: string;
}

export function createCoverageRegions(plans: CoverageRegionPlan[]): CoverageRegionRecord[] {
  return plans.map((plan) => ({
    regionId: plan.regionId,
    pageIndex: plan.pageIndex,
    kind: plan.kind,
    bounds: { ...plan.bounds },
    status: plan.skippedEmptyEvidenceHash ? 'skipped-empty' : 'planned',
    requiredRoles: [...new Set(plan.requiredRoles)],
    roleCalls: {},
    emptyEvidenceHash: plan.skippedEmptyEvidenceHash,
  }));
}

export function recordRoleCall(
  regions: CoverageRegionRecord[],
  regionId: string,
  role: RoleId,
  callId: string,
  success: boolean,
  error?: string,
): CoverageRegionRecord[] {
  return regions.map((region) => {
    if (region.regionId !== regionId || region.status === 'skipped-empty') return region;
    const attempts = [...(region.roleCalls[role] ?? []), {
      callId,
      success,
      ...(error ? { error } : {}),
    }];
    const roleCalls = { ...region.roleCalls, [role]: attempts };
    return {
      ...region,
      roleCalls,
      status: deriveRegionStatus(region.requiredRoles, roleCalls),
    };
  });
}

export function buildCoverageLedger(
  regions: CoverageRegionRecord[],
  rolesPresent: RoleId[] = [],
  unresolvedRescans = 0,
): CoverageLedger {
  const records = regions.map((region) => ({
    ...region,
    bounds: { ...region.bounds },
    requiredRoles: [...region.requiredRoles],
    roleCalls: Object.fromEntries(Object.entries(region.roleCalls).map(([role, calls]) => [
      role,
      calls?.map((call) => ({ ...call })) ?? [],
    ])) as CoverageRegionRecord['roleCalls'],
  }));

  const regionsComplete = records.filter((r) => r.status === 'complete').length;
  const regionsFailed = records.filter((r) => r.status === 'failed').length;
  const regionsSkippedEmpty = records.filter((r) => r.status === 'skipped-empty').length;
  const planned = records.filter((r) => r.status === 'planned' || r.status === 'running').length;

  return {
    plannedRegionCount: records.length,
    regionsComplete,
    regionsFailed,
    regionsSkippedEmpty,
    regions: records,
    rolesPresent: [...new Set(rolesPresent)],
    unresolvedRescans,
    allPlannedFinished: planned === 0,
  };
}

export function attachRoleCall(
  ledger: CoverageLedger,
  regionId: string,
  role: RoleId,
  callId: string,
): CoverageLedger {
  return buildCoverageLedger(
    recordRoleCall(ledger.regions, regionId, role, callId, true),
    ledger.rolesPresent.includes(role) ? ledger.rolesPresent : [...ledger.rolesPresent, role],
    ledger.unresolvedRescans,
  );
}

export function assertCoverageAllowsComplete(ledger: CoverageLedger): boolean {
  return ledger.allPlannedFinished && ledger.regionsFailed === 0 && ledger.unresolvedRescans === 0;
}

function deriveRegionStatus(
  requiredRoles: RoleId[],
  roleCalls: CoverageRegionRecord['roleCalls'],
): CoverageRegionRecord['status'] {
  if (requiredRoles.length === 0) return 'complete';
  const hasAnyAttempt = requiredRoles.some((role) => (roleCalls[role]?.length ?? 0) > 0);
  const allSucceeded = requiredRoles.every((role) => roleCalls[role]?.some((call) => call.success));
  if (allSucceeded) return 'complete';
  const exhaustedFailure = requiredRoles.some((role) => {
    const calls = roleCalls[role] ?? [];
    return calls.length > 0 && calls.every((call) => !call.success);
  });
  if (exhaustedFailure) return 'failed';
  return hasAnyAttempt ? 'running' : 'planned';
}
