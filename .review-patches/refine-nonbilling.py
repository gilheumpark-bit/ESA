from pathlib import Path
import subprocess
BASE='dd4be8d5b39030390e23131adf3c442cd225da1c'
def rep(name,a,b,n=1):
 p=Path(name);s=p.read_text();assert s.count(a)==n,(name,s.count(a),a[:90]);p.write_text(s.replace(a,b))
rep('src/lib/single-flight-resource.ts','const attempt = { promise: Promise.resolve<T | null>(null) };','const attempt: { promise: Promise<T | null> } = { promise: Promise.resolve(null) };')
rep('src/hooks/useFeatureResource.ts','void load(controller.signal).then((data) => {','void Promise.resolve().then(() => load(controller.signal)).then((data) => {')
rep('src/lib/rag-pipeline.ts','`hash:${hit.doc_hash}:${clause ?? \'\'}`', '`hash:${hit.doc_hash}:${clause ?? \'\'}:${hit.chunk_index ?? hit._additional.id}`')
rep('src/app/api/admin/audit/route.ts','if (error || data === null || count === null)', 'if (error || data === null || !Number.isSafeInteger(count) || Number(count) < 0)')
rep('src/app/api/admin/audit/route.ts','Math.ceil(count / pageSize)', 'Math.ceil(Number(count) / pageSize)')
p=Path('src/lib/vision-byok.ts');assert p.read_bytes()==subprocess.check_output(['git','show',f'{BASE}:{p}'])
s=p.read_text().replace("import { loadSelectedModel", "import { requestFeatureJson, requireRecord, FeatureRequestError } from './feature-request';\nimport { loadSelectedModel")
s=s.replace('  allowedProviders: readonly VisionProvider[] = VISION_PROVIDERS,','  allowedProviders: readonly VisionProvider[] = VISION_PROVIDERS,\n  signal?: AbortSignal,')
s=s.replace("  if (typeof window === 'undefined') return null;", "  signal?.throwIfAborted();\n  if (typeof window === 'undefined') return null;")
a=s.index("      const response = await fetch('/api/settings/chatgpt-local'");b=s.index('      if (!status.connected)',a)
s=s[:a]+'''      const status = await requestFeatureJson('/api/settings/chatgpt-local', { signal }, (value) => {
        const data = requireRecord(requireRecord(value).data);
        if (typeof data.available !== 'boolean' || typeof data.connected !== 'boolean' || !Array.isArray(data.models)) throw new FeatureRequestError('로컬 AI 상태 응답을 확인하지 못했습니다.');
        return data as unknown as ChatGPTLocalStatus;
      });
      if (!status.available) throw new Error('로컬 Codex를 사용할 수 없습니다. 설치 상태를 확인해 주세요.');
''' +s[b:]
s=s.replace("      if (model) {\n        return { provider: 'chatgpt-local', key: '', model };\n      }", "      if (model) return { provider: 'chatgpt-local', key: '', model };\n      throw new Error('선택한 로컬 모델에서 이미지 입력을 확인하지 못했습니다. 설정에서 사용할 연결을 직접 선택하세요. 다른 공급자로 자동 전환하지 않았습니다.');")
s=s.replace('      const key = await loadStoredProviderKey(provider);', '      signal?.throwIfAborted();\n      const key = await loadStoredProviderKey(provider);\n      signal?.throwIfAborted();')
s=s.replace('    } catch {\n      // 손상되거나', '    } catch {\n      signal?.throwIfAborted();\n      // 손상되거나')
p.write_text(s)
rep('src/app/(with-nav)/tools/ocr/page.tsx','const visionKey = await getFirstAvailableVisionKey();','const visionKey = await getFirstAvailableVisionKey(undefined, controller.signal);')
with open('/tmp/nonbilling-edited-paths.txt','a') as f:f.write('src/lib/vision-byok.ts\n')
print('ASYNC_TYPE_FIX_AND_EXPLICIT_PROVIDER_SELECTION')
