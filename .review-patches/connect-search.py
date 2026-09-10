from pathlib import Path
import subprocess
BASE='dd4be8d5b39030390e23131adf3c442cd225da1c'
changed=[]
def edit(name,fn):
 p=Path(name);assert p.read_bytes()==subprocess.check_output(['git','show',f'{BASE}:{name}']),name
 p.write_text(fn(p.read_text()));changed.append(name)
def rep(s,a,b,n=1):
 assert s.count(a)==n,(s.count(a),a[:95]);return s.replace(a,b)
def weaviate(s):
 s=rep(s,"import { createLogger }", "import { createSingleFlightResource } from './single-flight-resource';\nimport { createLogger }")
 s=rep(s,'let _client: WeaviateClient | null = null;\nlet _nextConnectionAttemptAt = 0;', '''const connection = createSingleFlightResource<WeaviateClient>({
  connect: connectWeaviate,
  ready: (client) => client.isReady(), close: (client) => client.close(),
  onFailure: () => wlog.warn('Vector connection unavailable; no endpoint or credential is logged'),
});''')
 a=s.index('export async function getWeaviateClient()');b=s.index('    // Dynamic import',a)
 s=s[:a]+'''export function getWeaviateClient(): Promise<WeaviateClient | null> { return connection.get(); }

async function connectWeaviate(): Promise<WeaviateClient> {
    const url = process.env.WEAVIATE_URL ?? WEAVIATE_DEFAULTS.url;
    const apiKey = process.env.WEAVIATE_API_KEY;
'''+s[b:]
 a=s.index('    // Verify connection');b=s.index('// ═══',a)
 s=s[:a]+'''    return client;
}

/** Reset also invalidates unresolved connection attempts. */
export function resetWeaviateClient(): void { connection.reset(); }

'''+s[b:]
 s=rep(s,"    const httpSecure = endpoint.protocol === 'https:';", "    if (endpoint.username || endpoint.password || endpoint.hash || endpoint.search) throw new Error('Invalid vector endpoint');\n    const httpSecure = endpoint.protocol === 'https:';")
 s=rep(s,"  if (!match) return null;", "  if (!match || !['kr','us','eu','jp','global'].includes(match[1].toLowerCase())\n    || !['electrical','mechanical','fire','energy','ai','general'].includes(match[2].toLowerCase())) return null;")
 s=rep(s,"      names.push(getCollectionName(c, g));", "      const name = getCollectionName(c, g);\n      if (!parseCollectionName(name)) throw new Error('Invalid search collection scope');\n      if (!names.includes(name)) names.push(name);")
 s=rep(s,'  combiners: FilterCombiners,\n): FilterValue | undefined {', '  combiners: FilterCombiners,\n  depth = 0,\n): FilterValue {\n  if (depth > 4) throw new Error(\'Search filter nesting limit\');')
 s=rep(s,'    const children = where.operands\n      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === \'object\')\n      .map((item) => convertWhereFilter(collection, item, combiners))\n      .filter((item): item is FilterValue => Boolean(item));\n    if (children.length === 0) return undefined;', '''    if (!where.operands.length || where.operands.length > 32 || !where.operands.every((item) => item && typeof item === 'object' && !Array.isArray(item))) throw new Error('Invalid search operands');
    const children = where.operands.map((item) => convertWhereFilter(collection, item as Record<string, unknown>, combiners, depth + 1));''')
 a=s.index('function convertWhereFilter(');b=s.index('/**',a);block=s[a:b]
 block=block.replace('return undefined;', "throw new Error('Invalid search filter');")
 block=block.replace('  return collection.filter.byProperty(property).equal(value);', "  if ((typeof value === 'number' && !Number.isFinite(value)) || (typeof value === 'string' && value.length > 4096)) throw new Error('Invalid filter value');\n  return collection.filter.byProperty(property).equal(value);")
 s=s[:a]+block+s[b:]
 s=rep(s,'    vector?: number[];\n  } = {},','    vector?: number[];\n    failOnError?: boolean;\n  } = {},')
 s=rep(s,'  if (!client) return [];', "  if (!client) { if (opts.failOnError) throw new Error('Vector service unavailable'); return []; }")
 s=rep(s,'  const alpha = Math.min(1, Math.max(0, opts.alpha ?? 0.7));', "  if (!Number.isFinite(opts.alpha ?? 0.7) || !Number.isFinite(opts.limit ?? 10)\n    || (opts.vector && (!opts.vector.length || !opts.vector.every(Number.isFinite)))) throw new Error('Invalid hybrid search options');\n  const alpha = Math.min(1, Math.max(0, opts.alpha ?? 0.7));")
 s=rep(s,"    wlog.warn('Hybrid search failed', { collectionName, error: (err as Error).message });\n    return [];", "    void err;\n    wlog.warn('Hybrid search failed', { collectionName });\n    if (opts.failOnError) throw new Error('Vector search unavailable or filter rejected');\n    return [];")
 return s
edit('src/lib/weaviate.ts',weaviate)

def chat(s):
 s=rep(s,"import type { ChatMessage }", "import { requestFeatureJson, requireRecord } from './feature-request';\nimport type { ChatMessage }")
 s=rep(s,'export async function resolveBrowserChatTransport(): Promise<ChatTransport> {','export async function resolveBrowserChatTransport(signal?: AbortSignal): Promise<ChatTransport> {\n  signal?.throwIfAborted();')
 a=s.index("    const response = await fetch('/api/settings/chatgpt-local'");b=s.index('    if (!status.connected)',a)
 s=s[:a]+'''    const status = await requestFeatureJson('/api/settings/chatgpt-local', { signal }, (value) => {
      const body = requireRecord(requireRecord(value).data);
      if (typeof body.available !== 'boolean' || typeof body.connected !== 'boolean' || !Array.isArray(body.models)) {
        throw new Error('로컬 계정 상태 응답을 확인하지 못했습니다.');
      }
      return body as unknown as import('@/lib/chatgpt-local-contract').ChatGPTLocalStatus;
    });
    if (!status.available) throw new Error('로컬 Codex를 사용할 수 없습니다. 설치 상태를 확인해 주세요.');
'''+s[b:]
 s=rep(s,'  const decoder = new TextDecoder();', "  const decoder = new TextDecoder('utf-8', { fatal: true });")
 s=rep(s,"    if (!line.startsWith('data: ')) return;\n    const raw = line.slice(6).trim();", "    if (doneEvent || !line.startsWith('data:')) return;\n    const raw = line.slice(5).trim();\n    if (!raw) return;")
 s=rep(s,'    } catch {\n      return;\n    }', "    } catch { throw new Error('AI 응답 일부가 손상됐습니다. 완료된 답변으로 처리하지 않았습니다.'); }\n    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('AI 응답 형식 오류');")
 s=rep(s,"    if (typeof payload.error === 'string') throw new Error(payload.error);", "    if (payload.error) throw new Error(errorMessageFromPayload(payload, 'AI 공급자 응답 오류'));")
 s=rep(s,'      text += payload.text;', "      if (text.length + payload.text.length > 1_048_576) throw new Error('AI 응답 크기 제한 초과');\n      text += payload.text;")
 a=s.index('  while (!doneEvent)');b=s.index('\n  if (!text.trim())',a)
 s=s[:a]+'''  try {
    while (!doneEvent) {
      const { done, value } = await reader.read();
      if (done) break;
      const split = splitCompleteSseLines(remainder, decoder.decode(value, { stream: true }));
      remainder = split.remainder;
      if (remainder.length > 1_048_576) throw new Error('AI 응답 프레임 크기 제한 초과');
      for (const line of split.lines) { applyLine(line); if (doneEvent) break; }
    }
    if (!doneEvent) {
      const tail = splitCompleteSseLines(remainder, `${decoder.decode()}\\n`);
      for (const line of tail.lines) { applyLine(line); if (doneEvent) break; }
    }
    if (!doneEvent) throw new Error('AI 응답이 완료되기 전에 연결이 끊겼습니다. 일부 답변을 확정 결과로 사용하지 마세요.');
  } finally {
    try { await reader.cancel(); } catch { /* Preserve the original provider/transport error. */ }
    reader.releaseLock();
  }
''' +s[b:]
 s=rep(s,'  const transport = await resolveBrowserChatTransport();', '  options.signal?.throwIfAborted();\n  const transport = await resolveBrowserChatTransport(options.signal);\n  options.signal?.throwIfAborted();')
 return s
edit('src/lib/electrical-chat-client.ts',chat)
with open('/tmp/nonbilling-edited-paths.txt','a') as f:f.write('\n'.join(changed)+'\n')
print('SEARCH_TRANSPORT_INTEGRATIONS',changed)
