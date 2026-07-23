export interface SseLineSplit {
  lines: string[];
  remainder: string;
}

/**
 * Split only complete SSE lines. Fetch stream chunks are arbitrary byte
 * boundaries, so a JSON event must be retained until its newline arrives.
 */
export function splitCompleteSseLines(
  remainder: string,
  chunk: string,
): SseLineSplit {
  const normalized = `${remainder}${chunk}`.replace(/\r\n/g, '\n');
  const parts = normalized.split('\n');

  return {
    lines: parts.slice(0, -1),
    remainder: parts.at(-1) ?? '',
  };
}
