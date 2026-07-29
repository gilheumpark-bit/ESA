import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { measureTextQuality, TEXT_QUALITY_THRESHOLDS } from '../drawing-text-quality';

/**
 * **글자 선명도 판정** — 교보재의 알려진 판독 결과에 결박한다.
 *
 * 보정점은 KIMM p5 한 쌍이다. 같은 도면을 두 단계로 저하시킨 것이고,
 * **글자를 읽었나가 명확히 갈린 유일한 케이스**다:
 *
 *   scan-light  → 변압기 용량 500/1000/1000kVA **3/3 정확**
 *   scan-heavy  → 같은 변압기를 300kVA · 1000kVA 로 **두 번 다르게** 읽음
 *
 * 다른 실패(연결 0·차단기 수 감소)는 **선** 문제라 이 축의 보정점이 아니다.
 *
 * 교보재는 gitignore 대상이라 CI 에는 없다. 없으면 건너뛰되 **건너뛴 사실을
 * 남긴다** — 조용히 통과하면 이 검사가 있다는 것만으로 안심하게 된다.
 */

const RASTER = join(process.cwd(), 'fixtures', 'drawings', 'realworld', 'raster');
const KIMM_P5_LIGHT = join(RASTER, 'kimm-20210602-design-p5-scan-light.png');
const KIMM_P5_HEAVY = join(RASTER, 'kimm-20210602-design-p5-scan-heavy.png');
const WIKI = join(process.cwd(), 'fixtures', 'drawings', 'external', 'wiki-oneline.png');

const hasFixtures = existsSync(KIMM_P5_LIGHT) && existsSync(KIMM_P5_HEAVY);

jest.setTimeout(120000);

describe('임계 상수 자체', () => {
  it('poor < good 이고 둘 다 관측 구간 안이다', () => {
    // 관측: 실패 56.8 · 성공 64.5. 임계가 이 밖으로 나가면 보정점과 무관해진다.
    expect(TEXT_QUALITY_THRESHOLDS.poor).toBeGreaterThan(56.8);
    expect(TEXT_QUALITY_THRESHOLDS.poor).toBeLessThanOrEqual(64.5);
    expect(TEXT_QUALITY_THRESHOLDS.good).toBeGreaterThan(TEXT_QUALITY_THRESHOLDS.poor);
  });
});

(hasFixtures ? describe : describe.skip)('보정점 — 알려진 판독 결과에 결박', () => {
  it('스펙을 잘못 읽은 이미지는 poor 로 판정한다', async () => {
    const r = await measureTextQuality(new Uint8Array(readFileSync(KIMM_P5_HEAVY)));
    expect(r.grade).toBe('poor');
    // 문구가 사용자에게 무엇을 하지 말라고 말하는지 — 등급만 맞으면 소용없다.
    expect(r.reason).toMatch(/스펙 수치를 이 결과로 확정하지 마십시오/);
  });

  it('스펙을 정확히 읽은 이미지는 poor 가 아니다', async () => {
    const r = await measureTextQuality(new Uint8Array(readFileSync(KIMM_P5_LIGHT)));
    expect(r.grade).not.toBe('poor');
  });

  /** 두 이미지가 실제로 갈려야 판정에 의미가 있다 — 같은 값이면 축이 죽은 것. */
  it('두 보정점의 선명도가 실제로 갈린다', async () => {
    const [heavy, light] = await Promise.all([
      measureTextQuality(new Uint8Array(readFileSync(KIMM_P5_HEAVY))),
      measureTextQuality(new Uint8Array(readFileSync(KIMM_P5_LIGHT))),
    ]);
    expect(light.strokeSharpness).toBeGreaterThan(heavy.strokeSharpness);
  });
});

(existsSync(WIKI) ? describe : describe.skip)('과차단 방지', () => {
  /**
   * `wiki-oneline` 은 전체 이미지 선명도가 최하위권(596)인데 모델 실측에서
   * 기기 14/14 · 연결 13/13 으로 완독된 도면이다. 글자가 크기 때문이다.
   * **전체 선명도로 판정했다면 이 도면을 거부했을 것이다.**
   */
  it('글자가 큰 도면은 전체 선명도가 낮아도 good 이다', async () => {
    const r = await measureTextQuality(new Uint8Array(readFileSync(WIKI)));
    expect(r.grade).toBe('good');
    expect(r.glyphHeightMedian).toBeGreaterThan(20);
  });
});

describe('글자를 못 찾으면 좋다고 말하지 않는다', () => {
  /** 단색 이미지 — 글자 성분 0. 이때 good 을 내면 빈 도면이 통과한다. */
  it('빈 이미지는 good 이 아니다', async () => {
    const sharp = (await import('sharp')).default;
    const blank = await sharp({
      create: { width: 800, height: 600, channels: 3, background: { r: 255, g: 255, b: 255 } },
    }).png().toBuffer();
    const r = await measureTextQuality(new Uint8Array(blank));
    expect(r.grade).not.toBe('good');
    expect(r.reason).toMatch(/판정할 근거가 부족/);
  });
});

describe('라우트가 이 판정을 실제로 실어 보낸다', () => {
  /**
   * 재는 것과 **보내는 것**은 다르다. 이 리포에서 "만들었는데 아무도 안 쓰는"
   * 방어가 반복해서 났다(§2.2). 소스 훑기지만 라우트를 실행하려면 실키가
   * 필요해 여기서는 배선 존재만 확인한다 — 그 한계를 적어 둔다.
   */
  const route = readFileSync(join(process.cwd(), 'src', 'app', 'api', 'sld', 'route.ts'), 'utf8');

  it('AI 호출 전에 잰다', () => {
    const measured = route.indexOf('measureTextQuality(bytes)');
    const analyzed = route.indexOf('analyzeSLD(blob');
    expect(measured).toBeGreaterThan(-1);
    expect(analyzed).toBeGreaterThan(-1);
    expect(measured).toBeLessThan(analyzed);
  });

  it('응답에 실어 보낸다', () => {
    expect(route).toMatch(/^\s*textQuality,$/m);
  });
});
