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

import { documentKindOf } from '../document-kind';

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
