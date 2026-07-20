import type { PrecisionRegion } from '../vision/evidence-types';
import type { CoverageLedger, CoverageRegionRecord, RoleId } from './types-v3';

export function buildCoverageLedger(
  regions: PrecisionRegion[],
  rolesPresent: RoleId[] = [],
  unresolvedRescans = 0,
): CoverageLedger {
  const records: CoverageRegionRecord[] = regions.map((r) => ({
    regionId: r.regionId,
    pageIndex: r.pageIndex,
    status: r.status,
    roleCalls: {},
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
  return {
    ...ledger,
    rolesPresent: ledger.rolesPresent.includes(role)
      ? ledger.rolesPresent
      : [...ledger.rolesPresent, role],
    regions: ledger.regions.map((r) =>
      r.regionId === regionId
        ? { ...r, roleCalls: { ...r.roleCalls, [role]: callId } }
        : r),
  };
}

export function assertCoverageAllowsComplete(ledger: CoverageLedger): boolean {
  return ledger.allPlannedFinished && ledger.regionsFailed === 0 && ledger.unresolvedRescans === 0;
}
