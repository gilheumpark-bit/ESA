from pathlib import Path
import subprocess
BASE='dd4be8d5b39030390e23131adf3c442cd225da1c'
changed=[]
def edit(name,fn):
 p=Path(name); assert p.read_bytes()==subprocess.check_output(['git','show',f'{BASE}:{name}']),name
 p.write_text(fn(p.read_text()));changed.append(name)
def rep(s,a,b,n=1):
 assert s.count(a)==n,(s.count(a),a[:90]); return s.replace(a,b)
def field(s):
 s=rep(s,"import { useState, useCallback, useId, useMemo } from 'react';", "import { useState, useCallback, useId, useMemo, useEffect, useRef } from 'react';\nimport { useAuth } from '@/contexts/AuthContext';\nimport { requestFeatureJson } from '@/lib/feature-request';\nimport { featureAuthenticatedFetch } from '@/lib/feature-auth';\nimport { decodeFieldSos, decodeFieldCompletion } from '@/lib/field-record-contract';")
 s=rep(s,'export default function FieldSafetyPage() {', '''export default function FieldSafetyPage() {
  const { user, loading } = useAuth();
  if (loading) return <p role="status" className="p-8 text-sm">로그인 상태를 확인하고 있습니다.</p>;
  return <FieldSafetyContent key={user?.uid ?? 'anonymous'} />;
}
function FieldSafetyContent() {''')
 s=rep(s,"  const [sosDelivery, setSosDelivery] = useState('');", '''  const [sosDelivery, setSosDelivery] = useState('');
  const [recording, setRecording] = useState(false);
  const requests = useRef(new Set<AbortController>());
  const completing = useRef<AbortController | null>(null);
  const completionTime = useRef<string | null>(null);
  const sosPending = useRef(new Set<number>());
  const invalidate = useCallback(() => {
    for (const request of requests.current) request.abort();
    requests.current.clear(); completing.current = null; completionTime.current = null; sosPending.current.clear();
  }, []);
  useEffect(() => invalidate, [invalidate]);''')
 s=rep(s,'    if (!query.trim()) return;\n    const intent', '    if (!query.trim()) return;\n    invalidate(); setRecording(false);\n    const intent')
 s=rep(s,'  }, [query]);', '  }, [query, invalidate]);')
 a=s.index('  const handleSos =');b=s.index('  // calcDeadManConfig',a)
 s=s[:a]+'''  const handleSos = useCallback((ts: number) => {
    if (sosPending.current.has(ts)) return;
    const controller = new AbortController(); requests.current.add(controller); sosPending.current.add(ts);
    setSosLog((previous) => [...new Set([...previous, ts])]);
    setSosDelivery('SOS 기록을 전송 중입니다. 외부 신고는 비상 연락망으로 직접 하세요.');
    void requestFeatureJson('/api/field/sos', { method: 'POST', signal: controller.signal,
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId,
        workSite: analysis?.intent.location?.ko ?? '현장', sosTimestamp: ts, workers: analysis?.intent.workers ?? 0 }),
    }, decodeFieldSos, featureAuthenticatedFetch).then((result) => {
      if (!controller.signal.aborted) setSosDelivery(result.message);
    }, (error: unknown) => {
      if (!controller.signal.aborted) setSosDelivery(`${error instanceof Error ? error.message : 'SOS 기록 저장 실패'} 화면 경보만 확인된 상태입니다. 비상 연락망으로 직접 연락하세요.`);
    }).finally(() => { requests.current.delete(controller); sosPending.current.delete(ts); });
  }, [sessionId, analysis]);

  const handleWorkComplete = async () => {
    if (!analysis || completing.current) return;
    const controller = new AbortController(); completing.current = controller; requests.current.add(controller);
    completionTime.current ??= new Date().toISOString();
    setRecording(true); setOperationError('');
    try {
      const receipt = await requestFeatureJson('/api/field/complete', { method: 'POST', signal: controller.signal,
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId, workSite: analysis.intent.location?.ko ?? '현장',
          workerCount: analysis.intent.workers ?? 0, checklistDone: checkedIds, checklistTotal: analysis.checkItems.length, completedAt: completionTime.current }),
      }, decodeFieldCompletion, featureAuthenticatedFetch);
      if (controller.signal.aborted) return;
      setDoneMsg(`${receipt.message} 기록 해시: ${receipt.hash.slice(0, 16)}…`); setStep('done');
    } catch (error) {
      if (!controller.signal.aborted) setOperationError(error instanceof Error ? error.message : '기록 저장을 확인하지 못했습니다. 수동 기록이 필요합니다.');
    } finally {
      requests.current.delete(controller); if (completing.current === controller) completing.current = null;
      if (!controller.signal.aborted) setRecording(false);
    }
  };

''' +s[b:]
 s=rep(s,'onClick={handleWorkComplete}', 'onClick={handleWorkComplete}\n              disabled={recording}\n              aria-busy={recording}')
 s=rep(s,'onClick={() => { setStep(\'input\'); setQuery(\'\');', 'onClick={() => { invalidate(); setStep(\'input\'); setQuery(\'\');')
 # Preserve actual safety rules and checklist values, changing only operational status.
 s=s.replace('text-[10px]','text-xs').replace('text-[var(--color-error)]','text-[var(--drawing-error-text)]')
 return s
edit('src/app/(with-nav)/field/page.tsx',field)

def complete(s):
 s=rep(s,'    const body = await req.json() as FieldCompleteRequest;', '''    const raw = await req.json().catch(() => null);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || typeof raw.workSite !== 'string'
      || raw.workSite.length > 2000 || typeof raw.sessionId !== 'string' || typeof raw.completedAt !== 'string'
      || (raw.note !== undefined && (typeof raw.note !== 'string' || raw.note.length > 2000))
      || !Array.isArray(raw.checklistDone) || raw.checklistDone.length > 1000
      || !raw.checklistDone.every((id: unknown) => typeof id === 'string' && id.length <= 128)) {
      return ctx.error('ESA-4001', '작업 완료 요청 형식이 올바르지 않습니다.', 400);
    }
    const body = raw as FieldCompleteRequest;''')
 s=rep(s,"        : '작업 완료를 저장했습니다. 설정된 관리자 수신자가 없어 알림은 보내지 않았습니다.',", "        : failed > 0 ? '작업 완료는 저장됐지만 관리자 인앱 알림 전달에 실패했습니다. 직접 연락하세요.'\n          : '작업 완료를 저장했습니다. 설정된 관리자 수신자가 없어 알림은 보내지 않았습니다.',")
 return s
edit('src/app/api/field/complete/route.ts',complete)

def sos(s):
 s=rep(s,'    const body = await req.json() as SosRequest;', '''    const raw = await req.json().catch(() => null);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || typeof raw.sessionId !== 'string'
      || (raw.workSite !== undefined && (typeof raw.workSite !== 'string' || raw.workSite.length > 2000))) {
      return ctx.error('ESA-4001', 'SOS 요청 형식이 올바르지 않습니다.', 400);
    }
    const body = raw as SosRequest;''')
 s=rep(s,"        : 'SOS는 기록됐지만 설정된 관리자 수신자가 없습니다. 비상 연락망으로 직접 연락하세요.',", "        : recipients.length > 0 ? 'SOS는 기록됐지만 관리자 인앱 알림 전달에 실패했습니다. 비상 연락망으로 직접 연락하세요.'\n          : 'SOS는 기록됐지만 설정된 관리자 수신자가 없습니다. 비상 연락망으로 직접 연락하세요.',")
 return s
edit('src/app/api/field/sos/route.ts',sos)
with open('/tmp/nonbilling-edited-paths.txt','a') as f:f.write('\n'.join(changed)+'\n')
print('FIELD_RECORD_AND_DELIVERY_INTEGRATIONS',changed)
