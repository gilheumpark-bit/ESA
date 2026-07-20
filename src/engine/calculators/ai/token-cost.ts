/**
 * AI Token Cost Calculator
 *
 * Formulae:
 *   Cost per request = (inputTokens x inputPrice + outputTokens x outputPrice) / 1_000_000
 *   Daily cost       = costPerRequest x requestCount
 *   Monthly cost     = dailyCost x 30
 *
 * Pricing as of 2026-07-20 — 공식 출처에서만 기입(추정 금지):
 *   OpenAI: developers.openai.com/api/docs/pricing
 *   Anthropic: platform.claude.com/docs (Opus 4.8 $5/$25 · Sonnet 5 $3/$15 표준가 · Haiku 4.5 $1/$5)
 *   Google: ai.google.dev/gemini-api/docs/pricing
 */

import { createSource, createJudgment } from '@engine/sjc/types';
import {
  DetailedCalcResult,
  CalcStep,
  assertPositive,
  assertOneOf,
  assertNonNegative,
  round,
} from '../types';

// -- Input / Output ----------------------------------------------------------

export type AIModel =
  | 'gpt-5.6-sol'
  | 'gpt-5.6-terra'
  | 'gpt-5.6-luna'
  | 'gpt-5.5'
  | 'gpt-5.4'
  | 'gpt-5.4-mini'
  | 'gpt-5.4-nano'
  | 'claude-opus-4-8'
  | 'claude-sonnet-5'
  | 'claude-haiku-4-5'
  | 'gemini-3.1-pro-preview'
  | 'gemini-3.5-flash'
  | 'gemini-3.1-flash-lite';

export interface TokenCostInput {
  /** AI model identifier */
  model: AIModel;
  /** Number of input tokens per request */
  inputTokens: number;
  /** Number of output tokens per request */
  outputTokens: number;
  /** Number of requests per day */
  requestCount: number;
}

// -- Pricing table (USD per 1M tokens, 2026-Q1) ----

interface ModelPricing {
  name: string;
  provider: string;
  inputPer1M: number;   // USD per 1M input tokens
  outputPer1M: number;  // USD per 1M output tokens
  contextWindow: number;
  longContext?: {
    threshold: number;
    inputPer1M: number;
    outputPer1M: number;
  };
}

const PRICING: Record<AIModel, ModelPricing> = {
  // OpenAI — developers.openai.com/api/docs/pricing (2026-07-20 캡처).
  // GPT-5.6은 272K 입력 초과 시 요청 전체에 2x input / 1.5x output 요율.
  'gpt-5.6-sol': {
    name: 'GPT-5.6 Sol', provider: 'OpenAI', inputPer1M: 5, outputPer1M: 30,
    contextWindow: 1_050_000,
    longContext: { threshold: 272_000, inputPer1M: 10, outputPer1M: 45 },
  },
  'gpt-5.6-terra': {
    name: 'GPT-5.6 Terra', provider: 'OpenAI', inputPer1M: 2.5, outputPer1M: 15,
    contextWindow: 1_050_000,
    longContext: { threshold: 272_000, inputPer1M: 5, outputPer1M: 22.5 },
  },
  'gpt-5.6-luna': {
    name: 'GPT-5.6 Luna', provider: 'OpenAI', inputPer1M: 1, outputPer1M: 6,
    contextWindow: 1_050_000,
    longContext: { threshold: 272_000, inputPer1M: 2, outputPer1M: 9 },
  },
  'gpt-5.5': {
    name: 'GPT-5.5',
    provider: 'OpenAI',
    inputPer1M: 5.00,
    outputPer1M: 30.00,
    contextWindow: 400000,
  },
  'gpt-5.4': {
    name: 'GPT-5.4',
    provider: 'OpenAI',
    inputPer1M: 2.50,
    outputPer1M: 15.00,
    contextWindow: 400000,
  },
  'gpt-5.4-mini': {
    name: 'GPT-5.4 Mini',
    provider: 'OpenAI',
    inputPer1M: 0.75,
    outputPer1M: 4.50,
    contextWindow: 400000,
  },
  'gpt-5.4-nano': {
    name: 'GPT-5.4 Nano',
    provider: 'OpenAI',
    inputPer1M: 0.20,
    outputPer1M: 1.25,
    contextWindow: 400000,
  },
  // Anthropic — 공식 모델 카탈로그 (Sonnet 5는 표준가 기입; 2026-08-31까지 인트로 $2/$10 별도).
  'claude-opus-4-8': {
    name: 'Claude Opus 4.8',
    provider: 'Anthropic',
    inputPer1M: 5.00,
    outputPer1M: 25.00,
    contextWindow: 1000000,
  },
  'claude-sonnet-5': {
    name: 'Claude Sonnet 5',
    provider: 'Anthropic',
    inputPer1M: 3.00,
    outputPer1M: 15.00,
    contextWindow: 1000000,
  },
  'claude-haiku-4-5': {
    name: 'Claude Haiku 4.5',
    provider: 'Anthropic',
    inputPer1M: 1.00,
    outputPer1M: 5.00,
    contextWindow: 200000,
  },
  // Google — ai.google.dev/gemini-api/docs/pricing (2026-07-20 캡처).
  'gemini-3.1-pro-preview': {
    name: 'Gemini 3.1 Pro (Preview)',
    provider: 'Google',
    inputPer1M: 2.00,
    outputPer1M: 12.00,
    contextWindow: 1048576,
    longContext: { threshold: 200_000, inputPer1M: 4, outputPer1M: 18 },
  },
  'gemini-3.5-flash': {
    name: 'Gemini 3.5 Flash',
    provider: 'Google',
    inputPer1M: 1.50,
    outputPer1M: 9.00,
    contextWindow: 1048576,
  },
  'gemini-3.1-flash-lite': {
    name: 'Gemini 3.1 Flash-Lite',
    provider: 'Google',
    inputPer1M: 0.25,
    outputPer1M: 1.50,
    contextWindow: 1048576,
  },
};

const ALL_MODELS = Object.keys(PRICING) as AIModel[];

function effectiveRates(pricing: ModelPricing, inputTokens: number): {
  inputPer1M: number;
  outputPer1M: number;
  longContext: boolean;
} {
  if (pricing.longContext && inputTokens > pricing.longContext.threshold) {
    return { ...pricing.longContext, longContext: true };
  }
  return { inputPer1M: pricing.inputPer1M, outputPer1M: pricing.outputPer1M, longContext: false };
}

// -- Calculator --------------------------------------------------------------

export function calculateTokenCost(input: TokenCostInput): DetailedCalcResult {
  // PART 1 -- Validation
  assertOneOf(input.model, ALL_MODELS, 'model');
  assertNonNegative(input.inputTokens, 'inputTokens');
  assertNonNegative(input.outputTokens, 'outputTokens');
  assertPositive(input.requestCount, 'requestCount');

  const { model, inputTokens, outputTokens, requestCount } = input;
  const pricing = PRICING[model];
  const rates = effectiveRates(pricing, inputTokens);

  // PART 2 -- Derivation
  const steps: CalcStep[] = [];

  // Step 1: Input token cost
  const inputCost = (inputTokens * rates.inputPer1M) / 1_000_000;
  steps.push({
    step: 1,
    title: '입력 토큰 비용 (Input token cost)',
    formula: 'C_{in} = tokens_{in} \\times price_{in} / 10^6',
    value: round(inputCost, 6),
    unit: 'USD',
  });

  // Step 2: Output token cost
  const outputCost = (outputTokens * rates.outputPer1M) / 1_000_000;
  steps.push({
    step: 2,
    title: '출력 토큰 비용 (Output token cost)',
    formula: 'C_{out} = tokens_{out} \\times price_{out} / 10^6',
    value: round(outputCost, 6),
    unit: 'USD',
  });

  // Step 3: Cost per request
  const costPerRequest = inputCost + outputCost;
  steps.push({
    step: 3,
    title: '요청당 비용 (Cost per request)',
    formula: 'C_{req} = C_{in} + C_{out}',
    value: round(costPerRequest, 6),
    unit: 'USD',
  });

  // Step 4: Daily cost
  const dailyCost = costPerRequest * requestCount;
  steps.push({
    step: 4,
    title: '일 비용 (Daily cost)',
    formula: 'C_{day} = C_{req} \\times N_{requests}',
    value: round(dailyCost, 4),
    unit: 'USD',
  });

  // Step 5: Monthly cost (30 days)
  const monthlyCost = dailyCost * 30;
  steps.push({
    step: 5,
    title: '월 비용 (Monthly cost, 30 days)',
    formula: 'C_{month} = C_{day} \\times 30',
    value: round(monthlyCost, 2),
    unit: 'USD',
  });

  // Step 6: Cross-model comparison
  const comparisons: { model: string; costPerReq: number; monthlyCost: number }[] = [];
  let stepNum = 6;
  for (const m of ALL_MODELS) {
    const p = PRICING[m];
    const comparisonRates = effectiveRates(p, inputTokens);
    const cpr = (inputTokens * comparisonRates.inputPer1M + outputTokens * comparisonRates.outputPer1M) / 1_000_000;
    const mc = cpr * requestCount * 30;
    comparisons.push({ model: p.name, costPerReq: round(cpr, 6), monthlyCost: round(mc, 2) });
  }

  // Show cheapest and most expensive
  const sorted = [...comparisons].sort((a, b) => a.monthlyCost - b.monthlyCost);
  const cheapest = sorted[0];
  const _mostExpensive = sorted[sorted.length - 1];

  steps.push({
    step: stepNum,
    title: '최저가 모델 (Cheapest model)',
    formula: `\\text{${cheapest.model}}`,
    value: cheapest.monthlyCost,
    unit: 'USD/month',
  });

  // PART 3 -- Result assembly
  return {
    value: round(costPerRequest, 6),
    unit: 'USD',
    formula: 'C = (T_{in} \\times P_{in} + T_{out} \\times P_{out}) / 10^6',
    steps,
    source: [createSource('Provider', `${pricing.provider} API Pricing`, { edition: '2026-07-20' })],
    judgment: createJudgment(
      true,
      `${pricing.name}: $${round(costPerRequest, 4)}/req, $${round(dailyCost, 2)}/day, $${round(monthlyCost, 2)}/month${rates.longContext ? ' (장문 입력 요율 적용)' : ''} (최저: ${cheapest.model} $${cheapest.monthlyCost}/mo)`,
      monthlyCost > 1000 ? 'warning' : 'info',
    ),
    additionalOutputs: {
      costPerRequest: { value: round(costPerRequest, 6), unit: 'USD' },
      dailyCost: { value: round(dailyCost, 4), unit: 'USD' },
      monthlyCost: { value: round(monthlyCost, 2), unit: 'USD' },
      cheapestModel: { value: cheapest.monthlyCost, unit: `USD/month (${cheapest.model})` },
    },
  };
}
