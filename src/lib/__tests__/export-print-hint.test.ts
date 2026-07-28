import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { generateReceipt } from '@engine/receipt';
import { generateReceiptHTML } from '../export-pdf';
import { executeRegisteredCalculator } from '../calculation-execution';

/**
 * "PDF" 버튼이 내주는 것이 **무엇인지 사용자가 알 수 있는가.**
 *
 * 실측 2026-07-28: 화면 버튼은 "PDF" 인데 `/api/export` 의 pdf 경로는
 * `text/html` 을 돌려준다 — `%PDF-` 서명이 없고 파일명도 `.html` 이다.
 * 의도는 브라우저 인쇄로 PDF 저장이고 그래서 `@media print`·`@page`
 * 규칙이 이미 있었는데, **본문에 인쇄 안내가 0건**이었다. 누른 사람은
 * 웹페이지 하나를 받고 다음에 뭘 해야 할지 알 수 없다(§2.8).
 *
 * `.no-print` 클래스도 CSS 에 정의만 되고 **쓰는 곳이 0** 이었다 —
 * 이 바가 원래 들어갈 자리였다(§2.2).
 *
 * excel·csv 는 정직하다(실측: xlsx 는 ZIP 서명, csv 는 CSV). 문제는
 * pdf 하나였다.
 */

/**
 * 영수증은 **실제 경로로 만든다.** 손으로 객체를 짜면 필드가 빠져
 * `escapeHtml` 같은 엉뚱한 곳에서 터진다(2026-07-28 실측 — 이 파일에서도
 * 그랬다). 계산기 실행 → 영수증 생성을 그대로 태운다.
 */
const INPUTS = { voltage: 230, current: 10, powerFactor: 0.9 };
async function makeReceipt() {
  const ex = executeRegisteredCalculator('single-phase-power', INPUTS, 'KR');
  return generateReceipt({
    calcId: ex.entry.id,
    calcResult: ex.result,
    steps: ex.result.steps,
    formulaUsed: ex.result.formula,
    standardsUsed: ex.result.steps
      .map((st) => st.standardRef)
      .filter((r): r is string => Boolean(r)),
    inputs: INPUTS,
    countryCode: ex.countryCode,
    standard: ex.standard,
    standardVersion: ex.standardVersion,
    unitSystem: ex.unitSystem,
    difficulty: ex.entry.difficulty,
  });
}

const stripTags = (html: string) => html
  .replace(/<style[\s\S]*?<\/style>/gi, '')
  .replace(/<script[\s\S]*?<\/script>/gi, '')
  .replace(/<[^>]+>/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

describe('인쇄용 내보내기 — 무엇을 받았는지 알려준다', () => {
  it('본문(태그 제외)에 인쇄 안내가 있다', async () => {
    // 태그를 벗기고 본다 — CSS 의 `@media print` 가 안내로 잡히면 안 된다.
    // 앞선 판에서 내 탐침이 정확히 그렇게 오탐했다(2026-07-28).
    const text = stripTags(generateReceiptHTML(await makeReceipt(), 'ko'));
    expect(text).toMatch(/Ctrl\+P/);
    expect(text).toMatch(/PDF로 저장/);
  });

  it('인쇄 버튼이 실제로 window.print 를 부른다', async () => {
    const html = generateReceiptHTML(await makeReceipt(), 'ko');
    expect(html).toMatch(/onclick="window\.print\(\)"/);
  });

  it('그 바는 인쇄물에는 안 나온다 — no-print 로 감싼다', async () => {
    const html = generateReceiptHTML(await makeReceipt(), 'ko');
    expect(html).toMatch(/class="no-print print-hint"/);
    // 클래스가 CSS 에 실제로 정의돼 있어야 숨겨진다(정의만 있고 미사용이던 자리).
    expect(html).toMatch(/\.no-print\s*\{\s*display:\s*none/);
  });

  it.each(['ko', 'en', 'ja', 'zh'] as const)('%s 안내가 그 언어로 나온다', async (lang) => {
    const text = stripTags(generateReceiptHTML(await makeReceipt(), lang));
    const expected: Record<string, RegExp> = {
      ko: /인쇄용입니다/, en: /print-ready/, ja: /印刷用/, zh: /打印版/,
    };
    expect(text).toMatch(expected[lang]);
  });

  /** 화면 버튼도 "PDF 파일" 을 약속하지 않아야 한다. */
  it('화면 버튼 라벨이 인쇄임을 밝힌다', () => {
    const page = readFileSync(
      join(__dirname, '..', '..', 'app', '(with-nav)', 'calc', '[category]', '[id]', 'page.tsx'),
      'utf8',
    );
    expect(page).toMatch(/인쇄 · PDF/);
  });
});
