import { decodeDxfText } from '@/lib/dxf-text';
import { parseDxfToSLD } from '../dxf-parser';
import { buildTopologyFromSLD } from '../topology-graph';

function ascii(value: string): Uint8Array {
  return Uint8Array.from([...value].map((character) => character.charCodeAt(0)));
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const output = new Uint8Array(parts.reduce((total, part) => total + part.byteLength, 0));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.byteLength;
  }
  return output;
}

describe('ZWCAD DXF compatibility - existing ESA vector analysis path', () => {
  it('keeps Korean text, symbols, and the electrical relationship in one analysis', () => {
    const prefix = [
      '0\r\nSECTION\r\n2\r\nHEADER\r\n',
      '9\r\n$ACADVER\r\n1\r\nAC1027\r\n',
      '9\r\n$DWGCODEPAGE\r\n3\r\nANSI_949\r\n',
      '9\r\n$INSUNITS\r\n70\r\n4\r\n',
      '0\r\nENDSEC\r\n',
      '0\r\nSECTION\r\n2\r\nENTITIES\r\n',
      '0\r\nINSERT\r\n8\r\nSYMBOL\r\n2\r\nTR-1\r\n10\r\n0\r\n20\r\n100\r\n30\r\n0\r\n',
      '0\r\nINSERT\r\n8\r\nSYMBOL\r\n2\r\nVCB-1\r\n10\r\n0\r\n20\r\n0\r\n30\r\n0\r\n',
      '0\r\nINSERT\r\n8\r\nSYMBOL\r\n2\r\nM-1\r\n10\r\n0\r\n20\r\n-100\r\n30\r\n0\r\n',
      '0\r\nLINE\r\n8\r\nWIRE\r\n10\r\n0\r\n20\r\n100\r\n30\r\n0\r\n11\r\n0\r\n21\r\n0\r\n31\r\n0\r\n',
      '0\r\nLINE\r\n8\r\nWIRE\r\n10\r\n0\r\n20\r\n0\r\n30\r\n0\r\n11\r\n0\r\n21\r\n-100\r\n31\r\n0\r\n',
      '0\r\nTEXT\r\n8\r\nTEXT\r\n10\r\n10\r\n20\r\n100\r\n30\r\n0\r\n40\r\n2.5\r\n1\r\n',
    ].join('');
    const suffix = [
      ' 500kVA\r\n',
      '0\r\nTEXT\r\n8\r\nTEXT\r\n10\r\n10\r\n20\r\n-100\r\n30\r\n0\r\n40\r\n2.5\r\n1\r\nM-1 5.5kW\r\n',
      '0\r\nENDSEC\r\n0\r\nEOF\r\n',
    ].join('');
    const zwcadBytes = concat(
      ascii(prefix),
      Uint8Array.from([0xba, 0xaf, 0xbe, 0xd0, 0xb1, 0xe2]), // 변압기 in CP949
      ascii(suffix),
    );

    const decoded = decodeDxfText(zwcadBytes);
    const analysis = parseDxfToSLD(decoded.text);

    expect(decoded.declaredCodePage).toBe('ANSI_949');
    expect(analysis.components.some((component) => component.type === 'transformer')).toBe(true);
    expect(analysis.components.some((component) => component.type === 'breaker')).toBe(true);
    expect(analysis.components.some((component) => component.type === 'motor')).toBe(true);
    expect(analysis.connections).toHaveLength(2);
    expect(analysis.sourceTexts?.some((entry) => entry.text.includes('변압기'))).toBe(true);
    expect(buildTopologyFromSLD(analysis).validate().valid).toBe(true);
  });
});
