'use client';

/**
 * Project Detail Page — 프로젝트 상세
 *
 * PART 1: Types
 * PART 2: Member list component
 * PART 3: Calculation timeline component
 * PART 4: Share dialog
 * PART 5: Main page
 */

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
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
  viewer: { label: 'Viewer', icon: Eye, color: 'text-gray-500' },
};

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2 — Member List Component
// ═══════════════════════════════════════════════════════════════════════════════

function MemberList({
  members,
  isOwner,
  onInvite,
  onRemove,
}: {
  members: MemberInfo[];
  isOwner: boolean;
  onInvite: () => void;
  onRemove: (userId: string) => void;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <Users className="h-5 w-5 text-gray-400" />
          멤버 ({members.length})
        </h2>
        {isOwner && (
          <button
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
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-sm font-medium text-gray-600">
                  {(member.email ?? member.userId ?? '?').charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {member.email ?? member.userId}
                  </p>
                  <p className={`text-xs flex items-center gap-1 ${config.color}`}>
                    <RoleIcon className="h-3 w-3" />
                    {config.label}
                  </p>
                </div>
              </div>

              {isOwner && member.role !== 'owner' && (
                <button
                  onClick={() => onRemove(member.userId)}
                  className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500"
                  title="멤버 제거"
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
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <Calculator className="h-5 w-5 text-gray-400" />
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
        <div className="rounded-lg border border-dashed border-gray-200 p-8 text-center">
          <FileText className="mx-auto h-8 w-8 text-gray-300" />
          <p className="mt-2 text-sm text-gray-500">아직 계산 내역이 없습니다</p>
        </div>
      ) : (
        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200" />

          <ul className="space-y-4">
            {calculations.map((calc, idx) => (
              <li key={calc.id} className="relative flex items-start gap-4 pl-10">
                {/* Timeline dot */}
                <div className="absolute left-2.5 top-1.5 h-3 w-3 rounded-full border-2 border-blue-500 bg-white" />

                <Link
                  href={`/receipt/${calc.id}`}
                  className="flex-1 rounded-lg border border-gray-100 bg-gray-50 p-3 hover:bg-blue-50 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-900">
                      {calc.calculatorName}
                    </span>
                    <span className="text-xs text-gray-400">
                      #{idx + 1}
                    </span>
                  </div>
                  {calc.value !== undefined && (
                    <p className="mt-1 text-lg font-semibold text-blue-700">
                      {calc.value} {calc.unit}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-gray-400 flex items-center gap-1">
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

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generateShareLink',
          expireHours,
          password: password || undefined,
        }),
      });
      const data = await res.json();
      setShareUrl(data.url);
    } catch {
      // Error handling
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Share2 className="h-5 w-5" />
            프로젝트 공유
          </h3>
          <button onClick={onClose} className="rounded p-1 hover:bg-gray-100">
            <X className="h-5 w-5 text-gray-400" />
          </button>
        </div>

        {!shareUrl ? (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                만료 시간
              </label>
              <select
                value={expireHours}
                onChange={(e) => setExpireHours(Number(e.target.value))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                <option value={24}>24시간</option>
                <option value={72}>3일</option>
                <option value={168}>7일</option>
                <option value={720}>30일</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                비밀번호 (선택)
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="비밀번호 미입력 시 공개 링크"
                  className="w-full rounded-lg border border-gray-300 pl-10 pr-3 py-2 text-sm"
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
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2 rounded-lg bg-gray-50 p-3">
              <input
                type="text"
                readOnly
                value={shareUrl}
                className="flex-1 bg-transparent text-sm text-gray-700 outline-none"
              />
              <button
                onClick={handleCopy}
                className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-xs text-gray-500">
              {password ? '비밀번호가 설정된 링크입니다.' : '누구나 이 링크로 프로젝트를 볼 수 있습니다.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 5 — Main Page
// ═══════════════════════════════════════════════════════════════════════════════

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showShare, setShowShare] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'editor' | 'viewer'>('viewer');

  const fetchProject = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}`);
      if (!res.ok) throw new Error('프로젝트를 불러올 수 없습니다.');
      const data = await res.json();
      setProject(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : '오류 발생');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchProject();
  }, [fetchProject]);

  const handleInvite = async () => {
    if (!inviteEmail) return;
    try {
      await fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'inviteMember',
          email: inviteEmail,
          role: inviteRole,
        }),
      });
      setShowInvite(false);
      setInviteEmail('');
      fetchProject();
    } catch {
      // Error handling
    }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!confirm('이 멤버를 제거하시겠습니까?')) return;
    try {
      await fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'removeMember',
          userId,
        }),
      });
      fetchProject();
    } catch {
      // Error handling
    }
  };

  const handleDelete = async () => {
    if (!confirm('프로젝트를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) return;
    try {
      await fetch(`/api/projects/${projectId}`, { method: 'DELETE' });
      router.push('/projects');
    } catch {
      // Error handling
    }
  };

  // Determine user role (simplified — in production, derive from auth context)
  const userRole = project?.members?.[0]?.role ?? 'viewer';
  const isOwner = userRole === 'owner';
  const canEdit = userRole === 'owner' || userRole === 'editor';

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-64 rounded bg-gray-200" />
          <div className="h-4 w-96 rounded bg-gray-200" />
          <div className="h-64 rounded-xl bg-gray-200" />
        </div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="rounded-xl border border-red-200 bg-red-50 p-8 text-center">
          <p className="text-red-700">{error ?? '프로젝트를 찾을 수 없습니다.'}</p>
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
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-3"
        >
          <ArrowLeft className="h-4 w-4" />
          프로젝트 목록
        </Link>

        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{project.name}</h1>
            {project.description && (
              <p className="mt-1 text-gray-500">{project.description}</p>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowShare(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <Share2 className="h-4 w-4" />
              공유
            </button>

            {isOwner && (
              <button
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
            onInvite={() => setShowInvite(true)}
            onRemove={handleRemoveMember}
          />

          {/* Project Info Card */}
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
              프로젝트 정보
            </h2>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-500">상태</dt>
                <dd className="font-medium text-gray-900">{project.status}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">생성일</dt>
                <dd className="text-gray-700">
                  {new Date(project.createdAt).toLocaleDateString('ko-KR')}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">최종 수정</dt>
                <dd className="text-gray-700">
                  {new Date(project.updatedAt).toLocaleDateString('ko-KR')}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </div>

      {/* Invite Modal */}
      {showInvite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">멤버 초대</h3>
              <button onClick={() => setShowInvite(false)} className="rounded p-1 hover:bg-gray-100">
                <X className="h-5 w-5 text-gray-400" />
              </button>
            </div>
            <div className="space-y-3">
              <input
                type="email"
                placeholder="이메일 주소"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as 'editor' | 'viewer')}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="viewer">Viewer (보기 전용)</option>
                <option value="editor">Editor (편집 가능)</option>
              </select>
              <button
                onClick={handleInvite}
                className="w-full rounded-lg bg-blue-600 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
              >
                초대하기
              </button>
            </div>
          </div>
        </div>
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
