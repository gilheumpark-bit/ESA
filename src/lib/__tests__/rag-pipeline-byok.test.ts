import { generateEmbedding } from '@/lib/embedding';
import { searchRAG } from '@/lib/rag-pipeline';
import { hybridSearch, resolveCollections } from '@/lib/weaviate';

jest.mock('@/lib/embedding', () => ({ generateEmbedding: jest.fn() }));
jest.mock('@/lib/weaviate', () => ({
  resolveCollections: jest.fn(),
  hybridSearch: jest.fn(),
}));

describe('RAG browser BYOK embedding wiring', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (resolveCollections as jest.Mock).mockReturnValue(['Esa_Kr_Electrical']);
    (generateEmbedding as jest.Mock).mockResolvedValue([0.11, 0.22]);
    (hybridSearch as jest.Mock).mockResolvedValue([]);
  });

  it('uses the supplied provider key and sends the resulting vector to hybrid search', async () => {
    await searchRAG({
      query: 'VCB 보호협조',
      country: 'KR',
      embeddingByok: { provider: 'gemini', apiKey: 'test-google-key' },
    } as never);

    expect(generateEmbedding).toHaveBeenCalledWith(
      'VCB 보호협조',
      'gemini',
      'test-google-key',
    );
    expect(hybridSearch).toHaveBeenCalledWith(
      'Esa_Kr_Electrical',
      'VCB 보호협조',
      expect.objectContaining({ vector: [0.11, 0.22] }),
    );
  });

  it('fails closed for missing, unknown, or incomplete restricted licenses', async () => {
    (hybridSearch as jest.Mock).mockResolvedValue([
      {
        _additional: { id: 'a', score: 0.9 },
        title: 'summary missing',
        content: 'RESTRICTED FULL CONTENT A',
        license_type: 'summary_only',
      },
      {
        _additional: { id: 'b', score: 0.8 },
        title: 'license missing',
        content: 'RESTRICTED FULL CONTENT B',
      },
      {
        _additional: { id: 'c', score: 0.7 },
        title: 'license unknown',
        content: 'RESTRICTED FULL CONTENT C',
        license_type: 'partner_only',
      },
    ]);

    const results = await searchRAG({
      query: 'restricted records',
      country: 'KR',
    } as never);

    expect(results.map((result) => result.snippet)).toEqual([
      '[Summary unavailable — see source link]',
      '[Content restricted — see source link]',
      '[Content restricted — see source link]',
    ]);
    expect(results.map((result) => result.licenseType)).toEqual([
      'summary_only',
      'link_only',
      'link_only',
    ]);
    expect(JSON.stringify(results)).not.toContain('RESTRICTED FULL CONTENT');
  });
});
