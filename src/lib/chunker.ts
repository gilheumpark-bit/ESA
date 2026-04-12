/**
 * ESVA Smart Text Chunker — RAG-optimized document splitting
 *
 * Splits text into semantically coherent chunks for vector embedding,
 * respecting paragraph boundaries and preserving standard clause references.
 *
 * PART 1: Types & constants
 * PART 2: Token estimation
 * PART 3: Standard clause detection
 * PART 4: Paragraph-aware splitting
 * PART 5: Public API
 */

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1 — Types & Constants
// ═══════════════════════════════════════════════════════════════════════════════

/** A single chunk of text with metadata */
export interface Chunk {
  /** The chunk text content */
  text: string;
  /** Zero-based index of this chunk within the document */
  index: number;
  /** Estimated token count */
  tokenCount: number;
  /** Optional metadata attached to this chunk */
  metadata?: ChunkMetadata;
}

/** Metadata that can be attached to a chunk */
export interface ChunkMetadata {
  /** Standard clause references found in this chunk */
  clauseRefs?: string[];
  /** Whether this chunk starts a new section/heading */
  isHeading?: boolean;
  /** The heading text if this chunk is under a section */
  sectionTitle?: string;
}

/** Options for the chunking algorithm */
export interface ChunkOptions {
  /** Maximum tokens per chunk (default: 512) */
  maxTokens?: number;
  /** Overlap tokens between adjacent chunks (default: 50) */
  overlap?: number;
  /** Respect paragraph boundaries when possible (default: true) */
  respectParagraphs?: boolean;
  /** Preserve standard clause references within chunks (default: true) */
  preserveClauseRefs?: boolean;
}

const DEFAULT_MAX_TOKENS = 512;
const DEFAULT_OVERLAP = 50;

/** Patterns matching common standard clause references */
const CLAUSE_REF_PATTERNS = [
  // KEC 232.1, NEC 210.8, IEC 60364-4-41
  /\b(KEC|NEC|IEC|IEEE|NFPA|BS|EN|JIS|NESC)\s*[\d]+(?:[.-][\d]+)*(?:\([a-zA-Z0-9]+\))?/gi,
  // Section 250.52, Article 220, Clause 8.1.3
  /\b(Section|Article|Clause|Table|Figure|Annex)\s*[\d]+(?:[.-][\d]+)*/gi,
  // KS C IEC 60364, KS C 8305
  /\bKS\s+[A-Z]\s+(?:IEC\s+)?[\d]+(?:[.-][\d]+)*/gi,
];

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2 — Token Estimation
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Estimate token count for a string.
 * Uses a fast heuristic: ~4 characters per token for English,
 * ~2 characters per token for CJK (Korean/Japanese/Chinese).
 * Accurate enough for chunking; exact counts from tiktoken not needed here.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;

  let tokenEstimate = 0;
  // CJK character ranges
  const cjkRegex = /[\u3000-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF]/g;
  const cjkMatches = text.match(cjkRegex);
  const cjkCount = cjkMatches?.length ?? 0;

  // CJK: ~1.5 tokens per character; Latin: ~0.25 tokens per character
  const latinLength = text.length - cjkCount;
  tokenEstimate = Math.ceil(cjkCount * 1.5 + latinLength * 0.25);

  // Floor at word count for short texts
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  return Math.max(tokenEstimate, Math.ceil(wordCount * 0.75));
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 3 — Standard Clause Detection
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Extract all standard clause references from text.
 */
export function extractClauseRefs(text: string): string[] {
  const refs: Set<string> = new Set();
  for (const pattern of CLAUSE_REF_PATTERNS) {
    // Reset lastIndex for global regex
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      refs.add(match[0].trim());
    }
  }
  return [...refs];
}

/**
 * Check if a position falls inside a clause reference.
 * Used to avoid splitting in the middle of "KEC 232.1.2".
 */
function isInsideClauseRef(text: string, position: number): boolean {
  for (const pattern of CLAUSE_REF_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const start = match.index;
      const end = start + match[0].length;
      if (position > start && position < end) return true;
    }
  }
  return false;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 4 — Paragraph-aware Splitting
// ═══════════════════════════════════════════════════════════════════════════════

/** Detect section headings (lines that look like titles) */
function detectHeading(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  // Numbered heading patterns: "1.", "1.1", "1.1.1", "Chapter 1", etc.
  if (/^(?:\d+\.)+\s/.test(trimmed)) return true;
  if (/^(?:Chapter|Section|Article|Part|Annex)\s+\d/i.test(trimmed)) return true;
  // All-caps short line (likely a heading)
  if (trimmed.length < 80 && trimmed === trimmed.toUpperCase() && /[A-Z]/.test(trimmed)) return true;
  return false;
}

/**
 * Split text into paragraphs, preserving blank-line boundaries.
 */
function splitParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/**
 * Split a single paragraph into sentences at safe boundaries.
 */
function splitSentences(text: string): string[] {
  // Split on sentence-ending punctuation followed by space
  const parts = text.split(/(?<=[.!?])\s+/);
  return parts.filter(Boolean);
}

/**
 * Find the best split point near `target` within `text`,
 * preferring sentence boundaries over arbitrary positions.
 */
function findSplitPoint(text: string, target: number, preserveClauses: boolean): number {
  // Look within a window around the target
  const windowSize = Math.min(100, Math.floor(target * 0.2));
  const searchStart = Math.max(0, target - windowSize);
  const searchEnd = Math.min(text.length, target + windowSize);
  const region = text.slice(searchStart, searchEnd);

  // Prefer splitting at paragraph break
  const paraBreak = region.lastIndexOf('\n\n');
  if (paraBreak !== -1) {
    const pos = searchStart + paraBreak + 2;
    if (!preserveClauses || !isInsideClauseRef(text, pos)) return pos;
  }

  // Next: sentence boundary
  const sentenceEnd = region.search(/[.!?]\s/);
  if (sentenceEnd !== -1) {
    const pos = searchStart + sentenceEnd + 2;
    if (!preserveClauses || !isInsideClauseRef(text, pos)) return pos;
  }

  // Next: any whitespace
  const space = region.lastIndexOf(' ');
  if (space !== -1) {
    const pos = searchStart + space + 1;
    if (!preserveClauses || !isInsideClauseRef(text, pos)) return pos;
  }

  return target;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 5 — Public API
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Chunk text into RAG-ready segments.
 *
 * Algorithm:
 *  1. Split into paragraphs
 *  2. Accumulate paragraphs until maxTokens threshold
 *  3. When threshold reached, find best split point
 *  4. Apply overlap by pulling back from previous chunk
 *  5. Attach clause references and section metadata
 */
export function chunkText(text: string, opts?: ChunkOptions): Chunk[] {
  if (!text || !text.trim()) return [];

  const maxTokens = opts?.maxTokens ?? DEFAULT_MAX_TOKENS;
  const overlap = opts?.overlap ?? DEFAULT_OVERLAP;
  const respectParagraphs = opts?.respectParagraphs ?? true;
  const preserveClauseRefs = opts?.preserveClauseRefs ?? true;

  const totalTokens = estimateTokens(text);

  // Short text: single chunk
  if (totalTokens <= maxTokens) {
    return [{
      text: text.trim(),
      index: 0,
      tokenCount: totalTokens,
      metadata: {
        clauseRefs: preserveClauseRefs ? extractClauseRefs(text) : undefined,
      },
    }];
  }

  const chunks: Chunk[] = [];
  let currentSection: string | undefined;

  if (respectParagraphs) {
    // Paragraph-aware chunking
    const paragraphs = splitParagraphs(text);
    let buffer = '';
    let bufferTokens = 0;

    for (const para of paragraphs) {
      // Track section headings
      if (detectHeading(para)) {
        currentSection = para;
      }

      const paraTokens = estimateTokens(para);

      // Single paragraph exceeds max: split it into sentences
      if (paraTokens > maxTokens) {
        // Flush buffer first
        if (buffer.trim()) {
          chunks.push(createChunk(buffer.trim(), chunks.length, preserveClauseRefs, currentSection));
          buffer = getOverlapText(buffer, overlap);
          bufferTokens = estimateTokens(buffer);
        }

        const sentences = splitSentences(para);
        for (const sentence of sentences) {
          const sentTokens = estimateTokens(sentence);
          if (bufferTokens + sentTokens > maxTokens && buffer.trim()) {
            chunks.push(createChunk(buffer.trim(), chunks.length, preserveClauseRefs, currentSection));
            buffer = getOverlapText(buffer, overlap);
            bufferTokens = estimateTokens(buffer);
          }
          buffer += (buffer ? ' ' : '') + sentence;
          bufferTokens += sentTokens;
        }
        continue;
      }

      // Would adding this paragraph exceed the limit?
      if (bufferTokens + paraTokens > maxTokens && buffer.trim()) {
        chunks.push(createChunk(buffer.trim(), chunks.length, preserveClauseRefs, currentSection));
        buffer = getOverlapText(buffer, overlap);
        bufferTokens = estimateTokens(buffer);
      }

      buffer += (buffer ? '\n\n' : '') + para;
      bufferTokens += paraTokens;
    }

    // Flush remaining
    if (buffer.trim()) {
      chunks.push(createChunk(buffer.trim(), chunks.length, preserveClauseRefs, currentSection));
    }
  } else {
    // Simple sliding window
    let position = 0;
    while (position < text.length) {
      // Estimate where maxTokens would end
      const approxChars = maxTokens * 4; // rough chars-per-token
      let endPos = Math.min(position + approxChars, text.length);

      if (endPos < text.length) {
        endPos = findSplitPoint(text, endPos, preserveClauseRefs);
      }

      const chunkText = text.slice(position, endPos).trim();
      if (chunkText) {
        chunks.push(createChunk(chunkText, chunks.length, preserveClauseRefs));
      }

      // Move forward, subtracting overlap
      const overlapChars = overlap * 4;
      position = endPos - overlapChars;
      if (position <= (chunks.length > 0 ? endPos - approxChars : 0)) {
        position = endPos; // Prevent infinite loop
      }
    }
  }

  return chunks;
}

/**
 * Create a Chunk object with token count and metadata.
 */
function createChunk(
  text: string,
  index: number,
  preserveClauseRefs: boolean,
  sectionTitle?: string,
): Chunk {
  return {
    text,
    index,
    tokenCount: estimateTokens(text),
    metadata: {
      clauseRefs: preserveClauseRefs ? extractClauseRefs(text) : undefined,
      sectionTitle,
    },
  };
}

/**
 * Extract the last N tokens worth of text for overlap.
 */
function getOverlapText(text: string, overlapTokens: number): string {
  if (overlapTokens <= 0) return '';
  const approxChars = overlapTokens * 4;
  if (text.length <= approxChars) return text;

  const tail = text.slice(-approxChars);
  // Start at word boundary
  const firstSpace = tail.indexOf(' ');
  return firstSpace > 0 ? tail.slice(firstSpace + 1) : tail;
}
