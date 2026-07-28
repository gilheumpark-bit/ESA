import { parseSafetyIntent } from '@/lib/safety-intent-parser';
import { generateSafetySchedule } from '@/lib/safety-scheduler';
import { analyzeSafety } from '../confined-space';

/**
 * **현장 안전 수치가 실제로 사용자에게 도달하는지** — 반환값으로 본다.
 *
 * 왜 이 파일이 따로 필요한가(2026-07-28 독립 심사 반증자 좌석 실측).
 * 이 리포의 안전 검사 대부분은 `readFileSync` 로 **소스 문자열**을 훑는다.
 * 프로덕션 코드를 한 줄도 import 하지 않는 테스트 파일이 282 개 중 39 개다.
 * 그래서 값은 잠겼는데 **경로는 안 잠겼고**, 아래 변이가 전부 초록이었다:
 *
 *   `if (hasLiveWork)` → `if (false && hasLiveWork)`   활선 이격거리 전멸 · 3007 통과
 *   `if (hasHeat)`     → 차단                          폭염 항목 전멸 · 통과
 *   `if (hasRain)`     → 차단                          누전차단기 전멸 · 통과
 *   `supervisorCount >= 1` → `>= 0`                    감시인 0 명이 "배치됨" · 통과
 *   markMissing 이 description·regulation 을 공백화     전 수치·전 조문 소멸 · 통과
 *   스케줄러 적정공기를 **치사 농도**로 교체            산소 8%·H₂S 100ppm · 통과
 *
 * 마지막 것이 특히 나쁘다. 도메인 검사가 "사본을 놓치지 않는다" 고 주석에
 * 적어 놓고 실제로 건 것은 `"이하"` 라는 낱말 금지뿐이라, **"미만" 표현만
 * 유지하면 어떤 숫자로 바꿔도 통과**했다. 교훈이 주석에만 남고 불변식으로
 * 내려오지 않았다.
 *
 * 여기서는 문자열을 읽지 않는다. `parseSafetyIntent → analyzeSafety →
 * generateSafetySchedule` 을 실제로 돌리고 **나온 것**을 단언한다.
 */

/** 항목 전체를 한 덩어리 문자열로 — 어느 칸에 있든 사용자는 읽는다. */
function textOf(items: Array<{ title: string; description: string; alternative?: string }>): string {
  return items.map((i) => `${i.title} ${i.description} ${i.alternative ?? ''}`).join('\n');
}

describe('활선 작업 — 접근 한계거리가 화면까지 온다', () => {
  const a = analyzeSafety(parseSafetyIntent('154kV 수전설비 활선 근접 작업, 3명, 09시~18시'));

  it('활선 항목이 실제로 생성된다', () => {
    expect(a.checkItems.some((i) => i.id.startsWith('live-'))).toBe(true);
  });

  it('22.9kV 0.9m · 154kV 1.7m 가 문구에 있다', () => {
    const t = textOf(a.checkItems);
    expect(t).toContain('22.9kV 0.9m');
    expect(t).toContain('154kV 1.7m');
  });

  it('활선 항목이 critical 로 나온다 — 등급이 내려가면 권고로 읽힌다', () => {
    const live = a.checkItems.filter((i) => i.id.startsWith('live-'));
    expect(live.some((i) => i.riskLevel === 'critical')).toBe(true);
  });

  /**
   * **등재된 것이 2 행뿐이라는 사실을 말한다.**
   *
   * 제321조 제1항 표는 13 행이고 앱에는 22.9kV·154kV 두 행만 있다. 154kV
   * 수전설비의 소내 전압(6.6kV·380V·220V)이 전부 없는데, 저압 구간은 값이
   * 작아지는 게 아니라 **"접촉금지"**(숫자 없음)로 갈리는 구간이 있다 —
   * 없는 것을 "작으니 괜찮다" 로 읽으면 위험하다.
   *
   * 11 행을 지어 넣지 않았다(법령 별표가 이미지라 원문 미확보). 대신 없다는
   * 사실을 적었고, 이 검사는 그 문장이 지워지지 않게 잠근다.
   */
  it('두 전압만 등재됐다는 사실과 그 함의를 문구가 말한다', () => {
    const t = textOf(a.checkItems);
    expect(t).toMatch(/이 두 전압만 등재/);
    expect(t).toMatch(/이격이 필요 없다는\s*뜻이 아니다/);
    expect(t).toMatch(/접촉금지/);
  });
});

describe('폭염 — 체감온도 31°C 가 파서를 통과해 항목이 된다', () => {
  /** 파서가 35 에 머물러 31~34 구간이 통째로 죽어 있었다. */
  it.each(['체감온도 31도 옥외 배전반 작업', '체감온도 32도 점검', '기온 34도 전기실', '체감온도 41도'])(
    '%s → 폭염 항목이 나온다',
    (text) => {
      const a = analyzeSafety(parseSafetyIntent(text));
      expect(a.checkItems.some((i) => i.id.startsWith('heat-'))).toBe(true);
      expect(textOf(a.checkItems)).toContain('31');
    },
  );

  it('기준 미만 온도는 폭염이 아니다 — 상시 발화하면 무시하게 된다', () => {
    const a = analyzeSafety(parseSafetyIntent('기온 20도 정기 점검, 2명'));
    expect(a.checkItems.some((i) => i.id.startsWith('heat-'))).toBe(false);
  });
});

describe('우천 — 누전차단기가 화면까지 온다', () => {
  const a = analyzeSafety(parseSafetyIntent('우천 시 옥외 배전반 작업, 2명, 09시~17시'));

  it('우천 항목이 생성되고 15mA 가 문구에 있다', () => {
    expect(a.checkItems.some((i) => i.id.startsWith('rain-'))).toBe(true);
    expect(textOf(a.checkItems)).toContain('15mA');
  });

  it('누전차단기 항목이 critical 이다', () => {
    const rain = a.checkItems.filter((i) => i.id.startsWith('rain-'));
    expect(rain.some((i) => i.riskLevel === 'critical')).toBe(true);
  });
});

describe('밀폐공간 — 전기 항목이 빠지지 않는다', () => {
  const a = analyzeSafety(parseSafetyIntent('맨홀 내부 케이블 접속 작업 2명, 09시~15시'));

  /**
   * 전기 기술자가 맨홀에 들어가는 이유는 그 안의 지중 케이블이다. 앞서
   * `!intent.isConfinedSpace` 조건 때문에 이 입력에서 전기 항목이 0 이었고,
   * 화면은 그 상태로 "8/8 (100%)" 를 띄웠다.
   */
  it('밀폐공간 항목과 기본 전기 항목이 함께 나온다', () => {
    expect(a.checkItems.some((i) => i.id.startsWith('cs-'))).toBe(true);
    expect(a.checkItems.some((i) => i.id.startsWith('base-'))).toBe(true);
  });

  it('정전 확인·절연 보호구 문구가 실제로 있다', () => {
    const t = textOf(a.checkItems);
    expect(t).toMatch(/검전/);
    expect(t).toMatch(/절연 장갑/);
  });
});

describe('정전 작업 — 조문이 요구하는 뒷단계가 있다', () => {
  const a = analyzeSafety(parseSafetyIntent('154kV 수전설비 정전 작업, 3명, 09시~18시, 관리자 1명'));

  /**
   * 검전을 통과한 뒤에 사람을 죽이는 것들이다 — 유도전압·잔류전하로 인한
   * 감전, 접지 미철거 재투입으로 인한 3상 단락. 앞서 체크리스트는
   * "차단 → 잠금 → 검전" 에서 끝났다.
   */
  it('잔류전하 방전과 단락접지가 항목으로 있다', () => {
    const t = textOf(a.checkItems);
    expect(t).toMatch(/잔류전하/);
    expect(t).toMatch(/단락접지/);
  });

  it('재통전 전 접지 철거 확인이 있다', () => {
    expect(textOf(a.checkItems)).toMatch(/철거/);
  });

  it('둘 다 critical 이다', () => {
    for (const id of ['base-03', 'base-04']) {
      const item = a.checkItems.find((i) => i.id === id);
      expect(item?.riskLevel).toBe('critical');
    }
  });
});

describe('감시인 — 인원 판정이 실제 수를 본다', () => {
  it('감시인 없는 밀폐공간 작업은 해당 항목이 미비로 표시된다', () => {
    const a = analyzeSafety(parseSafetyIntent('맨홀 내부 작업 2명, 09시~15시'));
    const watcher = a.checkItems.find((i) => /감시인/.test(i.title));
    expect(watcher).toBeDefined();
    expect(watcher!.isMissing).toBe(true);
  });

  it('감시인이 있으면 미비가 아니다 — 위 검사가 상수 true 가 아님', () => {
    const a = analyzeSafety(parseSafetyIntent('맨홀 내부 작업 2명, 관리자 1명, 09시~15시'));
    const watcher = a.checkItems.find((i) => /감시인/.test(i.title));
    expect(watcher!.isMissing).toBe(false);
  });
});

describe('모든 항목이 내용을 들고 나온다', () => {
  const inputs = [
    '154kV 활선 근접 작업 3명, 09시~18시',
    '맨홀 내부 작업 2명, 09시~15시',
    '우천 시 옥외 배전반 점검 2명',
    '체감온도 33도 전기실 작업 4명',
  ];

  /** description·regulation 공백화 변이가 3007 개를 전부 통과했던 자리. */
  it.each(inputs)('%s — 빈 설명·빈 조문이 없다', (text) => {
    const items = analyzeSafety(parseSafetyIntent(text)).checkItems;
    expect(items.length).toBeGreaterThan(0);
    for (const i of items) {
      expect(i.description.trim().length).toBeGreaterThan(10);
      expect(i.regulation.trim().length).toBeGreaterThan(0);
    }
  });
});

describe('인식했는데 안 다루는 조건을 밝힌다', () => {
  /**
   * 파서가 **신뢰도 1.00** 으로 낙뢰·고소를 읽고 체크리스트는 기본 2 개만
   * 냈다. 사용자는 자기가 낙뢰를 적었고 앱이 만점으로 분석했다고 보므로
   * **침묵을 "그 조건은 문제없음" 으로 읽는다.**
   */
  it.each([
    ['옥외 철탑 점검, 낙뢰, 2명, 13시~17시', ['낙뢰', '고소']],
    ['전주 작업, 강풍, 3명, 09시~17시', ['강풍', '고소']],
    ['변압기 교체 작업, 전기실, 4명', ['변압기']],
  ])('%s — 공백 고지가 나온다', (text, expected) => {
    const gap = analyzeSafety(parseSafetyIntent(text)).checkItems.find((i) => i.id === 'gap-01');
    expect(gap).toBeDefined();
    for (const token of expected) expect(gap!.title).toContain(token);
  });

  it('고지 문구가 "없음 = 안전"으로 읽히지 않게 말한다', () => {
    const gap = analyzeSafety(parseSafetyIntent('낙뢰 옥외 작업 2명')).checkItems
      .find((i) => i.id === 'gap-01');
    expect(gap!.description).toMatch(/안전하다는 뜻이 아닙니다/);
  });

  /**
   * 다루는 조건만 있으면 고지가 뜨지 않는다 — 상시 발화하면 사용자가 이
   * 항목 전체를 무시하게 되고, 그러면 진짜 공백일 때도 안 읽는다.
   *
   * `배전반 작업`(panel_work)은 여기 넣지 않는다. 처음엔 "기본 전기 항목이
   * 덮으니 고지가 뜨면 안 된다" 고 적었다가 실행 결과를 보고 바꿨다 —
   * 배전반의 고유 위험은 **아크플래시**이고, 이 앱은 계산기에서 PPE 등급을
   * 내면서 현장 체크리스트로는 한 줄도 보내지 않는다(같은 심사 F3).
   * 즉 고지가 맞다.
   */
  it.each([
    '154kV 수전설비 정전 작업, 3명, 09시~18시',
    '맑음, 전기실 정기 점검 2명',
    '우천 시 실내 작업 2명',
  ])('%s — 고지가 뜨지 않는다', (text) => {
    const items = analyzeSafety(parseSafetyIntent(text)).checkItems;
    expect(items.find((i) => i.id === 'gap-01')).toBeUndefined();
  });

  it('배전반 작업은 고지가 뜬다 — 아크플래시가 현장에 안 닿는다', () => {
    const gap = analyzeSafety(parseSafetyIntent('배전반 작업 2명')).checkItems
      .find((i) => i.id === 'gap-01');
    expect(gap?.title).toContain('배전반');
  });
});

describe('밀폐공간 — 철수·재진입 구간', () => {
  const a = analyzeSafety(parseSafetyIntent('맨홀 내부 작업 2명, 09시~15시, 관리자 1명'));

  /**
   * 앞 8 항목은 **들어가기 전**만 다뤘다. 국내 질식 사망의 전형적인 마지막
   * 단계 — 철수할 때 안에 남은 한 명을 세지 못한 채 뚜껑을 닫는 것 — 이
   * 비어 있었다(2026-07-28 독립 심사 완전성 좌석).
   */
  it.each([
    ['출입 인원 점검', /인원/],
    ['출입금지 표지', /출입금지/],
    ['재진입 조건', /재진입/],
  ])('%s 항목이 있다', (_label, re) => {
    expect(textOf(a.checkItems)).toMatch(re);
  });

  it('인원 점검과 재진입은 critical 이다', () => {
    for (const id of ['cs-09', 'cs-11']) {
      expect(a.checkItems.find((i) => i.id === id)?.riskLevel).toBe('critical');
    }
  });
});

describe('작업 일정 — 적정공기 수치를 값 단위로 잠근다', () => {
  const sched = generateSafetySchedule(
    parseSafetyIntent('맨홀 내부 케이블 작업 2명, 09시~18시, 관리자 1명'),
  );

  it('밀폐공간 작업에 일정이 나온다', () => {
    expect(sched).not.toBeNull();
    expect(sched!.checkpoints.length).toBeGreaterThan(2);
  });

  /**
   * 앞선 검사는 `"이하"` 라는 낱말만 금지했다. 그래서 "미만" 표현을 유지한
   * 채 산소 8%·이산화탄소 15%·일산화탄소 300ppm·황화수소 100ppm — **전부
   * 치사 영역** — 으로 바꿔도 초록이었다. 값을 직접 박는다.
   */
  it.each([
    ['산소 하한', '18%'],
    ['산소 상한', '23.5%'],
    ['이산화탄소', '1.5%'],
    ['일산화탄소', '30ppm'],
    ['황화수소', '10ppm'],
  ])('가스 측정 문구에 %s(%s) 가 그대로 있다', (_label, token) => {
    const gas = sched!.checkpoints.filter((c) => c.isGasMeasurement);
    expect(gas.length).toBeGreaterThan(0);
    expect(gas.map((c) => c.description).join(' ')).toContain(token);
  });

  it('느슨한 부등호를 쓰지 않는다 — 경계에서 부적합이 적합이 된다', () => {
    const gas = sched!.checkpoints.filter((c) => c.isGasMeasurement);
    expect(gas.map((c) => c.description).join(' ')).not.toMatch(/이하/);
  });
});
