import { NextRequest } from 'next/server';

import { parseDxfToSLD } from '@/engine/topology/dxf-parser';
import { POST } from '../route';

jest.mock('@/lib/rate-limit', () => ({
  applyRateLimit: jest.fn(() => null),
  getClientIp: jest.fn(() => 'test-client'),
  checkRateLimit: jest.fn(() => ({ allowed: true, remaining: 1 })),
}));
jest.mock('@/lib/request-origin', () => ({ isRequestOriginAllowed: jest.fn(() => true) }));
jest.mock('@/lib/feature-flags', () => ({ isFeatureEnabled: jest.fn(() => true) }));
jest.mock('@/lib/api-logger', () => ({
  apiLog: jest.fn(),
  createRequestTimer: jest.fn(() => ({ elapsed: () => 1 })),
}));
jest.mock('@/engine/topology/dxf-parser', () => ({ parseDxfToSLD: jest.fn() }));
jest.mock('@/engine/topology', () => ({
  buildTopologyFromSLD: jest.fn(() => ({
    validate: () => ({
      valid: true,
      issues: [],
      stats: { nodeCount: 2, edgeCount: 1, connectedComponents: 1, isolatedNodes: [] },
    }),
  })),
}));
jest.mock('@/lib/sld-recognition', () => ({ generateCalcChainFromSLD: jest.fn(() => []) }));
jest.mock('@/engine/review/circuit-review', () => ({ reviewAnalysis: jest.fn(() => ({ issues: [] })) }));

function ascii(value: string): ArrayBuffer {
  return Uint8Array.from([...value].map((character) => character.charCodeAt(0))).buffer;
}

function requestWith(file: File): NextRequest {
  const form = new FormData();
  form.set('file', file);
  return new NextRequest('http://localhost:3000/api/dxf', {
    method: 'POST',
    headers: { origin: 'http://localhost:3000', host: 'localhost:3000' },
    body: form,
  });
}

describe('POST /api/dxf - ZWCAD compatibility', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(parseDxfToSLD).mockReturnValue({
      components: [],
      connections: [],
      suggestedCalculations: [],
      confidence: 0.95,
      rawDescription: 'ZWCAD vector parse',
    });
  });

  it('decodes ANSI_949 before handing a ZWCAD DXF to the ESA parser', async () => {
    const file = new File([
      ascii('0\r\nSECTION\r\n2\r\nHEADER\r\n9\r\n$DWGCODEPAGE\r\n3\r\nANSI_949\r\n0\r\nENDSEC\r\n0\r\nSECTION\r\n2\r\nENTITIES\r\n0\r\nTEXT\r\n1\r\n'),
      Uint8Array.from([0xba, 0xaf, 0xbe, 0xd0, 0xb1, 0xe2]).buffer, // 변압기 in CP949
      ascii('\r\n0\r\nENDSEC\r\n0\r\nEOF\r\n'),
    ], 'zwcad-korean.dxf', { type: 'application/octet-stream' });

    const response = await POST(requestWith(file));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.parserInfo).toEqual(expect.objectContaining({
      inputEncoding: 'euc-kr',
      declaredCodePage: 'ANSI_949',
    }));
    expect(parseDxfToSLD).toHaveBeenCalledWith(
      expect.stringContaining('변압기'),
      expect.any(Object),
    );
  });
});
