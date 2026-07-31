import { execFileSync } from 'node:child_process';
import path from 'node:path';

import { KEC_CLAUSE_INDEX, isRealKecClause } from '../kec/clause-index';

/**
 * **소스가 인용하는 KEC 조항 번호가 실제로 존재하는지 본다.**
 *
 * 이 제품이 사용자에게 내놓는 근거는 사실상 조항 번호 하나다. 원문 문장을 담지
 * 않으므로(저작권·판본), 번호가 틀리면 그걸 잡아줄 2차 방어선이 저장소 안에
 * 없다 — 계산은 맞고 테스트는 초록인데 근거만 존재하지 않는 조문을 가리킨다.
 * 정확히 §2.10 도메인 진실 미검증의 형태다.
 *
 * 실측 2026-07-31: 어느 브랜치가 전압강하 인용을 12+ 파일에 걸쳐 `232.51` →
 * `232.52` 로 «정본화» 했다. 232.52 는 KEC 에 없다(232.5 허용전류 · 232.51
 * 케이블공사 · 232.56 애자공사 · 그 사이는 비어 있다). 전압강하는 232.3.9
 * 「수용가 설비에서의 전압강하」다. 그 브랜치의 tsc·lint·전체 스위트는 전부
 * 초록이었다 — 소프트웨어 게이트는 «코드로서 옳은가»만 보기 때문이다.
 *
 * 오라클은 저장소 밖이다: 공표된 KEC 전문의 조항 번호(`clause-index.ts`).
 * 저장소가 스스로를 근거로 삼는 순간 닫힌 순환이 되므로(§2.3), 허용 목록을
 * 손으로 관리하지 않고 원문에서 생성한 색인에 묻는다.
 */

const ROOT = path.resolve(__dirname, '../../../..');

/**
 * `'KEC 232.3.9'` · `'KEC-232.3.9-MAIN'` · `createSource('KEC', '232.3.9')` 를 잡는다.
 *
 * **주석은 보지 않는다.** 제품이 사용자에게 내보내는 것은 문자열 리터럴이고,
 * 주석은 정비자를 위한 산문이다. 이 저장소의 주석에는 «KEC 220 대는 없다 —
 * 뺐다» 같은 *정정 기록*이 여럿 있는데, 그것을 인용으로 세면 정정을 남긴
 * 파일일수록 더 크게 실패한다. 정직한 기록에 벌을 주는 검사는 지워진다.
 *
 * 백분율은 조항이 아니다. 「KEC 3% 보다 엄격」·「KEC 8% + 길이가산」 처럼 이
 * 저장소는 한도를 KEC 뒤에 바로 쓴다 — `%` 가 따라붙으면 조항 번호가 아니다.
 */
const CITATION = /KEC[\s'",-]*(\d+(?:\.\d+)*)(?!\s*%)/g;

/**
 * 의도적으로 **없는 조항을 참조하는 줄**에 다는 표식.
 *
 * 폐지 조항이 되살아나면 빨개지는 회귀 테스트, 접두사 경계 음성 케이스처럼
 * «존재하지 않음» 자체가 검사 대상인 자리가 있다. 그런 줄에 이 표식을 달면
 * 이 게이트가 넘어간다. 표식은 주석이므로 사유를 바로 옆에 적게 된다 —
 * 목록을 다른 파일에 두면 무엇이 왜 면제됐는지 아무도 안 본다.
 */
const EXEMPT_MARKER = 'kec-citation-exempt';

/**
 * 조항 번호가 아닌 것들. 정규식이 문맥을 모르므로 여기서 걷어낸다.
 * 걷어내는 것 자체가 위험하므로 **사유를 각각 적는다** — 조용한 제외 금지.
 */
const NOT_A_CLAUSE = new Set([
  '2021', // 판본 연도 — `{ edition: '2021' }`
  '2026', // 판본 연도
  '100', // 「KEC 100m 기준」 같은 길이 표기
  '999.9', // 이 스위트가 만드는 가상 조항(vacuous-pass-block)
  '999.99', // 자리표시자 시험값
  '999.9.9', // 자리표시자 시험값
]);

/**
 * 주석을 지운다. 블록 주석 먼저, 그다음 줄 주석.
 * `https://` 의 `//` 는 KEC 인용을 담지 않으므로 이 단순화로 잃는 것이 없다.
 *
 * 줄 주석 패턴에 `$` 를 쓰지 않는다. 이 저장소 파일은 CRLF 이고 **JS 정규식에서
 * `\r` 은 줄 종결자**라 `.*` 가 그 앞에서 멈춘다 — `$`(m 플래그 없음)는 문자열
 * 끝에서만 맞으므로 `//.*$` 는 CRLF 줄에서 **한 건도 매칭되지 않는다**. 실측
 * 2026-07-31: 이 함수가 주석을 하나도 못 지워 정정 주석 26 건이 인용으로 잡혔다.
 */
function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .split('\n')
    .map((line) => line.replace(/\/\/.*/, ''))
    .join('\n');
}

/**
 * 이 줄이 면제됐는가 — 줄 자체 또는 **바로 앞에 붙은 주석 블록**에 표식이 있으면 된다.
 *
 * 「바로 위 한 줄」로 좁히면 사유를 두 줄 넘게 적은 순간 표식이 닿지 않아,
 * 설명을 성실히 쓸수록 검사가 실패한다. 그 규칙은 오래 못 간다.
 */
function isExempt(lines: string[], index: number): boolean {
  if (lines[index].includes(EXEMPT_MARKER)) return true;
  for (let i = index - 1; i >= 0; i -= 1) {
    if (!/^\s*(\/\/|\*|\/\*)/.test(lines[i])) return false;
    if (lines[i].includes(EXEMPT_MARKER)) return true;
  }
  return false;
}

/** 인용 1 건. */
interface Citation {
  clause: string;
  file: string;
  line: number;
}

function collectCitations(): Citation[] {
  // git ls-files 로 추적 파일만 본다 — node_modules·빌드 산출물 제외.
  const files = execFileSync('git', ['ls-files', 'src'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n')
    .filter((f) => /\.tsx?$/.test(f));

  const fs = require('node:fs') as typeof import('node:fs');
  const found: Citation[] = [];

  for (const file of files) {
    const raw = fs.readFileSync(path.join(ROOT, file), 'utf8').split('\n');
    // 면제 표식은 주석에 있으므로 **원문 줄**에서 본다. 주석을 지운 줄에서
    // 찾으면 표식도 같이 사라져 영원히 안 걸린다.
    stripComments(raw.join('\n')).split('\n').forEach((line, i) => {
      if (isExempt(raw, i)) return;
      for (const m of line.matchAll(CITATION)) {
        const clause = m[1];
        if (NOT_A_CLAUSE.has(clause)) continue;
        found.push({ clause, file, line: i + 1 });
      }
    });
  }
  return found;
}

describe('KEC 인용 조항은 공표 전문에 실재한다', () => {
  const citations = collectCitations();

  it('색인이 비어 있지 않다 — 공회전 반증', () => {
    expect(KEC_CLAUSE_INDEX.size).toBeGreaterThan(1000);
  });

  it('인용을 실제로 찾아낸다 — 정규식이 죽으면 이 검사 전체가 무의미해진다', () => {
    expect(citations.length).toBeGreaterThan(50);
  });

  it('실재하지 않는 조항을 인용하지 않는다', () => {
    const ghosts = citations.filter((c) => !isRealKecClause(c.clause));
    const report = ghosts.map((c) => `KEC ${c.clause}  ${c.file}:${c.line}`);
    expect(report).toEqual([]);
  });

  /**
   * 탐지가 발화하는지 — 규칙이 있어도 아무것도 못 잡으면 장식이다(§2.2).
   * 실제로 저질러진 오류(232.52)를 그대로 건다.
   */
  it('탐지 규칙이 발화한다 — 232.52 는 잡히고 232.3.9 는 통과한다', () => {
    expect(isRealKecClause('232.52')).toBe(false);
    expect(isRealKecClause('232.3.9')).toBe(true);
    expect(isRealKecClause('232.51')).toBe(true); // 실재하지만 케이블공사 — 번호 존재 ≠ 내용 일치
  });
});
