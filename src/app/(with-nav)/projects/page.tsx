'use client';

/**
 * Projects List Page — 프로젝트 목록
 *
 * PART 1: Types and state
 * PART 2: Project card component
 * PART 3: Filter bar
 * PART 4: Main page layout
 */

import { useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useFeatureResource } from '@/hooks/useFeatureResource';
import { requestFeatureJson, relativeActivityTime } from '@/lib/feature-request';
import { decodeProjects } from '@/lib/feature-read-models';
import Link from 'next/link';
import { featureAuthenticatedFetch } from '@/lib/feature-auth';
import {
  FolderOpen,
  Plus,
  Users,
  Calculator,
  Clock,
  Crown,
  Pencil,
  Eye,
  Filter,
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1 — Types and State
// ═══════════════════════════════════════════════════════════════════════════════

interface ProjectSummary {
  id: string;
  name: string;
  description?: string;
  status: string;
  memberCount: number;
  calculationCount: number;
  userRole: 'owner' | 'editor' | 'viewer';
  updatedAt: string;
}

type FilterMode = 'all' | 'owned' | 'shared';

const ROLE_BADGES: Record<string, { label: string; color: string; icon: typeof Crown }> = {
  owner: { label: 'Owner', color: 'bg-amber-100 text-amber-800', icon: Crown },
  editor: { label: 'Editor', color: 'bg-blue-100 text-blue-800', icon: Pencil },
  viewer: { label: 'Viewer', color: 'bg-[var(--bg-secondary)] text-[var(--text-secondary)]', icon: Eye },
};

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-[var(--bg-tertiary)] text-[var(--text-primary)]',
  active: 'bg-green-100 text-green-800',
  review: 'bg-yellow-100 text-yellow-800',
  approved: 'bg-blue-100 text-blue-800',
  archived: 'bg-[var(--bg-secondary)] text-[var(--text-tertiary)]',
};

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2 — Project Card Component
// ═══════════════════════════════════════════════════════════════════════════════

function ProjectCard({ project }: { project: ProjectSummary }) {
  const roleBadge = ROLE_BADGES[project.userRole];
  const RoleIcon = roleBadge.icon;
  const statusColor = STATUS_COLORS[project.status] ?? STATUS_COLORS.active;

  const timeAgo = formatTimeAgo(project.updatedAt);

  return (
    <Link
      href={`/projects/${encodeURIComponent(project.id)}`}
      className="block rounded-xl border border-[var(--border-default)] bg-[var(--bg-primary)] p-5 shadow-sm transition-all hover:shadow-md hover:border-[var(--color-primary)]"
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-semibold text-[var(--text-primary)] truncate">
            {project.name}
          </h2>
          {project.description && (
            <p className="mt-1 text-sm text-[var(--text-tertiary)] line-clamp-2">
              {project.description}
            </p>
          )}
        </div>

        <div className="ml-3 flex flex-col items-end gap-2">
          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${roleBadge.color}`}>
            <RoleIcon className="h-3 w-3" />
            {roleBadge.label}
          </span>
          <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${statusColor}`}>
            {project.status}
          </span>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-4 text-sm text-[var(--text-tertiary)]">
        <span className="inline-flex items-center gap-1">
          <Users className="h-4 w-4" />
          {project.memberCount}
        </span>
        <span className="inline-flex items-center gap-1">
          <Calculator className="h-4 w-4" />
          {project.calculationCount}
        </span>
        <span className="inline-flex items-center gap-1 ml-auto">
          <Clock className="h-4 w-4" />
          {timeAgo}
        </span>
      </div>
    </Link>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 3 — Filter Bar
// ═══════════════════════════════════════════════════════════════════════════════

function FilterBar({
  filter,
  onFilterChange,
}: {
  filter: FilterMode;
  onFilterChange: (f: FilterMode) => void;
}) {
  const filters: { mode: FilterMode; label: string }[] = [
    { mode: 'all', label: '전체 프로젝트' },
    { mode: 'owned', label: '내 프로젝트' },
    { mode: 'shared', label: '공유된 프로젝트' },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Filter className="h-4 w-4 text-[var(--text-tertiary)]" />
      {filters.map(({ mode, label }) => (
        <button
          key={mode}
          onClick={() => onFilterChange(mode)}
          aria-pressed={filter === mode}
          className={`min-h-11 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
            filter === mode
              ? 'bg-[var(--color-primary)] text-white'
              : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 4 — Main Page
// ═══════════════════════════════════════════════════════════════════════════════

export default function ProjectsPage() {
  const { user, loading: authLoading } = useAuth();
  const [filter, setFilter] = useState<FilterMode>('all');
  const loader = useCallback((signal: AbortSignal) => requestFeatureJson(`/api/projects?filter=${filter}`,
    { signal }, decodeProjects, featureAuthenticatedFetch), [filter]);
  const resource = useFeatureResource(authLoading || !user ? null : `${user.uid}:${filter}`, loader);
  const projects = resource.data ?? [];
  const loading = authLoading || resource.loading;
  const error = !authLoading && !user ? '로그인이 필요합니다.' : resource.error;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)] flex items-center gap-2">
            <FolderOpen className="h-7 w-7 text-[var(--color-primary)]" />
            프로젝트
          </h1>
          <p className="mt-1 text-sm text-[var(--text-tertiary)]">
            계산 결과를 프로젝트로 묶어 팀과 공유하세요
          </p>
        </div>

        <Link
          href="/projects/new"
          className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-[var(--color-primary-hover)] transition-colors"
        >
          <Plus className="h-4 w-4" />
          새 프로젝트
        </Link>
      </div>

      {/* Filter */}
      <div className="mb-6">
        <FilterBar filter={filter} onFilterChange={setFilter} />
      </div>

      {/* Content */}
      {loading ? (
        <div className="grid gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse rounded-xl border border-[var(--border-default)] bg-[var(--bg-primary)] p-5 h-28" />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center text-red-700">
          <p role="alert">{error}</p>
          {user ? <button type="button" onClick={resource.reload} className="mt-3 min-h-11 rounded-lg border px-4 text-sm">다시 시도</button>
            : <Link href="/login" className="mt-3 inline-flex min-h-11 items-center underline">로그인하기</Link>}
        </div>
      ) : projects.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border-default)] bg-[var(--bg-secondary)] p-12 text-center">
          <FolderOpen className="mx-auto h-12 w-12 text-[var(--text-tertiary)]" />
          <h2 className="mt-4 text-lg font-medium text-[var(--text-primary)]">프로젝트가 없습니다</h2>
          <p className="mt-2 text-sm text-[var(--text-tertiary)]">
            새 프로젝트를 만들어 계산 결과를 정리하세요.
          </p>
          <Link
            href="/projects/new"
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)]"
          >
            <Plus className="h-4 w-4" />
            첫 프로젝트 만들기
          </Link>
        </div>
      ) : (
        <div className="grid gap-4">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Util
// ═══════════════════════════════════════════════════════════════════════════════

function formatTimeAgo(value: string): string { return relativeActivityTime(value); }
