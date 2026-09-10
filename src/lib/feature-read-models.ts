import { isRecord, requireArray, requireRecord, unwrapFeatureResponse, FeatureRequestError } from './feature-request';

const string = (value: unknown): value is string => typeof value === 'string';
const count = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;
export interface ProjectListItem {
  id: string; name: string; description?: string; status: string; memberCount: number;
  calculationCount: number; userRole: 'owner' | 'editor' | 'viewer'; updatedAt: string;
}
export function decodeProjects(value: unknown): ProjectListItem[] {
  const body = requireRecord(unwrapFeatureResponse(value));
  return requireArray(body.projects, (item): item is ProjectListItem => isRecord(item)
    && string(item.id) && Boolean(item.id) && string(item.name) && string(item.status) && string(item.updatedAt)
    && (item.description === undefined || string(item.description)) && count(item.memberCount) && count(item.calculationCount)
    && ['owner', 'editor', 'viewer'].includes(String(item.userRole)));
}
export interface CommunityListItem {
  id: string; title: string; tags: string[]; authorName?: string; votes: number;
  answerCount: number; status: 'open' | 'resolved'; createdAt: string;
}
export function decodeCommunity(value: unknown) {
  const body = requireRecord(unwrapFeatureResponse(value));
  const data = requireArray(body.data, (item): item is CommunityListItem => isRecord(item) && string(item.id) && Boolean(item.id)
    && string(item.title) && Array.isArray(item.tags) && item.tags.every(string) && Number.isSafeInteger(item.votes)
    && count(item.answerCount) && ['open', 'resolved'].includes(String(item.status)) && string(item.createdAt)
    && (item.authorName === undefined || string(item.authorName)));
  if (!count(body.totalPages) || body.totalPages > 100_000) throw new FeatureRequestError('페이지 정보를 읽지 못했습니다.');
  return { data, totalPages: Math.max(1, body.totalPages) };
}
export interface DashboardData {
  calcUsage: { name: string; count: number; calculatorId: string }[]; totalCalcs: number;
  recentCalcs: { id: string; calculatorName: string; calculatorId: string; createdAt: string; summary: string }[];
  standardUpdates: { id: string; name: string; description: string; date: string; link?: string }[];
  warnings: string[]; usageComplete: boolean;
}
export function decodeDashboard(value: unknown): DashboardData {
  const envelope = requireRecord(value), body = requireRecord(unwrapFeatureResponse(value));
  if (!count(body.totalCalcs)) throw new FeatureRequestError('계산 집계 응답을 확인하지 못했습니다.');
  const calcUsage = requireArray(body.calcUsage, (row): row is DashboardData['calcUsage'][number] => isRecord(row)
    && string(row.name) && count(row.count) && string(row.calculatorId));
  const recentCalcs = requireArray(body.recentCalcs, (row): row is DashboardData['recentCalcs'][number] => isRecord(row)
    && string(row.id) && string(row.calculatorName) && string(row.calculatorId) && string(row.createdAt) && string(row.summary));
  const standardUpdates = requireArray(body.standardUpdates, (row): row is DashboardData['standardUpdates'][number] => isRecord(row)
    && string(row.id) && string(row.name) && string(row.description) && string(row.date)
    && (row.link === undefined || string(row.link)));
  const warnings = Array.isArray(envelope.warnings) ? envelope.warnings.filter(string) : [];
  return { calcUsage, recentCalcs, standardUpdates, totalCalcs: body.totalCalcs, warnings,
    usageComplete: body.usageComplete !== false };
}
