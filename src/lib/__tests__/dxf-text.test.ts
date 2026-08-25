import { decodeDxfText } from '../dxf-text';

function ascii(value: string): Uint8Array {
  return Uint8Array.from([...value].map((character) => character.charCodeAt(0)));
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const length = parts.reduce((total, part) => total + part.byteLength, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.byteLength;
  }
  return output;
}

describe('decodeDxfText - AutoCAD/ZWCAD ASCII DXF text boundary', () => {
  it('decodes a ZWCAD Korean ANSI_949 drawing without corrupting labels', () => {
    const bytes = concat(
      ascii('0\r\nSECTION\r\n2\r\nHEADER\r\n9\r\n$DWGCODEPAGE\r\n3\r\nANSI_949\r\n0\r\nENDSEC\r\n'),
      ascii('0\r\nSECTION\r\n2\r\nENTITIES\r\n0\r\nTEXT\r\n1\r\n'),
      // "변압기" encoded as Windows CP949, the common Korean CAD code page.
      Uint8Array.from([0xba, 0xaf, 0xbe, 0xd0, 0xb1, 0xe2]),
      ascii('\r\n0\r\nENDSEC\r\n0\r\nEOF\r\n'),
    );

    const decoded = decodeDxfText(bytes);

    expect(decoded.text).toContain('변압기');
    expect(decoded.encoding).toBe('euc-kr');
    expect(decoded.declaredCodePage).toBe('ANSI_949');
  });

  it('keeps UTF-8 DXF text intact when no legacy code page is declared', () => {
    const bytes = new TextEncoder().encode('0\nSECTION\n2\nENTITIES\n0\nTEXT\n1\nVCB 변압기\n0\nENDSEC\n0\nEOF\n');

    const decoded = decodeDxfText(bytes);

    expect(decoded.text).toContain('VCB 변압기');
    expect(decoded.encoding).toBe('utf-8');
    expect(decoded.declaredCodePage).toBeNull();
  });

  it('fails closed for a declared code page that the app cannot decode', () => {
    const bytes = ascii('0\nSECTION\n2\nHEADER\n9\n$DWGCODEPAGE\n3\nANSI_9999\n0\nENDSEC\n0\nEOF\n');

    expect(() => decodeDxfText(bytes)).toThrow('DXF_TEXT_ENCODING_UNSUPPORTED');
  });

  it('does not silently replace invalid UTF-8 when no code page is declared', () => {
    const bytes = concat(
      ascii('0\nSECTION\n2\nENTITIES\n0\nTEXT\n1\n'),
      Uint8Array.from([0xff, 0xfe, 0xfd]),
      ascii('\n0\nENDSEC\n0\nEOF\n'),
    );

    expect(() => decodeDxfText(bytes)).toThrow('DXF_TEXT_DECODE_FAILED');
  });
});
