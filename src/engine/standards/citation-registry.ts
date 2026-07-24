// ============================================================
// Citation Registry — 인용 정본과 원문 경로
// ============================================================
// 이 저장소는 기준서 원문 문장을 담지 않는다. KEC를 제외한 대부분이
// 유료·저작권 표준이고, 담을 수 있다 해도 판본이 계속 바뀌기 때문이다.
//
// 그래서 제품이 내보내는 근거는 사실상 "조항 번호" 하나다. 대조할 원문이
// 내부에 없으므로 번호가 틀리면 그것을 잡아줄 2차 방어선도 없다.
// 이 모듈은 그 번호를 한 곳에 모으고, 사용자를 원문으로 보내는 경로를 붙인다.
//
// 두 가지를 제공한다.
//   1. STANDARD_ORIGINS — 발행기관별 원문 확보 경로. `createSource`가 자동으로
//      영수증에 붙여 사용자가 원문을 직접 확인할 수 있게 한다.
//   2. KNOWN_CLAUSES  — 인용이 허용된 조항 목록. 계약 테스트가 이 목록에 없는
//      인용을 차단해, 조항 번호가 코드 여기저기서 조용히 갈라지는 것을 막는다.
//
// 이 모듈은 어떤 모듈도 import 하지 않는다(leaf). `sjc/types`가 이걸 참조하고
// `standards/types`가 `sjc/types`를 참조하므로, 여기서 되짚어 import 하면
// 순환이 생긴다.
// ============================================================

export type StandardAccess = 'free' | 'paid';

export interface StandardOrigin {
  /** 발행기관 */
  publisher: string;
  /** 원문을 확보·확인할 수 있는 경로 */
  url: string;
  /** 원문 열람 조건 — paid는 구매·구독이 필요하다 */
  access: StandardAccess;
}

/**
 * 발행기관별 원문 경로.
 *
 * 조항 단위 딥링크가 아니라 발행기관 단위다. 유료 표준은 조항별 공개 URL이
 * 존재하지 않으며, 있는 척하는 링크를 만드는 것보다 "어디서 사면 되는지"를
 * 정확히 알려주는 편이 실무자에게 쓸모 있다.
 */
export const STANDARD_ORIGINS: Readonly<Record<string, StandardOrigin>> = {
  KEC: { publisher: '산업통상자원부 (한국전기설비규정 공고)', url: 'https://www.motie.go.kr', access: 'free' },
  NEC: { publisher: 'NFPA', url: 'https://www.nfpa.org/codes-and-standards', access: 'paid' },
  'NEC (NFPA 70)': { publisher: 'NFPA', url: 'https://www.nfpa.org/codes-and-standards', access: 'paid' },
  NFPA: { publisher: 'NFPA', url: 'https://www.nfpa.org/codes-and-standards', access: 'paid' },
  IEC: { publisher: 'IEC', url: 'https://webstore.iec.ch', access: 'paid' },
  'IEC/CIE': { publisher: 'CIE', url: 'https://cie.co.at', access: 'paid' },
  JIS: { publisher: 'JISC', url: 'https://www.jisc.go.jp', access: 'free' },
  KS: { publisher: '국가표준인증통합정보시스템', url: 'https://standard.go.kr', access: 'free' },
  'KS B': { publisher: '국가표준인증통합정보시스템', url: 'https://standard.go.kr', access: 'free' },
  IEEE: { publisher: 'IEEE SA', url: 'https://standards.ieee.org', access: 'paid' },
  ASTM: { publisher: 'ASTM International', url: 'https://www.astm.org', access: 'paid' },
  ASME: { publisher: 'ASME', url: 'https://www.asme.org', access: 'paid' },
  ASHRAE: { publisher: 'ASHRAE', url: 'https://www.ashrae.org', access: 'paid' },
  ISO: { publisher: 'ISO', url: 'https://www.iso.org', access: 'paid' },
  NFSC: { publisher: '국가법령정보센터 (국가화재안전기준)', url: 'https://www.law.go.kr', access: 'free' },
  KEPCO: { publisher: '한국전력공사', url: 'https://home.kepco.co.kr', access: 'free' },
};

/**
 * 인용이 허용된 조항 목록.
 *
 * 여기 없는 조항을 인용하면 계약 테스트(`citation-integrity.test.ts`)가 실패한다.
 * 새 인용을 추가할 때는 원문에서 조항 번호를 확인한 뒤 이 목록에 넣는다.
 */
export const KNOWN_CLAUSES: Readonly<Record<string, readonly string[]>> = {
  KEC: [
    '130', '142', '142.5', '142.6', '152', '212.3', '212.4', '213', '232',
    '232.2', '232.3', '232.52', '241', '300', '311', '340', '341', '351', '502',
  ],
  NEC: ['210.19(A)', '220', '310.15(B)(1)', '310.16', 'Chapter 9 Table 8'],
  'NEC (NFPA 70)': ['Table 310.16'],
  NFPA: ['110'],
  IEC: [
    '60034-1', '60034-12', '60034-30-1', '60076', '60076-1', '60076-20',
    '60099-4', '60099-5', '60228', '60255', '60287', '60287-1-1',
    '60364-4-41', '60364-5-52', '60364-5-52 Table B.52.14', '60364-5-54',
    '60831', '60909', '60947-2', '61008-1', '61724', '61800-2',
    '61869-2', '61869-3', '62040-3', '62305-3', '62548', '62619', '62933',
  ],
  'IEC/CIE': ['S 008'],
  JIS: ['C 3307'],
  KS: ['C 7612'],
  'KS B': ['6301'],
  IEEE: ['Std 80', 'C57.12.00'],
  ASTM: ['B258'],
  ASME: ['B31.1', 'BPVC Section I'],
  ASHRAE: ['Fundamentals Ch.18'],
  ISO: ['50001'],
  NFSC: ['101 별표1', '103', '103 §7', '203 별표1', '501 §6'],
  KEPCO: ['Technical Standards for DG Interconnection'],
};

/**
 * 외부 원문 대조가 아직 끝나지 않은 조항.
 *
 * 목록에 있다는 것은 "저장소 안에서 하나로 통일됐다"는 뜻이지
 * "발행기관 원문에서 번호를 확인했다"는 뜻이 아니다. 그 둘을 구분한다.
 */
export const UNVERIFIED_AGAINST_ORIGIN: Readonly<Record<string, string>> = {
  'KEC 232.52':
    '저장소 안에서는 232.52가 정본이다(기준서 엔진 등록 조항·전문팀·테스트 전부 232.52). '
    + '계산기 계층만 232.51을 쓰고 있어 232.52로 정렬했다(2026-07-24). '
    + '어느 쪽이 산업통상자원부 공고 원문의 번호인지는 아직 대조하지 않았다.',
};

/** 발행기관의 원문 경로를 돌려준다. 미등록 기관이면 undefined. */
export function citationOrigin(standard: string): StandardOrigin | undefined {
  return STANDARD_ORIGINS[standard];
}

/** 이 인용이 허용 목록에 있는지 판정한다. */
export function isKnownCitation(standard: string, clause: string): boolean {
  return KNOWN_CLAUSES[standard]?.includes(clause) ?? false;
}

/** 원문 대조가 끝나지 않은 인용이면 그 사유를, 아니면 undefined를 돌려준다. */
export function unverifiedReason(standard: string, clause: string): string | undefined {
  return UNVERIFIED_AGAINST_ORIGIN[`${standard} ${clause}`];
}

// IDENTITY_SEAL: standards/citation-registry | role=인용 정본과 원문 경로 | inputs=standard,clause | outputs=origin,allowlist
