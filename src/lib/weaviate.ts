/**
 * ESVA Weaviate Client — Vector Database Connection & Schema Management
 *
 * Singleton Weaviate client with per-sandbox collection naming
 * and configurable vectorizer (text2vec-openai / text2vec-cohere).
 *
 * PART 1: Types & constants
 * PART 2: Singleton client
 * PART 3: Collection naming
 * PART 4: Schema definition
 * PART 5: Collection management
 */

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1 — Types & Constants
// ═══════════════════════════════════════════════════════════════════════════════

/** Weaviate property data types */
type WeaviateDataType = 'text' | 'text[]' | 'number' | 'int' | 'boolean' | 'date';

/** Supported vectorizer backends */
export type VectorizerProvider = 'text2vec-openai' | 'text2vec-cohere' | 'none';

/** License type for ESVA documents */
export type ESALicenseType = 'open' | 'summary_only' | 'link_only';

/** Document type classification */
export type ESADocType = 'standard' | 'article' | 'guide' | 'regulation' | 'specification';

/** Property definition for collection schema */
export interface WeaviateProperty {
  name: string;
  dataType: WeaviateDataType;
  description?: string;
  /** Skip vectorization for metadata fields */
  skipVectorization?: boolean;
}

/** Weaviate object to upsert */
export interface WeaviateObject {
  id?: string;
  properties: Record<string, unknown>;
  vector?: number[];
}

/** Response from Weaviate GraphQL hybrid search */
export interface WeaviateSearchHit {
  _additional: {
    id: string;
    score: number;
    distance?: number;
    certainty?: number;
  };
  [key: string]: unknown;
}

/** Result wrapper for collection operations */
interface CollectionResult {
  success: boolean;
  error?: string;
}

/** Weaviate client interface (subset we actually use) */
interface WeaviateClientLike {
  schema: {
    classCreator: () => { withClass: (cls: unknown) => { do: () => Promise<void> } };
    classGetter: () => { withClassName: (name: string) => { do: () => Promise<unknown> } };
    exists: (name: string) => Promise<boolean>;
  };
  data: {
    creator: () => {
      withClassName: (name: string) => {
        withProperties: (props: Record<string, unknown>) => {
          withId: (id: string) => { do: () => Promise<{ id: string }> };
          do: () => Promise<{ id: string }>;
        };
      };
    };
    merger: () => {
      withClassName: (name: string) => {
        withId: (id: string) => {
          withProperties: (props: Record<string, unknown>) => { do: () => Promise<void> };
        };
      };
    };
  };
  graphql: {
    get: () => {
      withClassName: (name: string) => {
        withFields: (fields: string) => {
          withHybrid: (opts: { query: string; alpha: number }) => {
            withLimit: (limit: number) => {
              withWhere: (where: unknown) => { do: () => Promise<unknown> };
              do: () => Promise<unknown>;
            };
          };
        };
      };
    };
  };
  batch: {
    objectsBatcher: () => {
      withObjects: (...objs: unknown[]) => {
        do: () => Promise<unknown[]>;
      };
    };
  };
  misc: {
    readyChecker: () => { do: () => Promise<boolean> };
  };
}

const WEAVIATE_DEFAULTS = {
  url: 'http://localhost:8080',
  scheme: 'http',
} as const;

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2 — Singleton Client
// ═══════════════════════════════════════════════════════════════════════════════

let _client: WeaviateClientLike | null = null;
let _connectionFailed = false;

/**
 * Get or create a Weaviate client singleton.
 * Gracefully returns null if connection fails.
 */
export async function getWeaviateClient(): Promise<WeaviateClientLike | null> {
  if (_client) return _client;
  if (_connectionFailed) return null;

  const url = process.env.WEAVIATE_URL ?? WEAVIATE_DEFAULTS.url;
  const apiKey = process.env.WEAVIATE_API_KEY;
  const scheme = process.env.WEAVIATE_SCHEME ?? WEAVIATE_DEFAULTS.scheme;

  try {
    // Dynamic import to avoid bundling weaviate-ts-client when not used
    const weaviate = await import('weaviate-ts-client');

    const clientConfig: Record<string, unknown> = {
      scheme,
      host: url.replace(/^https?:\/\//, ''),
    };

    if (apiKey) {
      clientConfig.apiKey = new weaviate.ApiKey(apiKey);
    }

    // Pass OpenAI key for text2vec-openai if available
    const headers: Record<string, string> = {};
    if (process.env.OPENAI_API_KEY) {
      headers['X-OpenAI-Api-Key'] = process.env.OPENAI_API_KEY;
    }
    if (process.env.COHERE_API_KEY) {
      headers['X-Cohere-Api-Key'] = process.env.COHERE_API_KEY;
    }
    if (Object.keys(headers).length > 0) {
      clientConfig.headers = headers;
    }

    const client = weaviate.default.client(clientConfig as any) as unknown as WeaviateClientLike;

    // Verify connection
    const ready = await client.misc.readyChecker().do();
    if (!ready) {
      console.warn('[ESA/Weaviate] Server not ready at', url);
      _connectionFailed = true;
      return null;
    }

    _client = client;
    return _client;
  } catch (err) {
    console.warn('[ESA/Weaviate] Connection failed:', (err as Error).message);
    _connectionFailed = true;
    return null;
  }
}

/** Reset client singleton (for testing or reconnection) */
export function resetWeaviateClient(): void {
  _client = null;
  _connectionFailed = false;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 3 — Collection Naming
// ═══════════════════════════════════════════════════════════════════════════════

/** Valid country codes for ESVA sandboxes */
export type ESACountry = 'kr' | 'us' | 'eu' | 'jp' | 'global';

/** Valid genre codes for ESVA sandboxes */
export type ESAGenre = 'electrical' | 'mechanical' | 'fire' | 'energy' | 'ai' | 'general';

/**
 * Build a Weaviate collection name for the given sandbox.
 * Format: Esa_{Country}_{Genre} (PascalCase, Weaviate convention)
 *
 * @example getCollectionName('kr', 'electrical') => 'Esa_Kr_Electrical'
 */
export function getCollectionName(country: ESACountry, genre: ESAGenre): string {
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  return `Esa_${cap(country)}_${cap(genre)}`;
}

/**
 * Parse a collection name back into country + genre.
 * Returns null if the name doesn't match ESVA pattern.
 */
export function parseCollectionName(name: string): { country: ESACountry; genre: ESAGenre } | null {
  const match = name.match(/^Esa_([A-Za-z]+)_([A-Za-z]+)$/);
  if (!match) return null;
  return {
    country: match[1].toLowerCase() as ESACountry,
    genre: match[2].toLowerCase() as ESAGenre,
  };
}

/**
 * Get all collection names matching the given filters.
 * If no filters, returns all possible combinations.
 */
export function resolveCollections(
  country?: ESACountry | ESACountry[],
  genre?: ESAGenre | ESAGenre[],
): string[] {
  const countries: ESACountry[] = country
    ? Array.isArray(country) ? country : [country]
    : ['kr', 'us', 'eu', 'jp', 'global'];
  const genres: ESAGenre[] = genre
    ? Array.isArray(genre) ? genre : [genre]
    : ['electrical', 'mechanical', 'fire', 'energy', 'ai', 'general'];

  const names: string[] = [];
  for (const c of countries) {
    for (const g of genres) {
      names.push(getCollectionName(c, g));
    }
  }
  return names;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 4 — Schema Definition
// ═══════════════════════════════════════════════════════════════════════════════

/** Standard ESVA document schema properties */
export const ESVA_DOCUMENT_PROPERTIES: WeaviateProperty[] = [
  { name: 'title',        dataType: 'text',   description: 'Document title' },
  { name: 'content',      dataType: 'text',   description: 'Full document content or chunk' },
  { name: 'summary',      dataType: 'text',   description: 'AI-generated or manual summary' },
  { name: 'standard',     dataType: 'text',   description: 'Standard reference (e.g., KEC, NEC, IEC)', skipVectorization: true },
  { name: 'clause',       dataType: 'text',   description: 'Specific clause number', skipVectorization: true },
  { name: 'country',      dataType: 'text',   description: 'Country code (kr, us, eu, jp, global)', skipVectorization: true },
  { name: 'genre',        dataType: 'text',   description: 'Domain genre (electrical, mechanical, etc.)', skipVectorization: true },
  { name: 'source_url',   dataType: 'text',   description: 'Original source URL', skipVectorization: true },
  { name: 'license_type', dataType: 'text',   description: 'Access license: open, summary_only, link_only', skipVectorization: true },
  { name: 'published_at', dataType: 'date',   description: 'Original publication date', skipVectorization: true },
  { name: 'collected_at', dataType: 'date',   description: 'When ESVA collected this document', skipVectorization: true },
  { name: 'verified_at',  dataType: 'date',   description: 'When expert verification occurred', skipVectorization: true },
  { name: 'quality_score', dataType: 'number', description: 'Quality score 0-1', skipVectorization: true },
  { name: 'doc_type',     dataType: 'text',   description: 'Document type classification', skipVectorization: true },
  { name: 'chunk_index',  dataType: 'int',    description: 'Chunk position within parent document', skipVectorization: true },
  { name: 'parent_id',    dataType: 'text',   description: 'Parent document ID for chunks', skipVectorization: true },
  { name: 'doc_hash',     dataType: 'text',   description: 'Content hash for dedup', skipVectorization: true },
];

/**
 * Build a Weaviate class definition for a given collection name.
 */
export function buildClassDefinition(
  collectionName: string,
  vectorizer: VectorizerProvider = 'text2vec-openai',
) {
  const properties = ESVA_DOCUMENT_PROPERTIES.map((prop) => {
    const weaviateProp: Record<string, unknown> = {
      name: prop.name,
      dataType: [prop.dataType],
      description: prop.description,
    };

    if (prop.skipVectorization && vectorizer !== 'none') {
      weaviateProp.moduleConfig = {
        [vectorizer]: { skip: true },
      };
    }

    return weaviateProp;
  });

  const classDef: Record<string, unknown> = {
    class: collectionName,
    description: `ESVA document collection: ${collectionName}`,
    properties,
  };

  if (vectorizer !== 'none') {
    classDef.vectorizer = vectorizer;
    if (vectorizer === 'text2vec-openai') {
      classDef.moduleConfig = {
        'text2vec-openai': {
          model: 'text-embedding-3-small',
          dimensions: 1536,
          type: 'text',
        },
      };
    } else if (vectorizer === 'text2vec-cohere') {
      classDef.moduleConfig = {
        'text2vec-cohere': {
          model: 'embed-english-v3.0',
          truncate: 'END',
        },
      };
    }
  }

  return classDef;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 5 — Collection Management
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Ensure a collection exists in Weaviate, creating it if absent.
 * Returns success status. No-ops gracefully if Weaviate is unavailable.
 */
export async function ensureCollection(
  name: string,
  properties?: WeaviateProperty[],
  vectorizer?: VectorizerProvider,
): Promise<CollectionResult> {
  const client = await getWeaviateClient();
  if (!client) {
    return { success: false, error: 'Weaviate not available' };
  }

  try {
    const exists = await client.schema.exists(name);
    if (exists) return { success: true };

    const classDef = buildClassDefinition(name, vectorizer ?? getDefaultVectorizer());
    if (properties) {
      // Override with custom properties if provided
      (classDef as Record<string, unknown>).properties = properties.map((p) => ({
        name: p.name,
        dataType: [p.dataType],
        description: p.description,
      }));
    }

    await client.schema.classCreator().withClass(classDef).do();
    console.log(`[ESA/Weaviate] Created collection: ${name}`);
    return { success: true };
  } catch (err) {
    const msg = (err as Error).message;
    console.error(`[ESA/Weaviate] Failed to ensure collection ${name}:`, msg);
    return { success: false, error: msg };
  }
}

/**
 * Ensure all sandbox collections exist for a given country + genre pair.
 */
export async function ensureSandboxCollections(
  country: ESACountry,
  genre: ESAGenre,
): Promise<CollectionResult> {
  const name = getCollectionName(country, genre);
  return ensureCollection(name);
}

/** Read vectorizer preference from env, default to text2vec-openai */
function getDefaultVectorizer(): VectorizerProvider {
  const v = process.env.WEAVIATE_VECTORIZER;
  if (v === 'text2vec-cohere' || v === 'none') return v;
  return 'text2vec-openai';
}

/**
 * Upsert a single object into a collection.
 * If id is provided and exists, merges; otherwise creates.
 */
export async function upsertObject(
  collectionName: string,
  obj: WeaviateObject,
): Promise<{ id: string } | null> {
  const client = await getWeaviateClient();
  if (!client) return null;

  try {
    if (obj.id) {
      // Try merge (update)
      try {
        await client.data
          .merger()
          .withClassName(collectionName)
          .withId(obj.id)
          .withProperties(obj.properties)
          .do();
        return { id: obj.id };
      } catch {
        // Object doesn't exist yet, fall through to create
      }
    }

    const creator = client.data
      .creator()
      .withClassName(collectionName)
      .withProperties(obj.properties);

    if (obj.id) {
      const result = await creator.withId(obj.id).do();
      return { id: result.id };
    }

    const result = await creator.do();
    return { id: result.id };
  } catch (err) {
    console.error(`[ESA/Weaviate] Upsert failed for ${collectionName}:`, (err as Error).message);
    return null;
  }
}

/**
 * Batch upsert multiple objects.
 */
export async function batchUpsert(
  collectionName: string,
  objects: WeaviateObject[],
): Promise<{ succeeded: number; failed: number }> {
  const client = await getWeaviateClient();
  if (!client) return { succeeded: 0, failed: objects.length };

  let succeeded = 0;
  let failed = 0;

  // Process in batches of 100
  const BATCH_SIZE = 100;
  for (let i = 0; i < objects.length; i += BATCH_SIZE) {
    const batch = objects.slice(i, i + BATCH_SIZE);
    try {
      const batchObjects = batch.map((obj) => ({
        class: collectionName,
        properties: obj.properties,
        ...(obj.id ? { id: obj.id } : {}),
        ...(obj.vector ? { vector: obj.vector } : {}),
      }));

      const batcher = client.batch.objectsBatcher();
      const results = await batcher.withObjects(...batchObjects).do();

      for (const result of results) {
        const r = result as { result?: { errors?: { error?: unknown[] } } };
        if (r.result?.errors?.error?.length) {
          failed++;
        } else {
          succeeded++;
        }
      }
    } catch (err) {
      console.error(`[ESA/Weaviate] Batch upsert error:`, (err as Error).message);
      failed += batch.length;
    }
  }

  return { succeeded, failed };
}

/**
 * Execute a GraphQL hybrid search against a collection.
 */
export async function hybridSearch(
  collectionName: string,
  query: string,
  opts: {
    alpha?: number;
    limit?: number;
    fields?: string[];
    where?: Record<string, unknown>;
  } = {},
): Promise<WeaviateSearchHit[]> {
  const client = await getWeaviateClient();
  if (!client) return [];

  const alpha = opts.alpha ?? 0.7;
  const limit = opts.limit ?? 10;
  const fields = opts.fields ?? [
    'title', 'content', 'summary', 'standard', 'clause',
    'country', 'genre', 'source_url', 'license_type',
    'published_at', 'collected_at', 'quality_score', 'doc_type',
    '_additional { id score distance }',
  ];

  try {
    let builder = client.graphql
      .get()
      .withClassName(collectionName)
      .withFields(fields.join(' '))
      .withHybrid({ query, alpha })
      .withLimit(limit);

    let result: unknown;
    if (opts.where) {
      result = await builder.withWhere(opts.where).do();
    } else {
      result = await builder.do();
    }

    const data = result as {
      data?: { Get?: Record<string, WeaviateSearchHit[]> };
    };

    return data?.data?.Get?.[collectionName] ?? [];
  } catch (err) {
    console.warn(`[ESA/Weaviate] Hybrid search failed on ${collectionName}:`, (err as Error).message);
    return [];
  }
}
