import weaviate from 'weaviate-client';

import {
  getWeaviateClient,
  hybridSearch,
  resetWeaviateClient,
} from '@/lib/weaviate';

jest.mock('weaviate-client', () => {
  class ApiKey {
    constructor(readonly key: string) {}
  }

  return {
    __esModule: true,
    ApiKey,
    Filters: {
      and: (...filters: unknown[]) => ({ operator: 'And', filters }),
      or: (...filters: unknown[]) => ({ operator: 'Or', filters }),
    },
    default: {
      ApiKey,
      connectToCustom: jest.fn(),
    },
  };
});

describe('Weaviate v3 adapter', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      WEAVIATE_URL: 'https://vector.example.test:9443/weaviate',
      WEAVIATE_GRPC_HOST: 'grpc.example.test',
      WEAVIATE_GRPC_PORT: '7443',
      WEAVIATE_API_KEY: 'test-api-key',
    };
    resetWeaviateClient();
    jest.restoreAllMocks();
  });

  afterAll(() => {
    process.env = originalEnv;
    resetWeaviateClient();
  });

  it('connects with the maintained v3 client and explicit HTTP/gRPC endpoints', async () => {
    const client = {
      isReady: jest.fn().mockResolvedValue(true),
      close: jest.fn().mockResolvedValue(undefined),
    };
    const connect = weaviate.connectToCustom as jest.Mock;
    connect.mockResolvedValue(client);

    await expect(getWeaviateClient()).resolves.toBe(client);
    expect(connect).toHaveBeenCalledWith(expect.objectContaining({
      httpHost: 'vector.example.test',
      httpPath: '/weaviate',
      httpPort: 9443,
      httpSecure: true,
      grpcHost: 'grpc.example.test',
      grpcPort: 7443,
      grpcSecure: true,
      authCredentials: expect.any(weaviate.ApiKey),
    }));
  });

  it('maps v2-style equality filters and v3 query metadata into the stable hit contract', async () => {
    const equalFilter = { kind: 'equal-filter' };
    const equal = jest.fn().mockReturnValue(equalFilter);
    const byProperty = jest.fn().mockReturnValue({ equal });
    const hybrid = jest.fn().mockResolvedValue({
      objects: [{
        uuid: 'object-1',
        properties: { title: 'KEC 문서', content: '본문' },
        metadata: { score: 0.92, distance: 0.08, certainty: 0.91 },
      }],
    });
    const collection = {
      filter: { byProperty },
      query: { hybrid },
    };
    const client = {
      isReady: jest.fn().mockResolvedValue(true),
      close: jest.fn().mockResolvedValue(undefined),
      collections: { use: jest.fn().mockReturnValue(collection) },
    };
    (weaviate.connectToCustom as jest.Mock).mockResolvedValue(client);

    const hits = await hybridSearch('Esa_Kr_Electrical', '접지', {
      where: { path: ['country'], operator: 'Equal', valueText: 'kr' },
      alpha: 2,
      limit: 1000,
      vector: [0.1, 0.2],
    } as never);

    expect(byProperty).toHaveBeenCalledWith('country');
    expect(equal).toHaveBeenCalledWith('kr');
    expect(hybrid).toHaveBeenCalledWith('접지', expect.objectContaining({
      alpha: 1,
      limit: 100,
      filters: equalFilter,
      vector: [0.1, 0.2],
      returnMetadata: ['score', 'distance', 'certainty'],
    }));
    expect(hits).toEqual([{
      title: 'KEC 문서',
      content: '본문',
      _additional: {
        id: 'object-1',
        score: 0.92,
        distance: 0.08,
        certainty: 0.91,
      },
    }]);
  });
});
