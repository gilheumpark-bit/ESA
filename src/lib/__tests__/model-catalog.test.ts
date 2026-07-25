/**
 * BYOK 모델 카탈로그 정합 — 목록에 올린 모델이 실제로 쓸 수 있는가.
 *
 * 카탈로그에 모델을 추가하는 것은 절반이다. 나머지 절반은 그 모델로 요청이
 * 실제로 나가는가(샘플링 파라미터 거부)와 비용이 계산되는가(가격표)다. 실측으로
 * 이미 한 번 갈라져 있었다 — Opus 4.8 이 목록에 있는데 vision 경로가 temperature 를
 * 실어 보내 400 이 나는 상태였다. 사용자에게는 "고를 수 있는데 안 되는 모델"이다.
 */

import { PROVIDERS, getModelList, getDefaultModel } from '../ai-providers';
import { claudeAcceptsTemperature } from '@/agent/vision/vlm-client';
import { PRICING } from '@/engine/calculators/ai/token-cost';

const catalogIds = getModelList('claude').map((m) => m.id);

describe('Claude 카탈로그 — 현행 모델이 빠져 있지 않다', () => {
  it('현행 주력 Opus 5 와 최상위 Fable 5 를 제공한다', () => {
    expect(catalogIds).toContain('claude-opus-5');
    expect(catalogIds).toContain('claude-fable-5');
  });

  it('기본 모델은 카탈로그 안에 있다', () => {
    expect(catalogIds).toContain(getDefaultModel('claude'));
  });

  it('Mythos 5 는 넣지 않는다 — Project Glasswing 참여자만 접근 가능해 대부분의 BYOK 키로는 404 다', () => {
    expect(catalogIds).not.toContain('claude-mythos-5');
  });

  it('모델 ID 에 날짜 접미사를 붙이지 않는다 — 별칭이 정본이다', () => {
    for (const id of catalogIds) {
      expect(id).not.toMatch(/-\d{8}$/);
    }
  });
});

// 비용 계산기가 다루는 공급자. groq·mistral·ollama 는 의도적으로 제외돼 있어
// (무료·로컬·자체 과금) 가격 정합을 요구하지 않는다.
const PRICED_PROVIDERS = ['claude', 'gemini', 'openai'] as const;
const pricedCatalog = PRICED_PROVIDERS.flatMap((p) =>
  getModelList(p).map((m) => [p, m] as const),
);

describe('마지막 1마일 — 카탈로그에 올린 모델은 비용도 계산된다', () => {
  it.each(pricedCatalog.map(([p, m]) => [p, m.id]))(
    '%s / %s 가 비용 계산기에 등재돼 있다',
    (_provider, id) => {
      // toHaveProperty 를 쓰지 않는다 — 모델 ID 의 점("gemini-3.1-…")을 중첩 경로로
      // 해석해 항상 실패한다. Claude ID 에는 점이 없어 드러나지 않던 함정이다.
      expect(Object.keys(PRICING)).toContain(id);
      const pricing = PRICING[id as keyof typeof PRICING];
      expect(pricing.inputPer1M).toBeGreaterThan(0);
      expect(pricing.outputPer1M).toBeGreaterThan(0);
    },
  );

  it('가격표의 컨텍스트 창이 카탈로그와 일치한다', () => {
    for (const [, model] of pricedCatalog) {
      const pricing = PRICING[model.id as keyof typeof PRICING];
      expect(pricing.contextWindow).toBe(model.contextWindow);
    }
  });
});

describe('샘플링 파라미터 — 거부하는 모델에 temperature 를 보내지 않는다', () => {
  it.each(['claude-fable-5', 'claude-opus-5', 'claude-opus-4-8', 'claude-opus-4-7', 'claude-sonnet-5'])(
    '%s 는 temperature 를 받지 않는다 (보내면 400)',
    (model) => {
      expect(claudeAcceptsTemperature(model)).toBe(false);
    },
  );

  it.each([
    'claude-haiku-4-5',
    'claude-sonnet-4-6',
    'claude-opus-4-6',
    'claude-opus-4-5',
    'claude-3-sonnet',        // Claude 3 계열은 샘플링 파라미터를 받는다
    'claude-3-haiku-20240307',
  ])('%s 는 구세대라 temperature 를 그대로 받는다', (model) => {
    expect(claudeAcceptsTemperature(model)).toBe(true);
  });

  it('모르는 모델은 생략 쪽으로 닫힌다 — 생략은 항상 유효하고 전송은 400 을 만들 수 있다', () => {
    expect(claudeAcceptsTemperature('claude-opus-9')).toBe(false);
    expect(claudeAcceptsTemperature('claude-future-model')).toBe(false);
    expect(claudeAcceptsTemperature('')).toBe(false);
  });

  it('카탈로그의 모든 Claude 모델이 이 판정을 통과한다(미분류 0)', () => {
    for (const id of catalogIds) {
      expect(typeof claudeAcceptsTemperature(id)).toBe('boolean');
    }
  });
});

describe('수명주기 — 곧 끊길 모델을 선택지로 두지 않는다', () => {
  // 가격 페이지에는 종료 예고된 모델도 단가가 실려 있어 "살아 있음"과 구분되지
  // 않는다. 수명주기는 각 공급자의 deprecations 표가 정본이다.
  it('gemini-2.5-flash 를 제공하지 않는다 — 2026-10-16 종료 예고, 대체는 gemini-3.6-flash', () => {
    expect(getModelList('gemini').map((m) => m.id)).not.toContain('gemini-2.5-flash');
  });

  it('이미 종료된 프리뷰 모델을 제공하지 않는다', () => {
    const gemini = getModelList('gemini').map((m) => m.id);
    for (const dead of ['gemini-3-pro-preview', 'gemini-3.1-flash-lite-preview', 'gemini-2.0-flash']) {
      expect(gemini).not.toContain(dead);
    }
  });

  it('모든 공급자의 기본 모델이 자기 목록 안에 있다', () => {
    for (const id of Object.keys(PROVIDERS)) {
      const list = getModelList(id).map((m) => m.id);
      if (list.length === 0) continue;
      expect(list).toContain(getDefaultModel(id));
    }
  });
});

describe('공급자 목록이 비어 있지 않다', () => {
  it('gemini·openai·groq·mistral 항목이 그대로 있다', () => {
    for (const id of ['gemini', 'openai', 'groq', 'mistral']) {
      expect(PROVIDERS[id]?.models.length).toBeGreaterThan(0);
    }
  });
});
