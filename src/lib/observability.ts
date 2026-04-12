/**
 * OpenTelemetry-lite Tracing
 *
 * Lightweight request tracing without the full OpenTelemetry SDK.
 * Produces structured JSON logs with timing trees per request.
 *
 * PART 1: Types
 * PART 2: Span / Trace implementation
 * PART 3: Request tracer factory
 * PART 4: Rolling-window stats
 */

import { log } from './logger';

// ---------------------------------------------------------------------------
// PART 1 — Types
// ---------------------------------------------------------------------------

export type SpanStatus = 'OK' | 'ERROR' | 'UNSET';

export interface Span {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  status: SpanStatus;
  attributes: Record<string, string | number | boolean>;
  children: Span[];
}

export interface TraceLog {
  traceId: string;
  rootSpan: string;
  totalDurationMs: number;
  spanCount: number;
  tree: Span;
}

/** Performance mark categories tracked for stats */
export type PerfCategory = 'search' | 'calculate' | 'agent' | 'rag' | 'embedding';

export interface TraceStats {
  avgSearchMs: number;
  avgCalcMs: number;
  avgAgentMs: number;
  p95SearchMs: number;
  p95CalcMs: number;
}

// ---------------------------------------------------------------------------
// PART 2 — Span / Trace Implementation
// ---------------------------------------------------------------------------

let idCounter = 0;

function generateId(): string {
  idCounter = (idCounter + 1) % 0x7fffffff;
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${ts}-${rand}-${idCounter.toString(36)}`;
}

function createSpan(name: string, traceId: string, parentSpanId?: string): Span {
  return {
    traceId,
    spanId: generateId(),
    parentSpanId,
    name,
    startTime: performance.now(),
    status: 'UNSET',
    attributes: {},
    children: [],
  };
}

export class Trace {
  readonly traceId: string;
  private root: Span;
  private active: Span;

  constructor(name: string) {
    this.traceId = generateId();
    this.root = createSpan(name, this.traceId);
    this.active = this.root;
  }

  /** Wrap an async function in a child span. Auto-records duration and error. */
  async span<T>(name: string, fn: () => Promise<T>): Promise<T> {
    const child = createSpan(name, this.traceId, this.active.spanId);
    this.active.children.push(child);

    const previousActive = this.active;
    this.active = child;

    try {
      const result = await fn();
      child.status = 'OK';
      return result;
    } catch (err) {
      child.status = 'ERROR';
      child.attributes['error'] = err instanceof Error ? err.message : String(err);
      throw err;
    } finally {
      child.endTime = performance.now();
      child.duration = child.endTime - child.startTime;

      // 카테고리별 성능 기록
      const cat = inferCategory(name);
      if (cat) {
        recordLatency(cat, child.duration);
      }

      this.active = previousActive;
    }
  }

  /** Set an attribute on the root span */
  setAttribute(key: string, value: string | number | boolean): void {
    this.root.attributes[key] = value;
  }

  /** Finalize trace and emit structured log */
  end(): TraceLog {
    this.root.endTime = performance.now();
    this.root.duration = this.root.endTime - this.root.startTime;
    this.root.status = this.root.status === 'UNSET' ? 'OK' : this.root.status;

    const traceLog: TraceLog = {
      traceId: this.traceId,
      rootSpan: this.root.name,
      totalDurationMs: Math.round(this.root.duration * 100) / 100,
      spanCount: countSpans(this.root),
      tree: this.root,
    };

    log.info('trace', `[${traceLog.rootSpan}] ${traceLog.totalDurationMs}ms (${traceLog.spanCount} spans)`, traceLog);
    return traceLog;
  }

  /** Get the root span (for inspection in tests) */
  getRoot(): Readonly<Span> {
    return this.root;
  }
}

function countSpans(span: Span): number {
  return 1 + span.children.reduce((acc, c) => acc + countSpans(c), 0);
}

// ---------------------------------------------------------------------------
// PART 3 — Request Tracer Factory
// ---------------------------------------------------------------------------

/**
 * Auto-create a trace from an incoming request.
 * Extracts method, URL, and any x-trace-id header for correlation.
 */
export function startTrace(name: string): Trace {
  return new Trace(name);
}

export function requestTracer(request: Request): Trace {
  const url = new URL(request.url);
  const trace = new Trace(`${request.method} ${url.pathname}`);

  trace.setAttribute('http.method', request.method);
  trace.setAttribute('http.url', url.pathname);

  const externalTraceId = request.headers.get('x-trace-id');
  if (externalTraceId) {
    trace.setAttribute('external.traceId', externalTraceId);
  }

  return trace;
}

// ---------------------------------------------------------------------------
// PART 4 — Rolling-Window Stats
// ---------------------------------------------------------------------------

const WINDOW_SIZE = 200;

const latencyWindows: Record<PerfCategory, number[]> = {
  search: [],
  calculate: [],
  agent: [],
  rag: [],
  embedding: [],
};

function inferCategory(spanName: string): PerfCategory | null {
  const lower = spanName.toLowerCase();
  if (lower.includes('search') || lower.includes('bm25') || lower.includes('hybrid')) return 'search';
  if (lower.includes('calc') || lower.includes('compute') || lower.includes('formula')) return 'calculate';
  if (lower.includes('agent') || lower.includes('sandbox') || lower.includes('bridge')) return 'agent';
  if (lower.includes('rag') || lower.includes('retrieve') || lower.includes('chunk')) return 'rag';
  if (lower.includes('embed') || lower.includes('vector')) return 'embedding';
  return null;
}

function recordLatency(category: PerfCategory, ms: number): void {
  const window = latencyWindows[category];
  window.push(ms);
  if (window.length > WINDOW_SIZE) {
    window.shift();
  }
}

function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function avg(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

/**
 * Get rolling-window performance stats across tracked categories.
 */
export function getTraceStats(): TraceStats {
  return {
    avgSearchMs: Math.round(avg(latencyWindows.search) * 100) / 100,
    avgCalcMs: Math.round(avg(latencyWindows.calculate) * 100) / 100,
    avgAgentMs: Math.round(avg(latencyWindows.agent) * 100) / 100,
    p95SearchMs: Math.round(percentile(latencyWindows.search, 95) * 100) / 100,
    p95CalcMs: Math.round(percentile(latencyWindows.calculate, 95) * 100) / 100,
  };
}

/**
 * Reset all latency windows. Useful for testing.
 */
export function resetTraceStats(): void {
  for (const key of Object.keys(latencyWindows) as PerfCategory[]) {
    latencyWindows[key] = [];
  }
}
