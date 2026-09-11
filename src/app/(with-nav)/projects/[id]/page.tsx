'use client';

import { copyTextWithFallback } from '@/lib/clipboard';

/**
 * Project Detail Page — 프로젝트 상세
 *
 * PART 1: Types
 * PART 2: Member list component
 * PART 3: Calculation timeline component
 * PART 4: Share dialog
 * PART 5: Main page
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { featureAuthenticatedFetch as authenticatedFetch } from '@/lib/feature-auth';
import { requestFeatureJson, requireRecord, FeatureRequestError } from '@/lib/feature-request';
import { safeFeatureLink } from '@/lib/feature-output';
import { FeatureDialog } from '@/components/FeatureDialog';
import { useAuth } from '@/contexts/AuthContext';
import {
  ArrowLeft,
  Users,
  Calculator,
  Share2,
  Plus,
  UserPlus,
  Trash2,
  Crown,
  Pencil,
  Eye,
  Copy,
  Check,
  Lock,
  Clock,
  FileText,
  X,
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1 — Types
// ═══════════════════════════════════════════════════════════════════════════════

interface ProjectDetail {
  id: string;
  name: string;
  description?: string;
  status: string;
  ownerId: string;
  members: MemberInfo[];
  calculations: CalculationSummary[];
  createdAt: string;
  updatedAt: string;
}

interface MemberInfo {
  userId: string;
  email?: string;
  role: 'owner' | 'editor' | 'viewer';
  joinedAt?: string;
}

interface CalculationSummary {
  id: string;
  calculatorName: string;
  calculatorId: string;
  createdAt: string;
  value?: number;
  unit?: string;
}

const ROLE_CONFIG = {
  owner: { label: 'Owner', icon: Crown, color: 'text-amber-600' },
  editor: { label: 'Editor', icon: Pencil, color: 'text-blue-600' },
  viewer: { label: 'Viewer', icon: Eye, color: 'text-[var(--text-secondary)]' },
};

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2 — Member List Component
// ═══════════════════════════════════════════════════════════════════════════════

function MemberList({
  members,
  isOwner,
  onInvite,
  onRemove,
  busy = false,
}: {
  members: MemberInfo[];
  isOwner: boolean;
  onInvite: () => void;
  onRemove: (member: MemberInfo) => void;
  busy?: boolean;
}) {
  return (
    <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-primary)] p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-[var(--text-primary)] flex items-center gap-2">
          <Users className="h-5 w-5 text-[var(--text-secondary)]" />
          멤버 ({members.length})
        </h2>
        {isOwner && (
          <button
            type="button"
            disabled={busy}
            onClick={onInvite}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-100"
          >
            <UserPlus className="h-4 w-4" />
            초대
          </button>
        )}
      </div>

      <ul className="divide-y divide-gray-100">
        {members.map((member) => {
          const config = ROLE_CONFIG[member.role];
          const RoleIcon = config.icon;

          return (
            <li key={member.userId || member.email} className="flex items-center justify-between py-3">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--bg-tertiary)] text-sm font-medium text-[var(--text-secondary)]">
                  {(member.email ?? member.userId ?? '?').charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="break-all text-sm font-medium text-[var(--text-primary)]">
                    {member.email ?? member.userId}
                  </p>
                  <p className={`text-xs flex items-center gap-1 ${config.color}`}>
                    <RoleIcon className="h-3 w-3" />
                    {config.label}
                    {!member.joinedAt && ' · 초대 대기'}
                  </p>
                </div>
              </div>

              {isOwner && member.role !== 'owner' && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onRemove(member)}
                  className="rounded p-1.5 text-[var(--text-secondary)] hover:bg-red-50 hover:text-red-500"
                  title="멤버 제거"
                  aria-label={`${member.email ?? member.userId} 멤버 제거`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 3 — Calculation Timeline
// ═══════════════════════════════════════════════════════════════════════════════

function CalculationTimeline({
  calculations,
  canEdit,
  onAdd,
}: {
  calculations: CalculationSummary[];
  canEdit: boolean;
  onAdd: () => void;
}) {
  return (
    <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-primary)] p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-[var(--text-primary)] flex items-center gap-2">
          <Calculator className="h-5 w-5 text-[var(--text-secondary)]" />
          계산 내역 ({calculations.length})
        </h2>
        {canEdit && (
          <button
            onClick={onAdd}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-100"
          >
            <Plus className="h-4 w-4" />
            계산 추가
          </button>
        )}
      </div>

      {calculations.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[var(--border-default)] p-8 text-center">
          <FileText className="mx-auto h-8 w-8 text-gray-300" />
          <p className="mt-2 text-sm text-[var(--text-secondary)]">아직 계산 내역이 없습니다</p>
        </div>
      ) : (
        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200" />

          <ul className="space-y-4">
            {calculations.map((calc, idx) => (
              <li key={calc.id} className="relative flex items-start gap-4 pl-10">
                {/* Timeline dot */}
                <div className="absolute left-2.5 top-1.5 h-3 w-3 rounded-full border-2 border-blue-500 bg-[var(--bg-primary)]" />

                <Link
                  href={`/receipt/${encodeURIComponent(calc.id)}`}
                  className="flex-1 rounded-lg border border-gray-100 bg-[var(--bg-secondary)] p-3 hover:bg-blue-50 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-[var(--text-primary)]">
                      {calc.calculatorName}
                    </span>
                    <span className="text-xs text-[var(--text-secondary)]">
                      #{idx + 1}
                    </span>
                  </div>
                  {calc.value !== undefined && (
                    <p className="mt-1 text-lg font-semibold text-blue-700">
                      {calc.value} {calc.unit}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-[var(--text-secondary)] flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {new Date(calc.createdAt).toLocaleString('ko-KR')}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 4 — Share Dialog
// ═══════════════════════════════════════════════════════════════════════════════

function ShareDialog({
  projectId,
  onClose,
}: {
  projectId: string;
  onClose: () => void;
}) {
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [expireHours, setExpireHours] = useState<number>(72);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => { request.current?.abort(); }, []);

  const handleGenerate = async () => {
    if (request.current) return;
    if (password && password.length < 8) { setError('공유 비밀번호는 8자 이상이어야 합니다.'); return; }
    const controller = new AbortController(); request.current = controller;
    setLoading(true);
    setError(null);
    try {
      const shareUrl = await requestFeatureJson(`/api/projects/${encodeURIComponent(projectId)}`, {
        method: 'PATCH', signal: controller.signal, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'generateShareLink', expireHours, password: password || undefined }),
      }, (value) => {
        const link = safeFeatureLink(requireRecord(value).url);
        if (!link) throw new FeatureRequestError('공유 링크 응답을 확인하지 못했습니다.');
        return link;
      }, authenticatedFetch);
      if (!controller.signal.aborted) setShareUrl(shareUrl);
    } catch (generateError) {
      if (!controller.signal.aborted) setError(generateError instanceof Error ? generateError.message : '공유 링크 생성에 실패했습니다.');
    } finally {
      if (!controller.signal.aborted) setLoading(false);
      if (request.current === controller) request.current = null;
    }
  };

  const handleCopy = async () => {
    if (!shareUrl) return;
    if (!(await copyTextWithFallback(shareUrl, '공유 링크:'))) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <FeatureDialog label="프로젝트 공유" busy={loading} onClose={onClose}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-[var(--text-primary)] flex items-center gap-2">
            <Share2 className="h-5 w-5" />
            프로젝트 공유
          </h3>
          <button type="button" aria-label="프로젝트 공유 닫기" disabled={loading} onClick={onClose} className="rounded p-1 hover:bg-[var(--bg-tertiary)]">
            <X className="h-5 w-5 text-[var(--text-secondary)]" />
          </button>
        </div>

        {!shareUrl ? (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">
                만료 시간
              </label>
              <select
                aria-label="공유 만료 시간"
                value={expireHours}
                onChange={(e) => setExpireHours(Number(e.target.value))}
                className="w-full rounded-lg border border-[var(--border-hover)] px-3 py-2 text-sm"
              >
                <option value={24}>24시간</option>
                <option value={72}>3일</option>
                <option value={168}>7일</option>
                <option value={720}>30일</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">
                비밀번호 (선택)
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-secondary)]" />
                <input
                  type="password"
                  aria-label="공유 비밀번호"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="비밀번호 미입력 시 공개 링크"
                  minLength={8}
                  maxLength={128}
                  className="w-full rounded-lg border border-[var(--border-hover)] pl-10 pr-3 py-2 text-sm"
                />
              </div>
            </div>

            <button
              onClick={handleGenerate}
              disabled={loading}
              className="w-full rounded-lg bg-blue-600 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? '생성 중...' : '공유 링크 생성'}
            </button>
            {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2 rounded-lg bg-[var(--bg-secondary)] p-3">
              <input
                type="text"
                readOnly
                aria-label="생성된 공유 링크"
                value={shareUrl}
                className="min-w-0 flex-1 bg-transparent text-sm text-[var(--text-primary)] outline-none"
              />
              <button
                type="button"
                aria-label={copied ? '공유 링크 복사 완료' : '공유 링크 복사'}
                onClick={handleCopy}
                className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-xs text-[var(--text-secondary)]">
              {password ? '비밀번호가 설정된 링크입니다.' : '누구나 이 링크로 프로젝트를 볼 수 있습니다.'}
            </p>
          </div>
        )}
    </FeatureDialog>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 5 — Main Page
// ═══════════════════════════════════════════════════════════════════════════════

export default function ProjectDetailPage() {
  const params = useParams(); const { user, loading } = useAuth();
  if (loading) return <p role="status" className="p-8 text-sm">로그인 상태를 확인하고 있습니다.</p>;
  return <ProjectDetailContent key={`${user?.uid ?? 'anonymous'}:${String(params.id)}`} />;
}
function ProjectDetailContent() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;
  const { user, loading: authLoading } = useAuth();

  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showShare, setShowShare] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'editor' | 'viewer'>('viewer');
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionPending, setActionPending] = useState(false);
  const actionInFlight = useRef(false);
  const loadRequest = useRef<AbortController | null>(null);
  const actionRequest = useRef<AbortController | null>(null);
  useEffect(() => () => { actionRequest.current?.abort(); }, []);

  const fetchProject = useCallback(async () => {
    if (authLoading) return;
    loadRequest.current?.abort();
    const controller = new AbortController();
    loadRequest.current = controller;
    const isCurrent = () => loadRequest.current === controller && !controller.signal.aborted;
    setLoading(true);
    setError(null);
    try {
      if (!user) throw new Error('로그인 후 프로젝트를 확인할 수 있습니다.');
      const data = await requestFeatureJson(`/api/projects/${encodeURIComponent(projectId)}`, { signal: controller.signal }, (value) => {
        const row = requireRecord(value);
        if (row.id !== projectId || typeof row.name !== 'string' || !Array.isArray(row.members) || !Array.isArray(row.calculations)
          || !row.members.every((member) => member && typeof member.userId === 'string' && ['owner','editor','viewer'].includes(member.role))) {
          throw new FeatureRequestError('프로젝트 응답 형식을 확인하지 못했습니다.');
        }
        return row as unknown as ProjectDetail;
      }, authenticatedFetch);
      if (!isCurrent()) return;
      setProject(data);
    } catch (err) {
      if (isCurrent()) setError(err instanceof Error ? err.message : '오류 발생');
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [authLoading, projectId, user]);

  useEffect(() => {
    if (authLoading) return;
    const timer = window.setTimeout(() => { void fetchProject(); }, 0);
    return () => { window.clearTimeout(timer); loadRequest.current?.abort(); };
  }, [authLoading, fetchProject]);

  // A failed write must remain visible without discarding the loaded project.
  const runAction = async (body: Record<string, unknown> | null, fallback: string): Promise<boolean> => {
    if (actionInFlight.current) return false;
    actionInFlight.current = true;
    setActionPending(true);
    setActionError(null);
    const controller = new AbortController(); actionRequest.current = controller;
    try {
      await requestFeatureJson(`/api/projects/${encodeURIComponent(projectId)}`, body ? {
        method: 'PATCH', signal: controller.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      } : { method: 'DELETE', signal: controller.signal }, requireRecord, authenticatedFetch);
      return !controller.signal.aborted;
    } catch (err) {
      if (!controller.signal.aborted) setActionError(err instanceof Error ? err.message : fallback);
      return false;
    } finally {
      if (actionRequest.current === controller) actionRequest.current = null;
      actionInFlight.current = false;
      if (!controller.signal.aborted) setActionPending(false);
    }
  };

  const handleInvite = async () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inviteEmail.trim()) || inviteEmail.length > 254) { setActionError('유효한 이메일 주소를 입력하세요.'); return; }
    if (await runAction({ action: 'inviteMember', email: inviteEmail.trim(), role: inviteRole }, '초대 전송에 실패했습니다.')) {
      setShowInvite(false);
      setInviteEmail('');
      await fetchProject();
    }
  };

  const handleRemoveMember = async (member: MemberInfo) => {
    if (!confirm('이 멤버를 제거하시겠습니까?')) return;
    if (await runAction({ action: 'removeMember', userId: member.userId || undefined,
      email: member.userId ? undefined : member.email }, '멤버 삭제에 실패했습니다.')) await fetchProject();
  };

  const handleDelete = async () => {
    if (!confirm('프로젝트를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) return;
    if (await runAction(null, '프로젝트 삭제에 실패했습니다.')) router.push('/projects');
  };

  const userRole = project?.members?.find((member) => member.userId === user?.uid)?.role ?? 'viewer';
  const isOwner = userRole === 'owner';
  const canEdit = userRole === 'owner' || userRole === 'editor';

  if (authLoading || loading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-64 rounded bg-gray-200" />
          <div className="h-4 w-96 max-w-full rounded bg-gray-200" />
          <div className="h-64 rounded-xl bg-gray-200" />
        </div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="rounded-xl border border-red-200 bg-red-50 p-8 text-center">
          <p role="alert" className="text-red-700">{error ?? '프로젝트를 찾을 수 없습니다.'}</p>
          <button type="button" onClick={() => void fetchProject()} className="mt-3 min-h-11 rounded-lg border px-4">다시 시도</button>
          <Link href="/projects" className="mt-4 inline-block text-sm text-blue-600 hover:underline">
            프로젝트 목록으로
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <Link
          href="/projects"
          className="inline-flex items-center gap-1 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] mb-3"
        >
          <ArrowLeft className="h-4 w-4" />
          프로젝트 목록
        </Link>

        <div className="flex flex-col items-start justify-between gap-3 sm:flex-row">
          <div>
            <h1 className="break-words text-2xl font-bold text-[var(--text-primary)]">{project.name}</h1>
            {project.description && (
              <p className="mt-1 text-[var(--text-secondary)]">{project.description}</p>
            )}
          </div>

          <div className="flex items-center gap-2">
            {canEdit && (
              <button
                onClick={() => setShowShare(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-default)] px-3 py-2 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]"
              >
                <Share2 className="h-4 w-4" />
                공유
              </button>
            )}

            {isOwner && (
              <button
                type="button"
                disabled={actionPending}
                onClick={handleDelete}
                className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
              >
                <Trash2 className="h-4 w-4" />
                삭제
              </button>
            )}
          </div>
        </div>
      </div>

      {actionError && !showInvite && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{actionError}</p>}

      {/* Content Grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <CalculationTimeline
            calculations={project.calculations}
            canEdit={canEdit}
            onAdd={() => router.push('/calc')}
          />
        </div>

        <div className="space-y-6">
          <MemberList
            members={project.members}
            isOwner={isOwner}
            busy={actionPending}
            onInvite={() => { setActionError(null); setShowInvite(true); }}
            onRemove={handleRemoveMember}
          />

          {/* Project Info Card */}
          <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-primary)] p-5">
            <h2 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-3">
              프로젝트 정보
            </h2>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-[var(--text-secondary)]">상태</dt>
                <dd className="font-medium text-[var(--text-primary)]">{project.status}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[var(--text-secondary)]">생성일</dt>
                <dd className="text-[var(--text-primary)]">
                  {new Date(project.createdAt).toLocaleDateString('ko-KR')}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[var(--text-secondary)]">최종 수정</dt>
                <dd className="text-[var(--text-primary)]">
                  {new Date(project.updatedAt).toLocaleDateString('ko-KR')}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </div>

      {/* Invite Modal */}
      {showInvite && (
        <FeatureDialog label="멤버 초대" busy={actionPending} onClose={() => setShowInvite(false)}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">멤버 초대</h3>
              <button type="button" aria-label="멤버 초대 닫기" disabled={actionPending} onClick={() => setShowInvite(false)} className="rounded p-1 hover:bg-[var(--bg-tertiary)]">
                <X className="h-5 w-5 text-[var(--text-secondary)]" />
              </button>
            </div>
            <div className="space-y-3">
              <input
                type="email"
                placeholder="이메일 주소"
                aria-label="초대 이메일 주소"
                maxLength={254}
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="w-full rounded-lg border border-[var(--border-hover)] px-3 py-2 text-sm"
              />
              <select
                aria-label="초대 멤버 권한"
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as 'editor' | 'viewer')}
                className="w-full rounded-lg border border-[var(--border-hover)] px-3 py-2 text-sm"
              >
                <option value="viewer">Viewer (보기 전용)</option>
                <option value="editor">Editor (편집 가능)</option>
              </select>
              <button
                type="button"
                disabled={actionPending || !inviteEmail.trim()}
                onClick={handleInvite}
                className="w-full rounded-lg bg-blue-600 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
              >
                초대하기
              </button>
              {actionError && <p role="alert" className="text-sm text-red-700">{actionError}</p>}
              <p className="text-xs leading-relaxed text-[var(--text-secondary)]">
                별도 이메일은 발송되지 않습니다. 초대받은 주소가 검증된 계정으로 로그인하면 프로젝트에 자동 참여됩니다.
              </p>
            </div>
        </FeatureDialog>
      )}

      {/* Share Dialog */}
      {showShare && (
        <ShareDialog
          projectId={project.id}
          onClose={() => setShowShare(false)}
        />
      )}
    </div>
  );
}
