import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PROTECTION_TYPES } from '../electrical-invariants';
import { resolveSymbol } from '../../vision/symbol-db';

/**
 * "보호 기기" 가 무엇인지에 대한 **도메인 진실** 잠금.
 *
 * 이 말은 두 뜻으로 쓰인다. 도면 분류(`symbol-db` 의 `category`)에서는
 * 피뢰기·SPD 도 보호 기기다. 보호 협조에서는 **고장전류를 차단하는 능력**
 * 을 뜻하고, 피뢰기는 서지를 대지로 흘릴 뿐 과전류를 끊지 못한다.
 *
 * 판정층이 후자를 물어야 할 때 전자를 쓰면 SPD 가 변압기를 보호한다고
 * 본다. 반대로 목록을 손으로 좁게 적으면 진짜 차단기가 빠진다 — 실제로
 * `logic-conflicts.ts` 에 한 벌 더 있던 목록에서 GCB·OCB·COS 가 빠져
 * 있었다(2026-07-28 실측).
 *
 * 소프트웨어 게이트는 이 구분을 볼 수 없다. 타입도 린트도 테스트 통과도
 * "SPD 가 차단기인가" 를 묻지 않는다. 그래서 여기 적어 둔다.
 */
describe('보호 기기 판별 — 도메인 진실', () => {
  const 차단능력있음 = [
    ['ACB', '기중차단기 — 저압 주차단기'],
    ['VCB', '진공차단기 — 22.9kV 수배전반 표준'],
    ['GCB', '가스차단기 — 154kV GIS 주차단기'],
    ['OCB', '유입차단기 — 구형 고압 차단기'],
    ['MCCB', '배선용차단기'],
    ['ELCB', '누전차단기'],
    ['MCB', '소형차단기'],
    ['COS', '컷아웃스위치 — 퓨즈 내장, 주상변압기 1차'],
    ['FUSE', '전력퓨즈'],
    ['AFCI', '아크차단기'],
  ] as const;

  it.each(차단능력있음)('%s 는 보호 기기다 — %s', (label) => {
    expect(PROTECTION_TYPES.has(resolveSymbol(label))).toBe(true);
  });

  /**
   * 여기가 이 파일의 핵심이다. 넣으면 안 되는 것들.
   */
  const 차단능력없음 = [
    ['LA', '피뢰기 — 서지를 대지로 흘린다. 과전류를 끊지 않는다'],
    ['SPD', '서지보호소자 — 같은 이유'],
    ['ASS', '자동고장구분개폐기 — 무전압 구간에서 개방. 고장전류 차단 능력 없음'],
    ['RELAY', '보호계전기 — 검출해서 차단기에 지령. 스스로 끊지 않는다'],
    ['CT', '변류기 — 계측'],
    ['LBS', '부하개폐기 — 부하전류는 끊어도 고장전류는 못 끊는다'],
  ] as const;

  it.each(차단능력없음)('%s 는 보호 기기가 아니다 — %s', (label) => {
    expect(PROTECTION_TYPES.has(resolveSymbol(label))).toBe(false);
  });

  /**
   * symbol-db 의 `category: 'protection'` 을 그대로 쓰면 안 된다는 것을
   * 눈으로 보여 둔다. 나중에 "카테고리가 있는데 왜 목록을 또 두나" 하고
   * 바꾸려는 사람이 여기서 멈추게 하는 것이 목적이다.
   */
  it('symbol-db 의 protection 카테고리는 이 집합보다 넓다', () => {
    const db = readFileSync(join(__dirname, '..', '..', 'vision', 'symbol-db.ts'), 'utf8');
    const category = [...db.matchAll(/type:\s*'([a-z_0-9]+)',\s*category:\s*'protection'/g)].map((m) => m[1]);
    expect(category.length).toBeGreaterThan(PROTECTION_TYPES.size);
    const 넘치는것 = category.filter((t) => !PROTECTION_TYPES.has(t)).sort();
    // 넘치는 것은 전부 서지 보호여야 한다 — 차단기가 여기 끼면 목록이 좁다.
    expect(넘치는것).toEqual(['lightning_arrester', 'spd']);
  });
});

/**
 * 정본이 하나인지 — 손으로 적은 두 번째 목록이 다시 생기면 또 갈린다.
 */
describe('보호 기기 목록의 정본', () => {
  const read = (rel: string) => readFileSync(join(__dirname, '..', '..', '..', rel), 'utf8');

  it('판정층은 목록을 직접 적지 않고 정본을 가져다 쓴다', () => {
    const src = read('agent/electrical/logic-conflicts.ts');
    expect(src).toContain("import { PROTECTION_TYPES } from './electrical-invariants'");
    expect(src).toContain('PROTECTION_TYPES.has(type)');
    // 차단기 타입 문자열을 배열로 나열한 흔적이 없어야 한다.
    expect(src).not.toMatch(/\['breaker_[a-z]+',/);
  });

  it('정본은 한 곳에서만 선언된다', () => {
    const 선언 = ['agent/electrical/electrical-invariants.ts', 'agent/electrical/logic-conflicts.ts']
      .filter((rel) => /(?:const|let)\s+PROTECTION_TYPES\s*=/.test(read(rel)));
    expect(선언).toEqual(['agent/electrical/electrical-invariants.ts']);
  });
});
