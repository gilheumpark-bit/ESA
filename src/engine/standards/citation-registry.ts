/**
 * 인용 원문 경로 — 조항 번호를 들고 어디로 가야 하는지.
 *
 * 이 저장소는 기준서 원문 문장을 담지 않는다. KEC 를 빼면 대부분이 유료·저작권
 * 표준이고, 담을 수 있다 해도 판본이 계속 바뀌기 때문이다. 그래서 제품이
 * 내보내는 근거는 사실상 **조항 번호 하나**다.
 *
 * 번호만 던지고 끝내면 사용자는 그것을 확인할 방법이 없다 — 확인할 수 없는
 * 근거는 근거가 아니라 권위의 외양이다. 이 모듈은 번호 옆에 «어디서 원문을
 * 보는가» 를 붙인다.
 *
 * 조항 단위 딥링크가 아니라 **발행기관 단위**다. 유료 표준은 조항별 공개 URL
 * 이 존재하지 않으며, 있는 척하는 링크를 만드는 것보다 어디서 사면 되는지를
 * 정확히 알려주는 편이 실무자에게 쓸모 있다.
 *
 * 조항 번호가 실재하는지의 판정은 여기 있지 않다 — KEC 는 공표 전문에서
 * 생성한 `standards/kec/clause-index.ts` 가, 나머지는 아직 오라클이 없다.
 *
 * 이 모듈은 어떤 모듈도 import 하지 않는다(leaf). `sjc/types` 가 이걸 참조하고
 * `standards/types` 가 `sjc/types` 를 참조하므로, 여기서 되짚어 import 하면
 * 순환이 생긴다.
 */

export type StandardAccess = 'free' | 'paid';

export interface StandardOrigin {
  /** 발행기관 */
  publisher: string;
  /** 원문을 확보·확인할 수 있는 경로 */
  url: string;
  /** 원문 열람 조건 — paid 는 구매·구독이 필요하다 */
  access: StandardAccess;
}

/** 발행기관별 원문 경로. */
export const STANDARD_ORIGINS: Readonly<Record<string, StandardOrigin>> = {
  KEC: { publisher: '산업통상자원부 (한국전기설비규정 공고)', url: 'https://www.motie.go.kr', access: 'free' },
  NEC: { publisher: 'NFPA', url: 'https://www.nfpa.org/codes-and-standards', access: 'paid' },
  NFPA: { publisher: 'NFPA', url: 'https://www.nfpa.org/codes-and-standards', access: 'paid' },
  IEC: { publisher: 'IEC', url: 'https://webstore.iec.ch', access: 'paid' },
  JIS: { publisher: 'JISC', url: 'https://www.jisc.go.jp', access: 'free' },
  KS: { publisher: '국가표준인증통합정보시스템', url: 'https://standard.go.kr', access: 'free' },
  IEEE: { publisher: 'IEEE SA', url: 'https://standards.ieee.org', access: 'paid' },
  ASTM: { publisher: 'ASTM International', url: 'https://www.astm.org', access: 'paid' },
  ASME: { publisher: 'ASME', url: 'https://www.asme.org', access: 'paid' },
  ASHRAE: { publisher: 'ASHRAE', url: 'https://www.ashrae.org', access: 'paid' },
  ISO: { publisher: 'ISO', url: 'https://www.iso.org', access: 'paid' },
  NFSC: { publisher: '국가법령정보센터 (국가화재안전기준)', url: 'https://www.law.go.kr', access: 'free' },
  KEPCO: { publisher: '한국전력공사', url: 'https://home.kepco.co.kr', access: 'free' },
};

/** 발행기관의 원문 경로를 돌려준다. 미등록 기관이면 undefined. */
export function citationOrigin(standard: string): StandardOrigin | undefined {
  return STANDARD_ORIGINS[standard];
}
