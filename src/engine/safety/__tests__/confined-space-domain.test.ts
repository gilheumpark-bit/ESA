import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 현장 안전 체크리스트의 **숫자**를 법령 문면에 결박한다.
 *
 * 이 파일의 문구는 사용자가 그대로 따라 하는 안전 지시다. 그런데
 * 2026-07-28 실측에서 기존 검사 5 개가 **수치를 하나도 잠그지 않고**
 * 있었고, 그 사이로 셋이 틀려 있었다 — 셋 다 **덜 안전한 방향**이다:
 *
 *  ① 충전전로 접근 한계거리 22.9kV **0.6m → 0.9m**
 *     표의 "2kV 초과 15kV 이하 = 60cm" 행을 22.9kV 에 잘못 적용했다.
 *     22.9kV 는 국내 표준 배전전압이고 30cm 를 덜 띄우게 만든다.
 *  ② 같은 항목 154kV **1.6m → 1.7m** (145kV 초과 169kV 이하 = 170cm).
 *     이 제품의 대상이 154kV 급 수전설비다.
 *  ③ 적정공기 판정이 "10ppm **이하**·30ppm **이하**" 였다. 규정은
 *     "**미만**" 이라 경계값에서 부적합을 적합으로 읽었다. 그리고 네
 *     항목 중 **이산화탄소 1.5% 가 빠지고** 그 자리에 메탄이 들어가 있었다.
 *
 * 검증 수준(과장 금지): 법령 원문 DB 직접 조회는 실패했고(표가 HTML 에
 * 실려 있지 않다), **공개 문헌 2 곳에서 같은 값을 확인**했다. 그래서 이
 * 검사는 "표준이 이렇다" 가 아니라 **"우리가 확인한 값에서 말없이
 * 벗어나지 않는다"** 를 잠근다. 원문을 확보하면 이 주석을 갱신할 것.
 */

const SRC = readFileSync(join(__dirname, '..', 'confined-space.ts'), 'utf8');

describe('현장 안전 — 도메인 수치 결박', () => {
  it('소스를 실제로 읽는다 — 이 검사가 공회전이 아님', () => {
    expect(SRC.length).toBeGreaterThan(2000);
    expect(SRC).toContain('CONFINED_SPACE_MANDATORY');
  });

  describe('① 충전전로 접근 한계거리 (제321조 제1항)', () => {
    it('22.9kV 는 0.9m 다 — 0.6m 는 2~15kV 행이다', () => {
      expect(SRC).toContain('22.9kV 0.9m');
      expect(SRC).not.toContain('22.9kV 0.6m');
      expect(SRC).not.toMatch(/22\.9kV:\s*0\.6m/);
    });

    it('154kV 는 1.7m 다 — 145kV 초과 169kV 이하 = 170cm', () => {
      expect(SRC).toContain('154kV 1.7m');
      expect(SRC).not.toContain('154kV 1.6m');
    });

    it('그 밖의 전압은 표를 보라고 말한다 — 두 값만 외우게 두지 않는다', () => {
      expect(SRC).toMatch(/제321조 제1항 표|구간마다 값이 다르다/);
    });
  });

  describe('③ 적정공기 (제618조 정의)', () => {
    it('네 항목이 모두 있다 — 산소·이산화탄소·일산화탄소·황화수소', () => {
      expect(SRC).toMatch(/산소 농도 18% 이상 23\.5% 미만/);
      expect(SRC).toMatch(/이산화탄소 1\.5% 미만/);
      expect(SRC).toMatch(/일산화탄소 30ppm 미만/);
      expect(SRC).toMatch(/황화수소 10ppm 미만/);
    });

    it('경계를 "이하" 로 느슨하게 쓰지 않는다 — 규정은 "미만" 이다', () => {
      expect(SRC).not.toMatch(/황화수소 10ppm 이하/);
      expect(SRC).not.toMatch(/일산화탄소 30ppm 이하/);
      expect(SRC).not.toMatch(/이산화탄소 1\.5% 이하/);
    });

    it('메탄은 별도 항목으로 남는다 — 폭발 하한이라 적정공기를 대신하지 못한다', () => {
      expect(SRC).toMatch(/메탄 10%LEL/);
      // 적정공기 네 항목을 메탄이 대체하지 않았는지: 이산화탄소가 함께 있어야 한다.
      const gasLine = SRC.split('\n').find((l) => l.includes('메탄 10%LEL')) ?? '';
      const around = SRC.slice(Math.max(0, SRC.indexOf(gasLine) - 400), SRC.indexOf(gasLine) + 200);
      expect(around).toMatch(/이산화탄소/);
    });
  });

  /**
   * 이 항목들이 실제로 목록에 실려 사용자에게 도달하는지 — 문자열만
   * 고치고 항목이 빠져 있으면 아무 의미가 없다(§2.4).
   */
  it('세 항목이 필수 목록 안에 있다', () => {
    for (const id of ['cs-01', 'cs-02', 'live-03']) {
      expect(SRC).toContain(`id: '${id}'`);
    }
    for (const id of ['cs-01', 'cs-02']) {
      const idx = SRC.indexOf(`id: '${id}'`);
      expect(idx).toBeGreaterThan(SRC.indexOf('CONFINED_SPACE_MANDATORY'));
    }
  });

  /**
   * **사본을 놓치지 않는다.** 처음 이 파일은 `confined-space.ts` 하나만
   * 훑었는데, 같은 수치가 `lib/safety-scheduler.ts` 에도 있었다 — 그쪽을
   * 안 고쳐 화면에는 옛 값("H₂S 10ppm 이하, CO 30ppm 이하")이 그대로
   * 떴다(2026-07-28 라이브 실측). 파일 하나를 잠그는 검사는 형제를 못 본다.
   */
  describe('리포 전체에 느슨한 사본이 없다', () => {
    const SRC_ROOT = join(__dirname, '..', '..', '..');
    const walk = (dir: string, out: string[] = []): string[] => {
      for (const name of readdirSync(dir)) {
        if (['__tests__', 'node_modules', '.next'].includes(name)) continue;
        const full = join(dir, name);
        if (statSync(full).isDirectory()) walk(full, out);
        else if (/\.(ts|tsx)$/.test(full)) out.push(full);
      }
      return out;
    };
    const files = walk(SRC_ROOT);

    it('훑는 파일이 충분하다 — 공회전 아님', () => {
      expect(files.length).toBeGreaterThan(200);
    });

    it.each([
      ['황화수소/H₂S 10ppm', /(황화수소|H₂S)\s*10\s*ppm\s*이하/],
      ['일산화탄소/CO 30ppm', /(일산화탄소|CO)\s*30\s*ppm\s*이하/],
      ['이산화탄소 1.5%', /이산화탄소\s*1\.5\s*%\s*이하/],
    ])('%s 를 "이하" 로 쓴 곳이 없다', (_이름, re) => {
      const bad = files
        .filter((f) => re.test(readFileSync(f, 'utf8')))
        .map((f) => f.slice(SRC_ROOT.length + 1));
      expect(bad).toEqual([]);
    });

    /**
     * **주석은 세지 않는다.** 파일 전체를 훑으면 내가 적은 설명 주석
     * ("이산화탄소 1.5% 는 아예 빠져 있었다")이 검사를 대신 만족시킨다 —
     * 변이 실측에서 실제 문구에서 이산화탄소를 지워도 초록이었다
     * (2026-07-28). 사용자에게 나가는 줄만 본다.
     */
    const codeLines = (src: string) =>
      src.split(/\r?\n/).filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');

    it('적정공기를 말하는 곳은 이산화탄소도 함께 적는다', () => {
      const bad: string[] = [];
      for (const f of files) {
        const code = codeLines(readFileSync(f, 'utf8'));
        if (!/황화수소|H₂S/.test(code)) continue;
        if (!/이산화탄소/.test(code)) bad.push(f.slice(SRC_ROOT.length + 1));
      }
      expect(bad).toEqual([]);
    });

    it('주석 제거가 실제로 작동한다 — 이 검사의 전제 확인', () => {
      expect(codeLines("// 이산화탄소\nconst x = 1;")).not.toMatch(/이산화탄소/);
      expect(codeLines("const s = '이산화탄소';")).toMatch(/이산화탄소/);
    });
  });

  it('전부 critical 로 분류돼 있다 — 인명 항목이 권고로 내려가지 않도록', () => {
    for (const id of ['cs-01', 'cs-02', 'live-03']) {
      const idx = SRC.indexOf(`id: '${id}'`);
      const block = SRC.slice(idx, idx + 700);
      expect(block).toMatch(/riskLevel:\s*'critical'/);
    }
  });
});
