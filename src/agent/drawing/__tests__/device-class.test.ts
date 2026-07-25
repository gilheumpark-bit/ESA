/**
 * 어휘 계층 반증 테스트.
 *
 * 이 분류는 severity: 'critical' 소견("경로에 보호기 미확인")의 입력이다.
 * 오탐이면 없는 보호기를 있다고 읽어 critical 을 거짓으로 소거하고, 미탐이면
 * 정상 도면을 부적합으로 몬다. 그래서 "맞히는지"와 "안 맞히는지"를 같이 잠근다 —
 * 특히 부분 문자열 오탐(cb·gen·bar)이 이 계층을 만든 이유다.
 */

import { classifyDevice, hasDeviceClass } from '../device-class';

const node = (confirmedType: string) => ({ confirmedType, typeCandidates: [] as string[] });

describe('라틴 약호는 토큰 전체 일치만 인정한다', () => {
  it.each([
    ['MCCB', 'protection'],
    ['VCB', 'protection'],
    ['CB', 'protection'],
    ['fuse', 'protection'],
    ['generator', 'source'],
    ['GEN', 'source'],
    ['motor', 'load'],
    ['panel', 'load'],
    ['busbar', 'bus'],
    ['BUS', 'bus'],
  ])('%s → %s', (type, cls) => {
    expect(hasDeviceClass(node(type), cls as never)).toBe(true);
  });

  it.each([
    ['PCB', 'protection'],       // cb 가 토큰 안쪽 — 보호기 아님
    ['agent', 'source'],         // gen 이 토큰 안쪽 — 전원 아님
    ['barrier', 'bus'],          // bar 가 토큰 안쪽 — 모선 아님
    ['regenerator-x1', 'source'],// 하이픈 토큰이라도 regenerator ≠ gen
    ['cabinet', 'load'],
  ])('%s 는 %s 로 오분류하지 않는다', (type, cls) => {
    expect(hasDeviceClass(node(type), cls as never)).toBe(false);
  });

  it('구분자가 섞여도 토큰은 토큰이다', () => {
    expect(hasDeviceClass(node('MCCB-3P/60'), 'protection')).toBe(true);
    expect(hasDeviceClass(node('PANEL_LP-1'), 'load')).toBe(true);
  });
});

describe('한국어 기기어는 복합어 안에서도 잡는다', () => {
  it.each([
    ['주차단기', 'protection'],
    ['배선용차단기', 'protection'],
    ['누전차단기', 'protection'],
    ['변압기2차 분전반', 'load'],
    ['비상발전기', 'source'],
    ['모선 (부스바)', 'bus'],
    ['유도전동기', 'load'],
  ])('%s → %s', (type, cls) => {
    expect(hasDeviceClass(node(type), cls as never)).toBe(true);
  });
});

describe('다중 소속을 유지한다 — 접으면 소견이 소거된다', () => {
  it('"GEN PANEL" 은 전원이면서 부하다', () => {
    const { classes } = classifyDevice(node('GEN PANEL'));
    expect(classes.has('source')).toBe(true);
    expect(classes.has('load')).toBe(true);
  });
});

describe('분류 근거의 출처를 기록한다', () => {
  it('confirmedType → rawLabel → typeCandidates 순으로 고른다', () => {
    expect(classifyDevice({ confirmedType: 'MCCB', rawLabel: 'motor', typeCandidates: ['bus'] }))
      .toMatchObject({ provenance: 'confirmedType', basis: 'MCCB' });
    expect(classifyDevice({ rawLabel: 'motor', typeCandidates: ['bus'] }))
      .toMatchObject({ provenance: 'rawLabel', basis: 'motor' });
    expect(classifyDevice({ typeCandidates: ['bus'] }))
      .toMatchObject({ provenance: 'typeCandidate', basis: 'bus' });
  });

  it('근거가 없으면 아무 class 도 부여하지 않는다 — unknown 은 unknown 으로 남는다', () => {
    const { classes, provenance } = classifyDevice({ typeCandidates: [] });
    expect(classes.size).toBe(0);
    expect(provenance).toBe('none');
  });

  it('변압기는 이 계층의 소비처가 없어 어느 class 에도 넣지 않는다(기존 동작 유지)', () => {
    expect(classifyDevice(node('transformer')).classes.size).toBe(0);
  });
});
