jest.mock('../embedding', () => ({ generateEmbedding: jest.fn() }));
jest.mock('../weaviate', () => ({ resolveCollections: jest.fn(), hybridSearch: jest.fn() }));
import { generateEmbedding } from '../embedding';
import { resolveCollections, hybridSearch } from '../weaviate';
import { searchRAG, ragFreshness, sourceUrl } from '../rag-pipeline';
import { readElectricalChatResponse } from '../electrical-chat-client';

const hit = (id: string, patch: Record<string, unknown> = {}) => ({ _additional: { id, score: 1 }, title: id,
  content: 'Full protected content', summary: 'Permitted summary', source_url: 'https://example.invalid/source',
  license_type: 'open', ...patch });
beforeEach(() => {
  jest.clearAllMocks(); jest.mocked(generateEmbedding).mockResolvedValue([0.1, 0.2]);
  jest.mocked(resolveCollections).mockReturnValue(['ESA_KR_Electrical']); jest.mocked(hybridSearch).mockResolvedValue([]);
});
function stream(chunks: string[]) {
  return new Response(new ReadableStream<Uint8Array>({ start(controller) { for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk)); controller.close(); } }));
}

describe('complete streaming answers', () => {
  it('supports data frames without a space and preserves split Unicode', async () => {
    expect((await readElectricalChatResponse(stream(['data:{"text":"전기 "}\r\n', 'data: {"text":"검토"}\n\ndata:[DONE]\n']))).text).toBe('전기 검토');
  });
  it('does not accept a partial answer without completion', async () => {
    await expect(readElectricalChatResponse(stream(['data: {"text":"partial"}\n']))).rejects.toThrow('완료');
  });
  it('surfaces structured errors instead of returning the partial answer', async () => {
    await expect(readElectricalChatResponse(stream(['data: {"text":"partial"}\n', 'data: {"error":{"message":"provider failure"}}\n']))).rejects.toThrow('provider failure');
  });
  it.each(['data: {broken}\n', 'data: null\n', 'data: []\n'])('rejects malformed frames %p', async (raw) => {
    await expect(readElectricalChatResponse(stream([raw, 'data: [DONE]\n']))).rejects.toThrow();
  });
  it('does not read trailing text after DONE', async () => {
    expect((await readElectricalChatResponse(stream(['data: {"text":"complete"}\ndata: [DONE]\ndata: {"text":"ignored"}\n']))).text).toBe('complete');
  });
  it('honors final safety-filter replacement before completion', async () => {
    expect((await readElectricalChatResponse(stream(['data: {"text":"unsafe"}\n', 'data: {"filter":{"passed":false,"filteredText":"HOLD","notice":"verify source"}}}\n', 'data: [DONE]\n']))).text).toContain('HOLD');
  });
  it('releases the reader after errors', async () => {
    const response = stream(['data: {broken}\n']);
    await expect(readElectricalChatResponse(response)).rejects.toThrow(); expect(response.body!.locked).toBe(false);
  });
});

describe('retrieval is not ground-truth certification', () => {
  it('uses keyword-only mode when embeddings fail and reports that choice', async () => {
    jest.mocked(generateEmbedding).mockRejectedValue(new Error('No embedding'));
    const diagnostics = jest.fn(); await searchRAG({ query: '전압강하', onDiagnostics: diagnostics });
    expect(hybridSearch).toHaveBeenCalledWith('ESA_KR_Electrical', '전압강하', expect.objectContaining({ alpha: 0, failOnError: true }));
    expect(hybridSearch).not.toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.objectContaining({ vector: expect.anything() }));
    expect(diagnostics).toHaveBeenCalledWith(expect.objectContaining({ mode: 'keyword-only', status: 'complete' }));
  });
  it('distinguishes partial and unavailable collections from genuine zero hits', async () => {
    jest.mocked(resolveCollections).mockReturnValue(['ESA_KR_Electrical', 'ESA_US_Electrical']);
    jest.mocked(hybridSearch).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([]);
    const diagnostics = jest.fn(); await searchRAG({ query: 'KEC', onDiagnostics: diagnostics });
    expect(diagnostics).toHaveBeenLastCalledWith(expect.objectContaining({ failedCollections: 1, status: 'partial' }));
    jest.mocked(hybridSearch).mockRejectedValue(new Error('offline'));
    await searchRAG({ query: 'KEC', onDiagnostics: diagnostics });
    expect(diagnostics).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'unavailable' }));
  });
  it('caps collection fan-out without changing result order', async () => {
    jest.mocked(resolveCollections).mockReturnValue(Array.from({ length: 12 }, (_, i) => `collection-${i}`));
    let active = 0, peak = 0;
    jest.mocked(hybridSearch).mockImplementation(async (collection) => { active++; peak = Math.max(peak, active); await new Promise((resolve) => setTimeout(resolve, 1)); active--; return [hit(collection)]; });
    const result = await searchRAG({ query: 'query', limit: 20 });
    expect(peak).toBeLessThanOrEqual(4); expect(peak).toBeGreaterThan(1); expect(result).toHaveLength(12);
  });
  it('does not leak full content for restricted or missing license metadata', async () => {
    jest.mocked(hybridSearch).mockResolvedValue([hit('a', { license_type: 'summary_only' }), hit('b', { license_type: 'link_only' }), hit('c', { license_type: 'unsupported' })]);
    const result = await searchRAG({ query: 'query' });
    expect(result.find((item) => item.title === 'a')?.snippet).toBe('Permitted summary');
    expect(result.every((item) => !item.snippet.includes('Full protected content'))).toBe(true);
  });
  it('retains separate clauses and chunks at one source URL', async () => {
    jest.mocked(hybridSearch).mockResolvedValue([hit('a', { doc_hash: 'same', clause: '1', chunk_index: 0 }), hit('b', { doc_hash: 'same', clause: '1', chunk_index: 1 }), hit('c', { doc_hash: 'same', clause: '2', chunk_index: 0 })]);
    expect(await searchRAG({ query: 'query' })).toHaveLength(3);
  });
  it('does not invent a publication date or unsafe URL', async () => {
    jest.mocked(hybridSearch).mockResolvedValue([hit('a', { source_url: 'javascript:alert(1)' })]);
    const [result] = await searchRAG({ query: 'query' }); expect(result.publishedAt).toBeUndefined(); expect(result.url).toBe('');
    expect(ragFreshness('2999-01-01', undefined, 0)).toBe(1); expect(ragFreshness('invalid')).toBe(1);
    expect(sourceUrl('https://token:secret@example.invalid')).toBe('');
  });
  it.each([{ limit: NaN }, { limit: 0 }, { country: 'attacker' }, { genre: 'unknown' }, { filters: { ignoredField: 'value' } }])('rejects invalid retrieval options %p without widening scope', async (options) => {
    await expect(searchRAG({ query: 'query', ...options })).rejects.toThrow(); expect(hybridSearch).not.toHaveBeenCalled();
  });
});
