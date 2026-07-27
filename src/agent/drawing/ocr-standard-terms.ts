import { EXPANDED_SYMBOL_DB } from '../vision/symbol-db';

/**
 * 스캔 도면에서 OCR 판독을 확정시킬 수 있는 어휘.
 *
 * `adjudicateOcr` 은 이 목록(또는 그 도면의 범례)에 든 말만
 * `CONFIRMED_BY_MAJORITY_AND_CONTEXT` 로 올린다. 확정되지 못한 텍스트는
 * 단순히 신뢰도가 낮은 게 아니다 — `cross-page-graph` 가 통째로 건너뛰고,
 * 집계에서 빠지고, `AMBIGUOUS_OCR` 홀드가 붙는다. **목록에 없는 말은
 * 스캔 도면에서 읽히지 않은 것과 같다.**
 *
 * 예전에는 오케스트레이터 안에 열 개가 손으로 박혀 있었다
 * (`PT PPT VCB VGB TR ACB MCCB CT ATS UPS`). 이 앱이 상대하는 154kV·22.9kV
 * 수배전 도면의 주역들이 전부 빠져 있었다 — GCB·MOF·ZCT·GPT·LA·LBS·COS·
 * OCB·ASS·PF. 154kV 도면을 스캔으로 넣으면 주차단기 라벨조차 확정이 안 됐다
 * (2026-07-28 실측).
 *
 * 그래서 손으로 적지 않고 symbol-db 에서 뽑는다. 새 기호를 등록하면 어휘도
 * 함께 늘어난다 — 두 벌을 손으로 맞추다 갈린 게 이 결함이었다.
 *
 * 벡터 PDF 는 텍스트를 직접 뽑아 이 경로를 우회한다(`directVectorText`).
 * 이 목록이 도는 곳은 스캔·사진 도면이다.
 */

/** 도면에 찍히는 약어 모양 — 대문자·숫자 2~6 자. `기중차단기` 같은 설명은 뺀다. */
const ABBREVIATION = /^[A-Z0-9]{2,6}$/;

/**
 * symbol-db 에 없지만 어휘에는 있어야 하는 것.
 *
 * 둘 다 `ocr-adjudicator` 의 `CONFUSABLES` 짝이다 — PT↔PPT, VCB↔VGB.
 * 혼동 짝을 후보로 들고 있으려면 어휘에도 있어야 한다.
 */
const CONFUSABLE_COUNTERPARTS = ['PPT', 'VGB'];

export const OCR_STANDARD_TERMS: string[] = [...new Set([
  ...EXPANDED_SYMBOL_DB.flatMap((entry) => entry.aliases).filter((alias) => ABBREVIATION.test(alias)),
  ...CONFUSABLE_COUNTERPARTS,
])].sort();
