/**
 * Multi-language Disclaimer System
 *
 * PART 1: Version constant
 * PART 2: Disclaimer text in 4 languages (ko / en / ja / zh)
 * PART 3: Copyright notice (standards provenance)
 * PART 4: Legal review metadata
 */

// ---------------------------------------------------------------------------
// PART 1 — Version
// ---------------------------------------------------------------------------

export const DISCLAIMER_VERSION = 'v3.1';

export type DisclaimerLang = 'ko' | 'en' | 'ja' | 'zh';

// ---------------------------------------------------------------------------
// PART 2 — Disclaimer body text
// ---------------------------------------------------------------------------

const DISCLAIMERS: Record<DisclaimerLang, string> = {
  ko:
    '본 계산서는 참고용이며 최종 책임은 검토자에게 있습니다. ' +
    '최종 판단은 자격을 갖춘 전문가가 수행해야 합니다. ' +
    'ESA는 계산 결과의 정확성을 보증하지 않습니다. ' +
    '본 결과를 설계, 시공, 감리의 유일한 근거로 사용하지 마십시오. ' +
    '적용된 규격은 발행 시점의 판본을 기준으로 하며, 최신 개정 여부를 반드시 확인하십시오.',

  en:
    'This calculation report is provided for reference purposes only. ' +
    'Final responsibility rests with the reviewing engineer. ' +
    'All results must be verified by a qualified professional before use in design, construction, or supervision. ' +
    'ESVA does not warrant the accuracy or completeness of any calculation result. ' +
    'The standards referenced are based on the editions available at the time of calculation; ' +
    'users must verify that the applicable edition is current.',

  ja:
    '本計算書は参考資料であり、最終的な責任は検討者にあります。' +
    '最終判断は有資格の専門家が行う必要があります。' +
    'ESAは計算結果の正確性を保証しません。' +
    '本結果を設計・施工・監理の唯一の根拠として使用しないでください。' +
    '適用された規格は算出時点の版を基準としており、最新の改訂状況を必ずご確認ください。',

  zh:
    '本计算书仅供参考，最终责任由审核人员承担。' +
    '最终判断必须由具有资质的专业人员做出。' +
    'ESA不保证计算结果的准确性或完整性。' +
    '请勿将本结果作为设计、施工或监理的唯一依据。' +
    '所引用的标准以计算时的版本为准，请务必确认是否为最新修订版。',
};

/**
 * Return the full disclaimer text for the given language.
 */
export function getDisclaimer(lang: DisclaimerLang): string {
  return DISCLAIMERS[lang];
}

// ---------------------------------------------------------------------------
// PART 3 — Copyright / standards provenance notice
// ---------------------------------------------------------------------------

const COPYRIGHT_NOTICES: Record<DisclaimerLang, string> = {
  ko:
    'ESA는 링크전용 규격 원문을 보유하지 않습니다. ' +
    '규격 원문은 각 발행기관의 저작물이며, ESA는 해당 원문을 복제·배포하지 않습니다. ' +
    '계산에 사용된 조항 번호와 공식은 공개된 기술 참고 자료에 기반합니다.',

  en:
    'ESVA does not host or distribute the full text of any referenced standard. ' +
    'All standards are the copyrighted property of their respective issuing bodies. ' +
    'Clause numbers and formulas used in calculations are based on publicly available technical references.',

  ja:
    'ESAは参照規格の原文を保有・配布しておりません。' +
    '全ての規格は各発行機関の著作物です。' +
    '計算に使用された条項番号および公式は、公開されている技術参考資料に基づいています。',

  zh:
    'ESA不持有或分发任何引用标准的全文。' +
    '所有标准均为各发布机构的版权财产。' +
    '计算中使用的条款编号和公式基于公开可用的技术参考资料。',
};

/**
 * Return the copyright/standards provenance notice for the given language.
 */
export function getCopyrightNotice(lang: DisclaimerLang): string {
  return COPYRIGHT_NOTICES[lang];
}

// ---------------------------------------------------------------------------
// PART 4 — Legal review metadata
// ---------------------------------------------------------------------------

/** ISO-8601 date of the last legal review of disclaimer text. */
const LEGAL_VERIFIED_AT = '2026-03-15';

/**
 * Return the date (ISO-8601) when the disclaimer text was last reviewed by legal counsel.
 */
export function getLegalVerifiedAt(): string {
  return LEGAL_VERIFIED_AT;
}
