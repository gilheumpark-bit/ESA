/**
 * Standard ESVA HTTP response metadata (Vertical AI: traceability).
 */
import { NextResponse } from 'next/server';
import { ENGINE_VERSION } from '@engine/receipt';
import { ESVA_AGENT_VERSION, ESVA_API_VERSION } from '@/lib/esa-config';

export const HEADER_API_VERSION = 'X-ESA-API-Version';
export const HEADER_ENGINE_VERSION = 'X-ESA-Engine-Version';
export const HEADER_AGENT_VERSION = 'X-ESA-Agent-Version';

export type EsaHeadersInit = Record<string, string>;

export function esaResponseHeaders(extra?: EsaHeadersInit): EsaHeadersInit {
  return {
    [HEADER_API_VERSION]: ESVA_API_VERSION,
    [HEADER_ENGINE_VERSION]: ENGINE_VERSION,
    [HEADER_AGENT_VERSION]: ESVA_AGENT_VERSION,
    ...extra,
  };
}

/** JSON response with standard ESVA version headers (merge with route-specific headers). */
export function jsonWithEsa<T>(
  body: T,
  init?: { status?: number; headers?: EsaHeadersInit },
): NextResponse {
  return NextResponse.json(body, {
    status: init?.status ?? 200,
    headers: esaResponseHeaders(init?.headers),
  });
}
