import { describe, expect, test } from '@jest/globals';
import { isRequestOriginAllowed } from '../request-origin';

describe('request origin policy', () => {
  test('allows the exact origin serving the current request on any host or port', () => {
    expect(isRequestOriginAllowed(
      'http://127.0.0.1:3011',
      'http://127.0.0.1:3011/api/search',
    )).toBe(true);
    expect(isRequestOriginAllowed(
      'https://preview-123.example.test',
      'https://preview-123.example.test/api/search',
    )).toBe(true);
    // Next's production server can canonicalize request.url to localhost while
    // preserving the browser-facing Host header.
    expect(isRequestOriginAllowed(
      'http://127.0.0.1:3011',
      'http://localhost:3011/api/search',
      '',
      '127.0.0.1:3011',
    )).toBe(true);
  });

  test('rejects a different or malformed origin', () => {
    expect(isRequestOriginAllowed(
      'https://attacker.example',
      'https://esva.engineer/api/search',
    )).toBe(false);
    expect(isRequestOriginAllowed(
      'not-a-url',
      'https://esva.engineer/api/search',
    )).toBe(false);
  });

  test('allows only exact explicitly configured cross-origins', () => {
    expect(isRequestOriginAllowed(
      'https://trusted.example',
      'https://esva.engineer/api/search',
      'https://trusted.example,not-a-url',
    )).toBe(true);
    expect(isRequestOriginAllowed(
      'https://sub.trusted.example',
      'https://esva.engineer/api/search',
      'https://trusted.example',
    )).toBe(false);
  });

  test('keeps non-browser and server-to-server requests without Origin usable', () => {
    expect(isRequestOriginAllowed(null, 'https://esva.engineer/api/search')).toBe(true);
  });
});
