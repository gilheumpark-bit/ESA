'use client';

/**
 * Projects List Page — 프로젝트 목록
 *
 * PART 1: Types and state
 * PART 2: Project card component
 * PART 3: Filter bar
 * PART 4: Main page layout
 */

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
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
  viewer: { label: 'Viewer', color: 'bg-gray-100 text-gray-600', icon: Eye },
};

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-200 text-gray-700',
  active: 'bg-green-100 text-green-800',
  review: 'bg-yellow-100 text-yellow-800',
  approved: 'bg-blue-100 text-blue-800',
  archived: 'bg-gray-100 text-gray-500',
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
      href={`/projects/${project.id}`}
      className="block rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:shadow-md hover:border-blue-300"
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-semibold text-gray-900 truncate">
            {project.name}
          </h3>
          {project.description && (
            <p className="mt-1 text-sm text-gray-500 line-clamp-2">
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

      <div className="mt-4 flex items-center gap-4 text-sm text-gray-500">
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
    <div className="flex items-center gap-2">
      <Filter className="h-4 w-4 text-gray-400" />
      {filters.map(({ mode, label }) => (
        <button
          key={mode}
          onClick={() => onFilterChange(mode)}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
            filter === mode
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
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
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [filter, setFilter] = useState<FilterMode>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/projects?filter=${filter}`);
      if (!res.ok) throw new Error('프로젝트 목록을 불러올 수 없습니다.');
      const data = await res.json();
      setProjects(data.projects ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : '알 수 없는 오류');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <FolderOpen className="h-7 w-7 text-blue-600" />
            프로젝트
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            계산 결과를 프로젝트로 묶어 팀과 공유하세요
          </p>
        </div>

        <Link
          href="/projects/new"
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700 transition-colors"
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
            <div key={i} className="animate-pulse rounded-xl border border-gray-200 bg-white p-5 h-28" />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center text-red-700">
          {error}
        </div>
      ) : projects.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-12 text-center">
          <FolderOpen className="mx-auto h-12 w-12 text-gray-300" />
          <h3 className="mt-4 text-lg font-medium text-gray-900">프로젝트가 없습니다</h3>
          <p className="mt-2 text-sm text-gray-500">
            새 프로젝트를 만들어 계산 결과를 정리하세요.
          </p>
          <Link
            href="/projects/new"
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
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

function formatTimeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;

  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return '방금 전';
  if (minutes < 60) return `${minutes}분 전`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}일 전`;

  const months = Math.floor(days / 30);
  return `${months}개월 전`;
}
