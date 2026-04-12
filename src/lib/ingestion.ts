/**
 * ESVA Document Ingestion Pipeline — Validate, chunk, embed, store
 *
 * Ingests documents into Weaviate collections with deduplication,
 * chunking, and embedding generation.
 *
 * PART 1: Types
 * PART 2: Validation & dedup
 * PART 3: Single document ingestion
 * PART 4: Bulk ingestion
 */

import { chunkText, type ChunkOptions } from './chunker';
import { generateEmbeddings } from './embedding';
import {
  getCollectionName,
  ensureCollection,
  batchUpsert,
  getWeaviateClient,
  type ESACountry,
  type ESAGenre,
  type ESALicenseType,
  type ESADocType,
  type WeaviateObject,
} from './weaviate';

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1 — Types
// ═══════════════════════════════════════════════════════════════════════════════

/** Document ready for ingestion into the RAG pipeline */
export interface IngestableDocument {
  title: string;
  content: string;
  standard?: string;
  clause?: string;
  country: string;
  genre: string;
  sourceUrl: string;
  licenseType: ESALicenseType;
  publishedAt?: string;
  docType: ESADocType;
}

/** Result of a bulk ingestion operation */
export interface BulkIngestResult {
  ingested: number;
  skipped: number;
  errors: string[];
}

/** Validation error detail */
interface ValidationError {
  field: string;
  message: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2 — Validation & Dedup
// ═══════════════════════════════════════════════════════════════════════════════

/** In-memory set of ingested URLs for deduplication within a session */
const ingestedUrls = new Set<string>();

/**
 * Validate an IngestableDocument. Returns errors if invalid.
 */
function validateDocument(doc: IngestableDocument): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!doc.title || !doc.title.trim()) {
    errors.push({ field: 'title', message: 'Title is required' });
  }
  if (!doc.content || !doc.content.trim()) {
    errors.push({ field: 'content', message: 'Content is required' });
  }
  if (!doc.country || !doc.country.trim()) {
    errors.push({ field: 'country', message: 'Country is required' });
  }
  if (!doc.genre || !doc.genre.trim()) {
    errors.push({ field: 'genre', message: 'Genre is required' });
  }
  if (!doc.sourceUrl || !doc.sourceUrl.trim()) {
    errors.push({ field: 'sourceUrl', message: 'Source URL is required' });
  }
  if (!doc.licenseType) {
    errors.push({ field: 'licenseType', message: 'License type is required' });
  }
  if (!doc.docType) {
    errors.push({ field: 'docType', message: 'Document type is required' });
  }

  return errors;
}

/**
 * Generate a deterministic document ID from the source URL.
 * Used for deduplication — same URL always produces the same ID.
 */
function generateDocId(url: string): string {
  // FNV-1a hash to hex string
  let h = 0x811c9dc5;
  for (let i = 0; i < url.length; i++) {
    h ^= url.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  const hash = (h >>> 0).toString(16).padStart(8, '0');
  // Weaviate expects UUID format
  return [
    hash.slice(0, 8),
    hash.slice(0, 4),
    '4' + hash.slice(1, 4),
    '8' + hash.slice(0, 3),
    hash.padEnd(12, '0').slice(0, 12),
  ].join('-');
}

/**
 * Check if a document with this URL has already been ingested (session-level dedup).
 */
function isDuplicate(sourceUrl: string): boolean {
  return ingestedUrls.has(sourceUrl.trim());
}

/**
 * Mark a URL as ingested.
 */
function markIngested(sourceUrl: string): void {
  ingestedUrls.add(sourceUrl.trim());
}

/**
 * Clear the dedup set. Useful for testing or new ingestion sessions.
 */
export function clearIngestedUrls(): void {
  ingestedUrls.clear();
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 3 — Single Document Ingestion
// ═══════════════════════════════════════════════════════════════════════════════

/** Chunking options for ingestion */
const INGEST_CHUNK_OPTIONS: ChunkOptions = {
  maxTokens: 512,
  overlap: 50,
  respectParagraphs: true,
  preserveClauseRefs: true,
};

/**
 * Ingest a single document into the appropriate Weaviate collection.
 *
 * Steps:
 *  1. Validate document fields
 *  2. Check for duplicate (by URL)
 *  3. Chunk content using chunker.ts
 *  4. Generate embeddings for all chunks
 *  5. Upsert chunks to Weaviate with metadata
 *  6. Record timestamp and mark as ingested
 *
 * @param doc - The document to ingest
 * @returns The parent document ID
 * @throws Error if validation fails or Weaviate is unavailable
 */
export async function ingestDocument(doc: IngestableDocument): Promise<string> {
  // Step 1: Validate
  const validationErrors = validateDocument(doc);
  if (validationErrors.length > 0) {
    const details = validationErrors.map((e) => `${e.field}: ${e.message}`).join('; ');
    throw new Error(`[ESA/Ingest] Validation failed: ${details}`);
  }

  // Step 2: Dedup by URL
  if (isDuplicate(doc.sourceUrl)) {
    throw new Error(`[ESA/Ingest] Duplicate URL skipped: ${doc.sourceUrl}`);
  }

  // Verify Weaviate is available
  const client = await getWeaviateClient();
  if (!client) {
    throw new Error('[ESA/Ingest] Weaviate is not available');
  }

  // Determine target collection
  const collectionName = getCollectionName(
    doc.country as ESACountry,
    doc.genre as ESAGenre,
  );

  // Ensure collection exists
  const ensureResult = await ensureCollection(collectionName);
  if (!ensureResult.success) {
    throw new Error(`[ESA/Ingest] Failed to ensure collection ${collectionName}: ${ensureResult.error}`);
  }

  // Generate parent doc ID
  const parentId = generateDocId(doc.sourceUrl);
  const now = new Date().toISOString();

  // Step 3: Chunk the content
  const chunks = chunkText(doc.content, INGEST_CHUNK_OPTIONS);
  if (chunks.length === 0) {
    throw new Error('[ESA/Ingest] Document produced no chunks after splitting');
  }

  // Step 4: Generate embeddings for all chunks
  const chunkTexts = chunks.map((c) => c.text);
  let embeddings: number[][];
  try {
    embeddings = await generateEmbeddings(chunkTexts);
  } catch (err) {
    throw new Error(
      `[ESA/Ingest] Embedding generation failed: ${(err as Error).message}`,
    );
  }

  // Step 5: Build Weaviate objects and upsert
  const objects: WeaviateObject[] = chunks.map((chunk, idx) => ({
    id: idx === 0 ? parentId : undefined, // First chunk gets the parent ID
    properties: {
      title: doc.title,
      content: chunk.text,
      summary: '', // Can be populated later by summarization
      standard: doc.standard ?? '',
      clause: doc.clause ?? '',
      country: doc.country,
      genre: doc.genre,
      source_url: doc.sourceUrl,
      license_type: doc.licenseType,
      published_at: doc.publishedAt ?? now,
      collected_at: now,
      quality_score: 0,
      doc_type: doc.docType,
      chunk_index: chunk.index,
      parent_id: parentId,
      doc_hash: '', // Could be populated with content hash
    },
    vector: embeddings[idx],
  }));

  const { succeeded, failed } = await batchUpsert(collectionName, objects);

  if (failed > 0 && succeeded === 0) {
    throw new Error(
      `[ESA/Ingest] All ${failed} chunk upserts failed for "${doc.title}"`,
    );
  }

  if (failed > 0) {
    console.warn(
      `[ESA/Ingest] ${failed} of ${objects.length} chunks failed for "${doc.title}"`,
    );
  }

  // Step 6: Mark as ingested
  markIngested(doc.sourceUrl);
  console.log(
    `[ESA/Ingest] Ingested "${doc.title}" → ${collectionName} (${succeeded} chunks, id: ${parentId})`,
  );

  return parentId;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 4 — Bulk Ingestion
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Ingest multiple documents, collecting results.
 *
 * Processes documents sequentially to avoid overwhelming the embedding API.
 * Skips duplicates and collects errors without aborting the batch.
 *
 * @param docs - Array of documents to ingest
 * @returns Summary with ingested count, skipped count, and error messages
 */
export async function bulkIngest(docs: IngestableDocument[]): Promise<BulkIngestResult> {
  let ingested = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const doc of docs) {
    try {
      // Quick pre-check for dedup without throwing
      if (isDuplicate(doc.sourceUrl)) {
        skipped++;
        continue;
      }

      await ingestDocument(doc);
      ingested++;
    } catch (err) {
      const msg = (err as Error).message;

      if (msg.includes('Duplicate URL')) {
        skipped++;
      } else {
        errors.push(`${doc.title ?? doc.sourceUrl}: ${msg}`);
      }
    }
  }

  console.log(
    `[ESA/Ingest] Bulk complete: ${ingested} ingested, ${skipped} skipped, ${errors.length} errors`,
  );

  return { ingested, skipped, errors };
}
