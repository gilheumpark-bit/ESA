from pathlib import Path
import subprocess
BASE='dd4be8d5b39030390e23131adf3c442cd225da1c'
p=Path('src/app/(with-nav)/history/page.tsx'); assert p.read_bytes()==subprocess.check_output(['git','show',f'{BASE}:{p}'])
s=p.read_text()
def rep(a,b,n=1):
 global s
 assert s.count(a)==n,(s.count(a),a[:90]);s=s.replace(a,b)
rep("import { useState, useMemo, useCallback, useEffect } from 'react';", "import { useState, useMemo, useCallback } from 'react';\nimport { useAuth } from '@/contexts/AuthContext';\nimport { useFeatureResource } from '@/hooks/useFeatureResource';\nimport { requestFeatureJson } from '@/lib/feature-request';\nimport { featureAuthenticatedFetch } from '@/lib/feature-auth';\nimport { featureCsv } from '@/lib/feature-output';\nimport { cachedHistory, decodeHistoryRows, type HistoryRecord as Receipt } from '@/lib/history-read-model';")
rep("import type { Receipt } from '@/engine/receipt/types';\n",'')
rep("const STORAGE_PREFIX = 'esa-receipt-';\nconst INDEX_KEY = 'esa-receipt-index';\n",'')
a=s.index('function loadCachedReceipts()');b=s.index('// ═══',a);s=s[:a]+s[b:]
a=s.index("  const header = '날짜");b=s.index('  const blob = new Blob',a)
s=s[:a]+'''  const csv = featureCsv(['날짜', '계산기', '주요입력', '결과', '판정'], entries.map((entry) => [
    Number.isFinite(Date.parse(entry.date)) ? new Date(entry.date).toLocaleDateString('ko-KR') : '기록 시각 미확인',
    entry.calcName, entry.keyInput, entry.keyResult, entry.judgment === 'pass' ? 'PASS' : entry.judgment === 'fail' ? 'FAIL' : '-',
  ]));
''' +s[b:]
rep('  URL.revokeObjectURL(url);','  setTimeout(() => URL.revokeObjectURL(url), 1000);')
rep('  const [entries, setEntries] = useState<HistoryEntry[]>([]);','  const { user, loading: authLoading } = useAuth();\n  const [exportError, setExportError] = useState<string | null>(null);')
a=s.index('  const [signedIn, setSignedIn]');b=s.index('  const filtered =',a)
s=s[:a]+'''  const signedIn = authLoading ? null : Boolean(user);
  const uid = user?.uid;
  const load = useCallback(async (signal: AbortSignal) => {
    const warnings: string[] = [];
    let local: Receipt[] = [], account: Receipt[] = [];
    try {
      const cached = cachedHistory(sessionStorage, uid); local = cached.records;
      if (cached.skipped) warnings.push(`손상 또는 누락된 탭 기록 ${cached.skipped}건을 표시하지 않았습니다. 원본 저장값은 보존했습니다.`);
    } catch (error) { warnings.push(error instanceof Error ? error.message : '탭 기록을 읽지 못했습니다.'); }
    if (uid) {
      try { account = await requestFeatureJson('/api/calculate?page=1&pageSize=100', { signal }, decodeHistoryRows, featureAuthenticatedFetch); }
      catch (error) { if (signal.aborted) throw error; warnings.push(error instanceof Error ? error.message : '계정 이력 동기화 실패'); }
    }
    const records = [...new Map([...local, ...account].map((record) => [record.id, record])).values()];
    const entries = records.map(receiptToEntry).sort((a, b) => (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0));
    return { entries, warnings };
  }, [uid]);
  const resource = useFeatureResource(authLoading ? null : `history:${uid ?? 'anonymous'}`, load);
  const entries = resource.data?.entries ?? [];

''' +s[b:]
rep('    exportCsv(filtered);','    try { exportCsv(filtered); setExportError(null); } catch { setExportError(\'이력을 내보내지 못했습니다. 다시 시도해 주세요.\'); }')
rep('        {/* Filters */}', '''        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-[var(--text-secondary)]">현재 탭 기록{user ? ' + 계정의 최근 최대 100건' : ''} · 필터 결과만 CSV로 내보냅니다.</p>
          <button type="button" onClick={resource.reload} disabled={resource.loading} className="min-h-11 rounded-lg border px-3 text-sm disabled:opacity-50">이력 새로 불러오기</button>
        </div>
        {resource.data?.warnings.map((warning) => <p key={warning} role="status" className="mb-3 rounded-lg border p-3 text-sm">{warning}</p>)}
        {(resource.error || exportError) && <p role="alert" className="mb-3 text-sm text-[var(--drawing-error-text)]">{resource.error ?? exportError}</p>}
        {/* Filters */}''')
rep('        {filtered.length === 0 ? (', '''        {authLoading || resource.loading ? <p role="status" className="p-6 text-sm">계산 이력을 확인하고 있습니다.</p>
          : !entries.length && Boolean(resource.error || resource.data?.warnings.length) ? <p className="p-6 text-sm">현재 조회를 완료하지 못한 기록이 있습니다. 이력이 없는 것으로 판단하지 않습니다.</p>
          : filtered.length === 0 && entries.length > 0 ? <div className="p-6 text-center"><p>선택한 필터에 맞는 이력이 없습니다.</p><button type="button" className="mt-3 min-h-11 rounded-lg border px-3" onClick={() => { setSearch(''); setCategoryFilter(''); setJudgmentFilter(''); setDateFrom(''); setDateTo(''); }}>이력 필터 초기화</button></div>
          : filtered.length === 0 ? (''')
s=s.replace('하면 계정에 영구 보관됩니다.', '후 계정 저장소가 정상 연결되면 저장된 이력을 조회합니다.')
s=s.replace('href={`/receipt/${entry.id}`}', 'href={`/receipt/${encodeURIComponent(entry.id)}`}')
s=s.replace('min-w-[240px]', 'min-w-0 basis-56').replace('h-10 ', 'min-h-11 ')
p.write_text(s)
with open('/tmp/nonbilling-edited-paths.txt','a') as f:f.write(str(p)+'\n')
print('HISTORY_SCOPE_VALIDATION_AND_EXPORT_CONNECTED')
