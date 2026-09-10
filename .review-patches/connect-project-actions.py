from pathlib import Path
import subprocess
BASE='dd4be8d5b39030390e23131adf3c442cd225da1c'
p=Path('src/app/(with-nav)/projects/[id]/page.tsx'); assert p.read_bytes()==subprocess.check_output(['git','show',f'{BASE}:{p}'])
s=p.read_text()
def rep(a,b,n=1):
 global s
 assert s.count(a)==n,(s.count(a),a[:90]); s=s.replace(a,b)
rep("import { authenticatedFetch } from '@/lib/client-auth';", "import { featureAuthenticatedFetch as authenticatedFetch } from '@/lib/feature-auth';\nimport { requestFeatureJson, requireRecord, FeatureRequestError } from '@/lib/feature-request';\nimport { safeFeatureLink } from '@/lib/feature-output';\nimport { FeatureDialog } from '@/components/FeatureDialog';")
rep('export default function ProjectDetailPage() {', '''export default function ProjectDetailPage() {
  const params = useParams(); const { user, loading } = useAuth();
  if (loading) return <p role="status" className="p-8 text-sm">로그인 상태를 확인하고 있습니다.</p>;
  return <ProjectDetailContent key={`${user?.uid ?? 'anonymous'}:${String(params.id)}`} />;
}
function ProjectDetailContent() {''')
rep('  const loadRequest = useRef<AbortController | null>(null);', '''  const loadRequest = useRef<AbortController | null>(null);
  const actionRequest = useRef<AbortController | null>(null);
  useEffect(() => () => { actionRequest.current?.abort(); }, []);''')
a=s.index('      const res = await authenticatedFetch(`/api/projects/${projectId}`, { signal: controller.signal });');b=s.index('      setProject(data);',a)
s=s[:a]+'''      const data = await requestFeatureJson(`/api/projects/${encodeURIComponent(projectId)}`, { signal: controller.signal }, (value) => {
        const row = requireRecord(value);
        if (row.id !== projectId || typeof row.name !== 'string' || !Array.isArray(row.members) || !Array.isArray(row.calculations)
          || !row.members.every((member) => member && typeof member.userId === 'string' && ['owner','editor','viewer'].includes(member.role))) {
          throw new FeatureRequestError('프로젝트 응답 형식을 확인하지 못했습니다.');
        }
        return row as unknown as ProjectDetail;
      }, authenticatedFetch);
      if (!isCurrent()) return;
''' +s[b:]
a=s.index('    try {\n      const response = await authenticatedFetch',s.index('  const runAction'));b=s.index('\n  const handleInvite',a)
s=s[:a]+'''    const controller = new AbortController(); actionRequest.current = controller;
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
''' +s[b:]
rep('    if (!inviteEmail.trim()) return;', "    if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(inviteEmail.trim()) || inviteEmail.length > 254) { setActionError('유효한 이메일 주소를 입력하세요.'); return; }")
rep('<p className="text-red-700">{error ?? \'프로젝트를 찾을 수 없습니다.\'}</p>', '''<p role="alert" className="text-red-700">{error ?? '프로젝트를 찾을 수 없습니다.'}</p>
          <button type="button" onClick={() => void fetchProject()} className="mt-3 min-h-11 rounded-lg border px-4">다시 시도</button>''')
rep('placeholder="이메일 주소"', 'placeholder="이메일 주소"\n                aria-label="초대 이메일 주소"\n                maxLength={254}')
rep('title="멤버 제거"', 'title="멤버 제거"\n                  aria-label={`${member.email ?? member.userId} 멤버 제거`}')
rep('href={`/receipt/${calc.id}`}', 'href={`/receipt/${encodeURIComponent(calc.id)}`}')
# Share lifetime and generated links are not automatically retried.
a=s.index('function ShareDialog(');b=s.index('// ═══',a);block=s[a:b]
block=block.replace("  const [error, setError] = useState<string | null>(null);", "  const [error, setError] = useState<string | null>(null);\n  const request = useRef<AbortController | null>(null);\n  useEffect(() => () => { request.current?.abort(); }, []);")
block=block.replace('  const handleGenerate = async () => {\n    setLoading(true);', "  const handleGenerate = async () => {\n    if (request.current) return;\n    if (password && password.length < 8) { setError('공유 비밀번호는 8자 이상이어야 합니다.'); return; }\n    const controller = new AbortController(); request.current = controller;\n    setLoading(true);")
a1=block.index('      const res = await authenticatedFetch');b1=block.index('    } catch (generateError)',a1)
block=block[:a1]+'''      const shareUrl = await requestFeatureJson(`/api/projects/${encodeURIComponent(projectId)}`, {
        method: 'PATCH', signal: controller.signal, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'generateShareLink', expireHours, password: password || undefined }),
      }, (value) => {
        const link = safeFeatureLink(requireRecord(value).url);
        if (!link) throw new FeatureRequestError('공유 링크 응답을 확인하지 못했습니다.');
        return link;
      }, authenticatedFetch);
      if (!controller.signal.aborted) setShareUrl(shareUrl);
''' +block[b1:]
block=block.replace('      setError(generateError instanceof Error', '      if (!controller.signal.aborted) setError(generateError instanceof Error')
block=block.replace('      setLoading(false);', '      if (!controller.signal.aborted) setLoading(false);\n      if (request.current === controller) request.current = null;')
block=block.replace('<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">\n      <div role="dialog" aria-modal="true" aria-label="프로젝트 공유" className="w-full min-w-0 max-w-md rounded-2xl bg-white p-6 shadow-xl">', '<FeatureDialog label="프로젝트 공유" busy={loading} onClose={onClose}>')
block=block.replace('aria-label="프로젝트 공유 닫기" onClick={onClose}', 'aria-label="프로젝트 공유 닫기" disabled={loading} onClick={onClose}')
idx=block.rfind('      </div>\n    </div>'); assert idx>=0;block=block[:idx]+'    </FeatureDialog>'+block[idx+len('      </div>\n    </div>'):]
s=s[:a]+block+s[b:]
rep('<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">\n          <div role="dialog" aria-modal="true" aria-label="멤버 초대" className="w-full min-w-0 max-w-sm rounded-2xl bg-white p-6 shadow-xl">', '<FeatureDialog label="멤버 초대" busy={actionPending} onClose={() => setShowInvite(false)}>')
rep('          </div>\n        </div>\n      )}\n\n      {/* Share Dialog */}', '        </FeatureDialog>\n      )}\n\n      {/* Share Dialog */}')
# Scope dark-mode token improvements to this non-billing page.
for old,new in [('bg-white','bg-[var(--bg-primary)]'),('bg-gray-50','bg-[var(--bg-secondary)]'),('bg-gray-100','bg-[var(--bg-tertiary)]'),('text-gray-900','text-[var(--text-primary)]'),('text-gray-700','text-[var(--text-primary)]'),('text-gray-600','text-[var(--text-secondary)]'),('text-gray-500','text-[var(--text-secondary)]'),('text-gray-400','text-[var(--text-secondary)]'),('border-gray-200','border-[var(--border-default)]'),('border-gray-300','border-[var(--border-hover)]')]: s=s.replace(old,new)
# Original error-message helper remains used by other surface paths only if present.
if s.count('readApiErrorMessage')==1: s=s.replace("import { readApiErrorMessage } from '@/lib/error-messages';\n",'')
p.write_text(s)
with open('/tmp/nonbilling-edited-paths.txt','a') as f:f.write(str(p)+'\n')
print('PROJECT_SCOPED_MUTATIONS_AND_DIALOGS_CONNECTED')
