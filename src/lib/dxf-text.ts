/**
 * AutoCAD/ZWCAD/CADian ASCII DXF byte decoder.
 *
 * DXF is an ASCII container, but text values can follow the code page declared
 * in `$DWGCODEPAGE`. `File.text()` and a bare `TextDecoder()` always assume
 * UTF-8, so Korean `ANSI_949` drawings keep their geometry while labels become
 * replacement characters. The parser then appears to work but loses device
 * names and specifications. Decode once at the input boundary and share the
 * exact rule between the quick route and the full-document teams.
 */

const HEADER_SCAN_BYTES = 64 * 1024;

const DXF_CODE_PAGE_TO_ENCODING: Readonly<Record<string, string>> = {
  ANSI_874: 'windows-874',
  ANSI_932: 'shift_jis',
  ANSI_936: 'gbk',
  ANSI_949: 'euc-kr',
  ANSI_950: 'big5',
  ANSI_1250: 'windows-1250',
  ANSI_1251: 'windows-1251',
  ANSI_1252: 'windows-1252',
  ANSI_1253: 'windows-1253',
  ANSI_1254: 'windows-1254',
  ANSI_1255: 'windows-1255',
  ANSI_1256: 'windows-1256',
  ANSI_1257: 'windows-1257',
  ANSI_1258: 'windows-1258',
  UTF8: 'utf-8',
  'UTF-8': 'utf-8',
};

export const DXF_TEXT_ENCODING_GUIDANCE =
  'DXF 문자 인코딩을 읽을 수 없습니다. ZWCAD/AutoCAD에서 ASCII DXF로 저장할 때 '
  + 'UTF-8 또는 한국어 ANSI_949 코드페이지를 사용했는지 확인해 주세요.';

export interface DecodedDxfText {
  text: string;
  encoding: string;
  declaredCodePage: string | null;
}

function asBytes(input: ArrayBuffer | Uint8Array): Uint8Array {
  return input instanceof Uint8Array ? input : new Uint8Array(input);
}

function declaredCodePage(bytes: Uint8Array): string | null {
  // DXF control tokens and `$DWGCODEPAGE` values are ASCII even when entity
  // text uses a legacy encoding. Latin-1 preserves those bytes one-to-one.
  const header = new TextDecoder('windows-1252').decode(bytes.subarray(0, HEADER_SCAN_BYTES));
  const match = header.match(/\$DWGCODEPAGE\s*\r?\n\s*3\s*\r?\n\s*([A-Za-z0-9_-]+)/i);
  return match?.[1]?.toUpperCase() ?? null;
}

function hasUtf8Bom(bytes: Uint8Array): boolean {
  return bytes.byteLength >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
}

export function decodeDxfText(input: ArrayBuffer | Uint8Array): DecodedDxfText {
  const bytes = asBytes(input);
  const codePage = declaredCodePage(bytes);
  const encoding = hasUtf8Bom(bytes)
    ? 'utf-8'
    : codePage
      ? DXF_CODE_PAGE_TO_ENCODING[codePage]
      : 'utf-8';

  if (!encoding) throw new Error('DXF_TEXT_ENCODING_UNSUPPORTED');

  try {
    return {
      text: new TextDecoder(encoding, { fatal: true }).decode(bytes),
      encoding,
      declaredCodePage: codePage,
    };
  } catch {
    throw new Error('DXF_TEXT_DECODE_FAILED');
  }
}

// IDENTITY_SEAL: lib/dxf-text | role=CAD ASCII DXF codepage-aware decoding | inputs=DXF bytes | outputs=text,encoding,declaredCodePage
