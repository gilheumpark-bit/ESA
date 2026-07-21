import type { ESVAVerifiedReport } from '@/agent/teams/types';
import { hashCanonicalValue } from '@/engine/receipt/receipt-hash';

export async function verifyReportIntegrity(
  report: ESVAVerifiedReport,
): Promise<boolean> {
  if (!report || !/^[a-f0-9]{64}$/.test(report.hash)) return false;
  const { hash, ...claim } = report;
  return await hashCanonicalValue(claim) === hash;
}
