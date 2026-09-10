from pathlib import Path
import subprocess
BASE='dd4be8d5b39030390e23131adf3c442cd225da1c'
changed=[]
def edit(name,fn):
 p=Path(name);assert p.read_bytes()==subprocess.check_output(['git','show',f'{BASE}:{name}']),name
 p.write_text(fn(p.read_text()));changed.append(name)
def rep(s,a,b,n=1):
 assert s.count(a)==n,(s.count(a),a[:90]);return s.replace(a,b)
def types(s):
 return rep(s,'export interface SearchResult {', '''export interface SearchResult {
  retrieval?: {
    source: 'agent' | 'rag' | 'local';
    vectorStatus?: 'complete' | 'partial' | 'unavailable';
    mode?: 'hybrid' | 'keyword-only';
    failedCollections?: number;
    scope: 'retrieved-results-only';
  };''')
edit('src/search/types.ts',types)
def api(s):
 s=rep(s,'    let documents: SearchDocument[] = [];', "    let documents: SearchDocument[] = [];\n    const retrieval: NonNullable<SearchResult['retrieval']> = { source: 'agent', scope: 'retrieved-results-only' };")
 # Source dates are not request timestamps; retrieval is not independent verification.
 s=s.replace('updatedAt: new Date().toISOString(),', "updatedAt: '',")
 s=s.replace("verification: 'auto_verified' as const", "verification: 'unverified' as const")
 s=s.replace('updatedAt: r.publishedAt ?? new Date().toISOString(),', "updatedAt: r.publishedAt ?? '',")
 s=rep(s,'        const ragResults = await searchRAG({', "        retrieval.source = 'rag';\n        const ragResults = await searchRAG({")
 s=rep(s,'          limit: pageSize,', '''          limit: Math.min(page * pageSize, 100),
          onDiagnostics: (state) => { retrieval.vectorStatus = state.status; retrieval.mode = state.mode; retrieval.failedCollections = state.failedCollections; },''')
 s=rep(s,"        console.warn('[ESVA /api/search] RAG fallback failed:', ragErr);", "        void ragErr; retrieval.vectorStatus = 'unavailable';\n        console.warn('[ESVA /api/search] RAG retrieval unavailable');")
 s=rep(s,'      const localResults = searchLocalData(body.query, language);', "      retrieval.source = 'local';\n      const localResults = searchLocalData(body.query, language);")
 s=rep(s,'      documents: paginated,','      documents: paginated,\n      retrieval,')
 s=s.replace("'Cache-Control': 'private, max-age=30'", "'Cache-Control': 'private, no-store'")
 return s
edit('src/app/api/search/route.ts',api)
def rank(s):
 return rep(s,'  if (Number.isNaN(updatedAt)) {', '  if (!Number.isFinite(updatedAt) || updatedAt > now) {')
edit('src/search/eng-rank.ts',rank)
def ui(s):
 s=rep(s,"import { readStoredCountry", "import { safeFeatureLink } from '@/lib/feature-output';\nimport { readStoredCountry")
 s=rep(s,'  const doc = ranked.document;', '  const doc = ranked.document;\n  const sourceLink = safeFeatureLink(doc.url);')
 s=rep(s,'{doc.url ? (', '{sourceLink ? (')
 s=rep(s,'href={doc.url}', 'href={sourceLink}')
 s=rep(s,"{new Date(doc.updatedAt).toLocaleDateString('ko-KR')}", "{Number.isFinite(Date.parse(doc.updatedAt)) ? new Date(doc.updatedAt).toLocaleDateString('ko-KR') : '원문 날짜 미확인'}")
 s=rep(s,'        {/* Date */}', '''        {doc.verification === 'unverified' && <span>출처·적용 판본 확인 필요</span>}
        {doc.accessTier === 'summary_only' && <span>요약만 제공</span>}
        {doc.accessTier === 'link_only' && <span>원문 링크만 제공</span>}
        {/* Date */}''')
 s=s.replace('search-vector-${browserEmbeddingByok.provider}', 'search-evidence-v2-vector-${browserEmbeddingByok.provider}').replace('search-keyword-${responseLanguage}', 'search-evidence-v2-keyword-${responseLanguage}')
 s=rep(s,"const browserEmbeddingByok = await getFirstAvailableVisionKey(['openai', 'gemini']);", "const browserEmbeddingByok = await getFirstAvailableVisionKey(['openai', 'gemini'], controller.signal);\n        if (cancelled) return;")
 s=rep(s,'              {/* Search meta */}', '''              {result.retrieval && <div role="status" className="mb-4 rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] p-3 text-sm text-[var(--text-secondary)]">
                조회 경로: {{ agent: '에이전트 근거', rag: '문서 검색', local: '앱 내 자료' }[result.retrieval.source]}.
                {result.retrieval.vectorStatus === 'unavailable' && ' 외부 문서 검색을 확인하지 못해 앱 내 자료를 표시합니다.'}
                {result.retrieval.vectorStatus === 'partial' && ' 일부 검색 저장소 응답이 누락됐습니다.'}
                {result.retrieval.mode === 'keyword-only' && ' 의미 벡터 없이 키워드 검색을 사용했습니다.'}
                {' '}표시 건수는 회수한 결과 기준이며 전체 원문 수나 최신 개정 여부를 보증하지 않습니다.
              </div>}
              {/* Search meta */}''')
 return s
edit('src/app/(with-nav)/search/page.tsx',ui)
with open('/tmp/nonbilling-edited-paths.txt','a') as f:f.write('\n'.join(changed)+'\n')
print('SEARCH_SOURCE_PROVENANCE_AND_FAILURE_STATUS_CONNECTED')
