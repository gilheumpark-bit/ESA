import type { DocumentInventoryPage } from './types-v3';

/**
 * 페이지 한 장이 어떤 도면인지 훑는다.
 *
 * 실제로 결과가 있는 판정은 `empty` 하나다 — 오케스트레이터가 그 페이지를
 * `skipped-empty` 로 표시하고 분석 루프에서 건너뛴다. 나머지 분류는 페이지
 * 상태에 기록만 되고 아직 아무도 읽지 않는다(보고서·평가기 모두 미소비).
 * 그러니 여기서 조심할 것은 분류의 정교함이 아니라 **멀쩡한 페이지를
 * empty 로 몰지 않는 것**이다. 잘못 몰면 도면 한 장이 오류도 경고도 없이
 * 사라진다.
 *
 * 입력은 `drawing-source.ts` 가 만든다: 이미지는 rasterOpCount 1, DXF 는
 * vectorOpCount 1, PDF 는 연산자 목록에서 실제로 센 값이다.
 */
export function surveyPageKind(input: {
  textSample?: string;
  vectorOpCount?: number;
  rasterCoverage?: number;
}): DocumentInventoryPage['drawingKind'] {
  const text = (input.textSample ?? '').toUpperCase();
  if (!text.trim() && (input.vectorOpCount ?? 0) === 0 && (input.rasterCoverage ?? 0) < 0.05) {
    return 'empty';
  }
  if (/LEGEND|범례|SYMBOL/.test(text)) return 'legend';
  if (/TITLE|표제|DRAWING NO|도면번호/.test(text) && (input.vectorOpCount ?? 0) < 30) return 'title';
  if (/SEQUENCE|시퀀스|PLC/.test(text)) return 'sequence';
  if (/LAYOUT|평면도|FLOOR/.test(text)) return 'layout';
  if (/SLD|단선|SINGLE.?LINE|VCB|TR-|BUS/.test(text) || (input.vectorOpCount ?? 0) > 40) return 'sld';
  return 'unknown';
}
