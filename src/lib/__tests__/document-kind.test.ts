/**
 * 분석기 선택 회귀 가드.
 *
 * 이 규칙이 무너지면 도면이 조용히 이미지 AI 경로로 새어 나가고, 그 경로는
 * setAnalysis(null) 을 하므로 사용자는 "아무 일도 안 일어남"만 본다. 실제로
 * CI(Linux)에서 그렇게 됐고 Windows 로컬에서는 재현되지 않아 오래 숨어 있었다.
 *
 * 여기서 MIME 을 문자열로 직접 주는 이유가 핵심이다 — OS 의 MIME 데이터베이스에
 * 의존하지 않으므로 Windows 에서도 Linux 의 실패 조건을 그대로 재현한다.
 */

import {
  BINARY_DXF_GUIDANCE,
  DWG_GUIDANCE,
  UNREADABLE_DXF_GUIDANCE,
  documentKindOf,
  isBinaryDxf,
  isDwgBinary,
  looksLikeDxfText,
} from '../document-kind';

describe('documentKindOf — 확장자가 MIME 을 이긴다', () => {
  it('Linux 가 붙이는 image/vnd.dxf 에 속지 않는다 (실측 회귀)', () => {
    expect(documentKindOf({ name: 'L1-01-basic-radial.dxf', type: 'image/vnd.dxf' })).toBe('dxf');
  });

  it('MIME 이 비어 있는 Windows 경로도 같은 답을 낸다', () => {
    expect(documentKindOf({ name: 'L1-01-basic-radial.dxf', type: '' })).toBe('dxf');
  });

  it('대문자 확장자도 DXF 다', () => {
    expect(documentKindOf({ name: 'DRAWING.DXF', type: 'image/x-dxf' })).toBe('dxf');
  });

  it('PDF 는 MIME 이 무엇이든 PDF 파서로 간다', () => {
    expect(documentKindOf({ name: 'panel.pdf', type: 'application/pdf' })).toBe('pdf');
    expect(documentKindOf({ name: 'panel.pdf', type: '' })).toBe('pdf');
  });

  it('진짜 이미지는 그대로 이미지 경로다 (수리가 이미지 업로드를 깨지 않는다)', () => {
    expect(documentKindOf({ name: 'photo.jpg', type: 'image/jpeg' })).toBe('image');
    expect(documentKindOf({ name: 'scan.png', type: 'image/png' })).toBe('image');
    expect(documentKindOf({ name: 'shot.webp', type: 'image/webp' })).toBe('image');
  });

  it('셋 중 어느 것도 아니면 null — 조용히 이미지로 넘기지 않는다', () => {
    expect(documentKindOf({ name: 'notes.txt', type: 'text/plain' })).toBeNull();
    expect(documentKindOf({ name: 'archive.zip', type: 'application/zip' })).toBeNull();
    expect(documentKindOf({ name: 'noextension', type: '' })).toBeNull();
  });
});

/**
 * DWG(ZWCAD·AutoCAD·CADian 원본 형식) 인식.
 *
 * 파싱하지 않는 형식을 **인식**하는 이유: accept 에서 걸러 버리면 사용자는
 * 「미지원」으로 읽고, 받아서 DXF 저장 안내를 주면 10초짜리 우회로가 된다.
 * 안내 문구는 DWG_GUIDANCE 한 곳이 정본이다 — 화면과 API 가 같은 문장을 쓴다.
 */
describe('DWG 인식', () => {
  it('.dwg 확장자는 dwg 로 분류된다 — MIME 이 무엇이든', () => {
    expect(documentKindOf({ name: 'plant.dwg', type: '' })).toBe('dwg');
    expect(documentKindOf({ name: 'PLANT.DWG', type: 'application/acad' })).toBe('dwg');
    expect(documentKindOf({ name: 'plant.dwg', type: 'image/vnd.dwg' })).toBe('dwg');
  });

  it('안내 문구에 해결 절차(DXF 저장)와 대상 CAD 가 들어 있다', () => {
    expect(DWG_GUIDANCE).toContain('DXF');
    expect(DWG_GUIDANCE).toContain('ZWCAD');
    expect(DWG_GUIDANCE).toContain('다른 이름으로 저장');
  });
});

/**
 * 이름만 .dxf 로 바꾼 DWG 를 내용으로 잡는 층.
 * DWG 머리 6바이트는 버전 표식 `AC1nnn` — AC1006(구형)부터 AC1032(2018+,
 * 현행 ZWCAD 포함)까지 전부 이 꼴이다. DXF 텍스트와 겹치지 않는다.
 */
describe('isDwgBinary — 내용 표식', () => {
  const ascii = (s: string) => new Uint8Array([...s].map((c) => c.charCodeAt(0)));

  it('실존 DWG 버전 표식을 전부 잡는다', () => {
    for (const v of ['AC1006', 'AC1009', 'AC1015', 'AC1018', 'AC1021', 'AC1024', 'AC1027', 'AC1032']) {
      expect(isDwgBinary(ascii(v))).toBe(true);
    }
  });

  it('DXF 텍스트·이미지 머리는 잡지 않는다 — 오탐이 나면 정상 도면이 차단된다', () => {
    expect(isDwgBinary(ascii('0\r\nSEC'))).toBe(false); // DXF 첫머리
    expect(isDwgBinary(ascii('  0\r\nS'))).toBe(false); // 들여쓴 DXF
    expect(isDwgBinary(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]))).toBe(false); // PNG
    expect(isDwgBinary(ascii('%PDF-1'))).toBe(false); // PDF
    expect(isDwgBinary(ascii('AC10'))).toBe(false); // 6바이트 미만
    expect(isDwgBinary(ascii('ACADXX'))).toBe(false); // 비슷하지만 아님
  });
});

/**
 * 판독 가능성 표식 — 「인식 못 함」의 실제 세 원인을 각각 가른다.
 * 실사용 배경: 회사가 AutoCAD→ZWCAD 전환 + 사내 DRM 환경에서 업로드 실패
 * 보고(2026-08-10). 원인 미상 오류·조용한 빈 결과는 사용자가 못 고친다.
 */
describe('isBinaryDxf — 바이너리 DXF 표식', () => {
  const ascii = (s: string) => new Uint8Array([...s].map((c) => c.charCodeAt(0)));

  it('표준 22바이트 표식을 잡는다', () => {
    expect(isBinaryDxf(ascii('AutoCAD Binary DXF\r\n' + String.fromCharCode(0x1a) + String.fromCharCode(0)))).toBe(true);
  });

  it('ASCII DXF·DWG·짧은 머리는 잡지 않는다', () => {
    expect(isBinaryDxf(ascii('0\r\nSECTION\r\n2\r\nENTITIES'))).toBe(false);
    expect(isBinaryDxf(ascii('AC1032' + ' '.repeat(20)))).toBe(false);
    expect(isBinaryDxf(ascii('AutoCAD'))).toBe(false);
  });

  it('안내가 해결 절차(ASCII DXF 재저장)를 담는다', () => {
    expect(BINARY_DXF_GUIDANCE).toContain('ASCII DXF');
  });
});

describe('looksLikeDxfText — DRM/암호문 판별', () => {
  it('정상 DXF 머리는 통과한다 — 최소 구성도, 그룹코드만 보여도', () => {
    expect(looksLikeDxfText('0\r\nSECTION\r\n2\r\nENTITIES')).toBe(true);
    expect(looksLikeDxfText('  0\nLINE\n  8\nSYMBOL\n 10\n100.0')).toBe(true);
  });

  it('암호문·무작위 바이너리는 걸린다 — DRM 파일의 실제 모습', () => {
    const drm = Array.from({ length: 256 }, (_, i) => String.fromCharCode((i * 37 + 11) % 256)).join('');
    expect(looksLikeDxfText(drm)).toBe(false);
    expect(looksLikeDxfText('FSD1' + String.fromCharCode(2, 159, 234) + ' encrypted payload')).toBe(false);
  });

  it('안내가 원인 후보(DRM)와 해결 절차를 담는다', () => {
    expect(UNREADABLE_DXF_GUIDANCE).toContain('DRM');
    expect(UNREADABLE_DXF_GUIDANCE).toContain('보안 해제');
  });
});
