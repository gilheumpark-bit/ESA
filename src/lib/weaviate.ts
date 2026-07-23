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

import type {
  Collection,
  FilterValue,
  WeaviateClass,
  WeaviateClient,
  WeaviateField,
} from 'weaviate-client';

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
  properties: Record<string, WeaviateField>;
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

const WEAVIATE_DEFAULTS = {
  url: 'http://localhost:8080',
  grpcPort: 50051,
} as const;

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2 — Singleton Client
// ═══════════════════════════════════════════════════════════════════════════════

let _client: WeaviateClient | null = null;
let _nextConnectionAttemptAt = 0;

function parsePort(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 65535 ? parsed : fallback;
}

/**
 * Get or create a Weaviate client singleton.
 * Gracefully returns null if connection fails.
 */
export async function getWeaviateClient(): Promise<WeaviateClient | null> {
  if (_client) return _client;
  if (Date.now() < _nextConnectionAttemptAt) return null;

  const url = process.env.WEAVIATE_URL ?? WEAVIATE_DEFAULTS.url;
  const apiKey = process.env.WEAVIATE_API_KEY;

  try {
    // Dynamic import keeps the database client out of routes that do not use RAG.
    const weaviate = await import('weaviate-client');
    const endpoint = new URL(url);
    const httpSecure = endpoint.protocol === 'https:';
    if (!httpSecure && endpoint.protocol !== 'http:') {
      throw new Error('WEAVIATE_URL must use http or https');
    }

    // Pass OpenAI key for text2vec-openai if available
    const headers: Record<string, string> = {};
    if (process.env.OPENAI_API_KEY) {
      headers['X-OpenAI-Api-Key'] = process.env.OPENAI_API_KEY;
    }
    if (process.env.COHERE_API_KEY) {
      headers['X-Cohere-Api-Key'] = process.env.COHERE_API_KEY;
    }
    const defaultHttpPort = httpSecure ? 443 : 8080;
    const defaultGrpcPort = httpSecure ? 443 : WEAVIATE_DEFAULTS.grpcPort;
    const client = await weaviate.default.connectToCustom({
      httpHost: endpoint.hostname,
      httpPath: endpoint.pathname === '/' ? undefined : endpoint.pathname,
      httpPort: parsePort(endpoint.port, defaultHttpPort),
      httpSecure,
      grpcHost: process.env.WEAVIATE_GRPC_HOST || endpoint.hostname,
      grpcPort: parsePort(process.env.WEAVIATE_GRPC_PORT, defaultGrpcPort),
      grpcSecure: process.env.WEAVIATE_GRPC_SECURE
        ? process.env.WEAVIATE_GRPC_SECURE === 'true'
        : httpSecure,
      authCredentials: apiKey ? new weaviate.ApiKey(apiKey) : undefined,
      headers,
      timeout: { init: 5, query: 15, insert: 60 },
    });

    // Verify connection
    const ready = await client.isReady();
    if (!ready) {
      console.warn('[ESA/Weaviate] Server not ready at', url);
      await client.close().catch(() => undefined);
      _nextConnectionAttemptAt = Date.now() + 30_000;
      return null;
    }

    _client = client;
    _nextConnectionAttemptAt = 0;
    return _client;
  } catch (err) {
    console.warn('[ESA/Weaviate] Connection failed:', (err as Error).message);
    _nextConnectionAttemptAt = Date.now() + 30_000;
    return null;
  }
}

/** Reset client singleton (for testing or reconnection) */
export function resetWeaviateClient(): void {
  if (_client) void _client.close().catch(() => undefined);
  _client = null;
  _nextConnectionAttemptAt = 0;
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
    const exists = await client.collections.exists(name);
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

    await client.collections.createFromJson(classDef as WeaviateClass);
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
    const collection = client.collections.use(collectionName);

    if (obj.id) {
      if (await collection.data.exists(obj.id)) {
        await collection.data.update({
          id: obj.id,
          properties: obj.properties,
          ...(obj.vector ? { vectors: obj.vector } : {}),
        });
        return { id: obj.id };
      }
    }

    const id = await collection.data.insert({
      properties: obj.properties,
      ...(obj.id ? { id: obj.id } : {}),
      ...(obj.vector ? { vectors: obj.vector } : {}),
    });
    return { id };
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
  const collection = client.collections.use(collectionName);
  for (let i = 0; i < objects.length; i += BATCH_SIZE) {
    const batch = objects.slice(i, i + BATCH_SIZE);
    try {
      const batchObjects = batch.map((obj) => ({
        properties: obj.properties,
        ...(obj.id ? { id: obj.id } : {}),
        ...(obj.vector ? { vectors: obj.vector } : {}),
      }));

      const result = await collection.data.insertMany(batchObjects);
      const batchFailed = Object.keys(result.errors).length;
      failed += batchFailed;
      succeeded += batch.length - batchFailed;
    } catch (err) {
      console.error(`[ESA/Weaviate] Batch upsert error:`, (err as Error).message);
      failed += batch.length;
    }
  }

  return { succeeded, failed };
}

type V3Collection = Collection<undefined, string, undefined>;
type FilterCombiners = {
  and: (...filters: FilterValue[]) => FilterValue;
  or: (...filters: FilterValue[]) => FilterValue;
};

function convertWhereFilter(
  collection: V3Collection,
  where: Record<string, unknown>,
  combiners: FilterCombiners,
): FilterValue | undefined {
  const operator = typeof where.operator === 'string' ? where.operator : 'Equal';

  if ((operator === 'And' || operator === 'Or') && Array.isArray(where.operands)) {
    const children = where.operands
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
      .map((item) => convertWhereFilter(collection, item, combiners))
      .filter((item): item is FilterValue => Boolean(item));
    if (children.length === 0) return undefined;
    return operator === 'And' ? combiners.and(...children) : combiners.or(...children);
  }

  if (operator !== 'Equal' || !Array.isArray(where.path) || where.path.length !== 1) {
    return undefined;
  }

  const property = where.path[0];
  const allowedProperties = new Set(ESVA_DOCUMENT_PROPERTIES.map((item) => item.name));
  if (typeof property !== 'string' || !allowedProperties.has(property)) return undefined;

  const valueKey = ['valueText', 'valueString', 'valueInt', 'valueNumber', 'valueBoolean', 'valueDate']
    .find((key) => Object.hasOwn(where, key));
  if (!valueKey) return undefined;

  const value = where[valueKey];
  if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
    return undefined;
  }

  return collection.filter.byProperty(property).equal(value);
}

/**
 * Execute a v3 hybrid search against a collection.
 */
export async function hybridSearch(
  collectionName: string,
  query: string,
  opts: {
    alpha?: number;
    limit?: number;
    fields?: string[];
    where?: Record<string, unknown>;
    vector?: number[];
  } = {},
): Promise<WeaviateSearchHit[]> {
  const client = await getWeaviateClient();
  if (!client) return [];

  const alpha = Math.min(1, Math.max(0, opts.alpha ?? 0.7));
  const limit = Math.min(100, Math.max(1, Math.trunc(opts.limit ?? 10)));
  const fields = opts.fields ?? [
    'title', 'content', 'summary', 'standard', 'clause',
    'country', 'genre', 'source_url', 'license_type',
    'published_at', 'collected_at', 'quality_score', 'doc_type',
    '_additional { id score distance }',
  ];

  try {
    const collection = client.collections.use(collectionName);
    const { Filters } = await import('weaviate-client');
    const filters = opts.where
      ? convertWhereFilter(collection, opts.where, Filters)
      : undefined;
    const allowedProperties = new Set(ESVA_DOCUMENT_PROPERTIES.map((item) => item.name));
    const returnProperties = fields.filter((field) => allowedProperties.has(field));

    const result = await collection.query.hybrid(query, {
      alpha,
      limit,
      filters,
      returnProperties,
      returnMetadata: ['score', 'distance', 'certainty'],
      ...(opts.vector ? { vector: opts.vector } : {}),
    });

    return result.objects.map((object) => ({
      ...(object.properties as Record<string, unknown>),
      _additional: {
        id: object.uuid,
        score: object.metadata?.score ?? 0,
        distance: object.metadata?.distance,
        certainty: object.metadata?.certainty,
      },
    }));
  } catch (err) {
    console.warn(`[ESA/Weaviate] Hybrid search failed on ${collectionName}:`, (err as Error).message);
    return [];
  }
}
