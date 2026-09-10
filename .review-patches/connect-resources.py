from pathlib import Path
import subprocess
BASE='dd4be8d5b39030390e23131adf3c442cd225da1c'
changed=set()
def edit(name,fn):
 p=Path(name)
 if name not in changed: assert p.read_bytes()==subprocess.check_output(['git','show',f'{BASE}:{name}']),name
 p.write_text(fn(p.read_text()));changed.add(name)
def rep(s,a,b,n=1):
 assert s.count(a)==n,(s.count(a),a[:90]);return s.replace(a,b)

def projects(s):
 s=rep(s,"import { useState, useEffect, useCallback } from 'react';", "import { useState, useCallback } from 'react';\nimport { useAuth } from '@/contexts/AuthContext';\nimport { useFeatureResource } from '@/hooks/useFeatureResource';\nimport { requestFeatureJson, relativeActivityTime } from '@/lib/feature-request';\nimport { decodeProjects } from '@/lib/feature-read-models';")
 s=rep(s,"import { authenticatedFetch } from '@/lib/client-auth';", "import { featureAuthenticatedFetch } from '@/lib/feature-auth';")
 a=s.index('  const [projects, setProjects]');b=s.index('\n  return (',a)
 s=s[:a]+'''  const { user, loading: authLoading } = useAuth();
  const [filter, setFilter] = useState<FilterMode>('all');
  const loader = useCallback((signal: AbortSignal) => requestFeatureJson(`/api/projects?filter=${filter}`,
    { signal }, decodeProjects, featureAuthenticatedFetch), [filter]);
  const resource = useFeatureResource(authLoading || !user ? null : `${user.uid}:${filter}`, loader);
  const projects = resource.data ?? [];
  const loading = authLoading || resource.loading;
  const error = !authLoading && !user ? '로그인이 필요합니다.' : resource.error;
''' + s[b:]
 s=rep(s,'          {error}\n        </div>', '''          <p role="alert">{error}</p>
          {user ? <button type="button" onClick={resource.reload} className="mt-3 min-h-11 rounded-lg border px-4 text-sm">다시 시도</button>
            : <Link href="/login" className="mt-3 inline-flex min-h-11 items-center underline">로그인하기</Link>}
        </div>''')
 s=rep(s,'href={`/projects/${project.id}`}', 'href={`/projects/${encodeURIComponent(project.id)}`}')
 s=rep(s,'onClick={() => onFilterChange(mode)}', 'onClick={() => onFilterChange(mode)}\n          aria-pressed={filter === mode}')
 s=rep(s,'<div className="flex items-center gap-2">\n      <Filter','<div className="flex flex-wrap items-center gap-2">\n      <Filter')
 s=s.replace('rounded-lg px-3 py-1.5 text-sm','min-h-11 rounded-lg px-3 py-1.5 text-sm')
 a=s.index('function formatTimeAgo(');s=s[:a]+"function formatTimeAgo(value: string): string { return relativeActivityTime(value); }\n"
 return s
edit('src/app/(with-nav)/projects/page.tsx',projects)

def dashboard(s):
 s=rep(s,"import { useState, useEffect } from 'react';", "import { useState, useCallback } from 'react';\nimport { useFeatureResource } from '@/hooks/useFeatureResource';\nimport { requestFeatureJson, relativeActivityTime } from '@/lib/feature-request';\nimport { featureAuthenticatedFetch } from '@/lib/feature-auth';\nimport { decodeDashboard } from '@/lib/feature-read-models';")
 a=s.index('function useDashboardData(');b=s.index('// ═══',a)
 s=s[:a]+'''function useDashboardData(uid: string | undefined, authLoading: boolean) {
  const loader = useCallback((signal: AbortSignal) => requestFeatureJson('/api/dashboard', { signal }, decodeDashboard, featureAuthenticatedFetch), []);
  const resource = useFeatureResource(authLoading || !uid ? null : `dashboard:${uid}`, loader);
  return { calcUsage: resource.data?.calcUsage ?? [], totalCalcs: resource.data?.totalCalcs ?? 0,
    recentCalcs: resource.data?.recentCalcs ?? [], standardUpdates: resource.data?.standardUpdates ?? [],
    warnings: resource.data?.warnings ?? [], usageComplete: resource.data?.usageComplete ?? true,
    loading: authLoading || resource.loading, error: !authLoading && !uid ? '로그인이 필요합니다.' : resource.error,
    reload: resource.reload };
}

''' +s[b:]
 s=rep(s,'useDashboardData(Boolean(user), authLoading)', 'useDashboardData(user?.uid, authLoading)')
 s=rep(s,'const { calcUsage, totalCalcs, recentCalcs, standardUpdates, loading, error }', 'const { calcUsage, totalCalcs, recentCalcs, standardUpdates, loading, error, reload, warnings, usageComplete }')
 s=rep(s,'onClick={() => window.location.reload()}', 'onClick={reload}')
 s=s.replace('이번 달','최근 30일')
 s=rep(s,'<CalcUsageChart data={data} height={250} />', '''<>
          <CalcUsageChart data={data} height={250} />
          <details className="mt-2 text-sm"><summary className="min-h-11 cursor-pointer">계산 통계 표로 보기</summary>
            <table className="w-full text-left"><caption className="sr-only">최근 30일 계산기별 사용 횟수</caption>
              <thead><tr><th scope="col">계산기</th><th scope="col">횟수</th></tr></thead>
              <tbody>{data.map((row) => <tr key={row.calculatorId}><th scope="row" className="font-normal">{row.name}</th><td>{row.count}</td></tr>)}</tbody>
            </table>
          </details>
        </>''')
 s=rep(s,'href={`/receipt/${calc.id}`}', 'href={`/receipt/${encodeURIComponent(calc.id)}`}')
 s=rep(s,'<select\n          value={selectedPreset}', '<select\n          aria-label="비교할 규격 예시"\n          value={selectedPreset}')
 a=s.index('function formatDate(');b=s.index('// ═══',a)
 s=s[:a]+'function formatDate(value: string): string { return relativeActivityTime(value); }\n\n'+s[b:]
 s=rep(s,'      {/* Grid layout */}', '''      <nav aria-label="업무 바로가기" className="mb-6 flex flex-wrap gap-3">
        <Link href="/tools/sld" className="min-h-11 rounded-lg border px-4 py-3 text-sm">새 도면 분석</Link>
        <Link href="/projects" className="min-h-11 rounded-lg border px-4 py-3 text-sm">프로젝트 관리</Link>
        <Link href="/history" className="min-h-11 rounded-lg border px-4 py-3 text-sm">계산 이력</Link>
      </nav>
      {!usageComplete && <p role="status" className="mb-4 text-sm">사용량 분포는 일부 기록 기준입니다. 총계와 상위 계산기 비율을 같은 모집단으로 해석하지 마세요.</p>}
      {/* Grid layout */}''')
 s=rep(s,'<StandardUpdatesSection updates={standardUpdates} />', '''{warnings.includes('standard_updates_unavailable')
          ? <section className="rounded-xl border p-5"><h2 className="font-semibold">규격 업데이트</h2><p role="status" className="mt-2 text-sm">업데이트 알림 조회에 실패했습니다. 업데이트가 없다는 뜻이 아닙니다.</p><button type="button" onClick={reload} className="mt-3 min-h-11 rounded-lg border px-3">다시 시도</button></section>
          : <StandardUpdatesSection updates={standardUpdates} />}''')
 return s
edit('src/app/(with-nav)/dashboard/page.tsx',dashboard)

def community(s):
 s=rep(s,"import Link from 'next/link';", "import Link from 'next/link';\nimport { useFeatureResource } from '@/hooks/useFeatureResource';\nimport { requestFeatureJson, relativeActivityTime } from '@/lib/feature-request';\nimport { decodeCommunity } from '@/lib/feature-read-models';")
 a=s.index('  const [questions, setQuestions]');b=s.index('// ─── PART 3:',a)
 s=s[:a]+'''  const params = new URLSearchParams({ sort: opts.sort, page: String(opts.page) });
  if (opts.tags.length) params.set('tags', [...opts.tags].sort().join(','));
  if (opts.search) params.set('search', opts.search);
  const query = params.toString();
  const load = useCallback((signal: AbortSignal) => requestFeatureJson(`/api/community?${query}`, { signal }, decodeCommunity), [query]);
  const resource = useFeatureResource(query, load);
  return { questions: resource.data?.data ?? [], totalPages: resource.data?.totalPages ?? 1,
    loading: resource.loading, error: resource.error, reload: resource.reload };
}

''' + s[b:]
 s=rep(s,'          defaultValue={search}', '          value={search}\n          maxLength={200}')
 s=rep(s,'onClick={() => onTagToggle(tag)}', 'onClick={() => onTagToggle(tag)}\n            aria-pressed={selectedTags.includes(tag)}')
 s=rep(s,'href={`/community/${q.id}`}', 'href={`/community/${encodeURIComponent(q.id)}`}')
 s=rep(s,"  const [search, setSearch] = useState('');", "  const [search, setSearch] = useState('');\n  const [searchDraft, setSearchDraft] = useState('');")
 s=rep(s,'  const handleSearchChange = useCallback((value: string) => {', '  useEffect(() => () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); }, []);\n  const handleSearchChange = useCallback((value: string) => {\n    setSearchDraft(value);')
 s=rep(s,'        search={search}', '        search={searchDraft}')
 s=rep(s,'      {/* Question List */}', '''      {(searchDraft || selectedTags.length > 0 || sort !== 'newest') && <button type="button" className="mt-3 min-h-11 rounded-lg border px-3 text-sm" onClick={() => {
        if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
        setSearchDraft(''); setSearch(''); setSelectedTags([]); setSort('newest'); setPage(1);
      }}>검색·필터 초기화</button>}
      {/* Question List */}''')
 s=rep(s,'<p className="text-sm text-[var(--color-error)]">{error}</p>', '<p role="alert" className="text-sm text-[var(--color-error)]">{error}</p>')
 a=s.index('function formatTimeAgo(');s=s[:a]+'function formatTimeAgo(value: string): string { return relativeActivityTime(value); }\n'
 return s
edit('src/app/(with-nav)/community/page.tsx',community)

def dashboard_api(s):
 s=rep(s,'  totalCalcs: number;', '  totalCalcs: number;\n  usageComplete: boolean;')
 s=rep(s,".select('calculator_id, calculator_name')", ".select('calculator_id, calculator_name', { count: 'exact' })")
 s=rep(s,".gte('created_at', thirtyDaysAgoISO),", ".gte('created_at', thirtyDaysAgoISO)\n        .limit(1000),")
 s=rep(s,'totalCalcs: monthRows?.length ?? 0,', '''totalCalcs: typeof monthResult.count === 'number' ? monthResult.count : monthRows?.length ?? 0,
      usageComplete: typeof monthResult.count === 'number' ? monthResult.count === (monthRows?.length ?? 0) : (monthRows?.length ?? 0) < 1000,''')
 s=rep(s,"{ status: 200, headers: { 'Cache-Control': 'private, max-age=30' } }", "{ status: 200, headers: { 'Cache-Control': 'private, no-store' } }")
 return s
edit('src/app/api/dashboard/route.ts',dashboard_api)
Path('/tmp/nonbilling-edited-paths.txt').write_text('\n'.join(sorted(changed))+'\n')
print('RESOURCE_INTEGRATIONS',sorted(changed))
