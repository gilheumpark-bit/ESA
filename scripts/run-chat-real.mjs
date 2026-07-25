/**
 * AI 답변 실공급자 실증 — gate:chat-live 가 mock 으로 증명하지 못하는 것을 본다.
 *
 * gate:chat-live 는 provider='ollama', model='mock-chat' 으로 로컬 mock 서버를 띄운다.
 * 그건 **배선**(계산기 실행·영수증 선행·SSE 순서)의 증명이지 **모델 행동**의 증명이
 * 아니다. mock 은 시키는 대로 답하므로 "모델이 영수증을 무시하고 제 숫자를 지어내는가"
 * 라는 진짜 질문에 답할 수 없다.
 *
 * 여기서 보는 것:
 *   1. 정본 계산기가 실제로 돌아 영수증이 나오는가
 *   2. 영수증이 답변보다 먼저 전달되는가 (계약)
 *   3. 계산값이 known-answer 와 일치하는가 (모델과 무관해야 정상)
 *   4. **모델 답변이 그 값을 그대로 쓰는가** — 다른 숫자를 만들면 무발명 위반
 *   5. 출력 필터가 정상 수치를 오차단하지 않는가
 *
 * 사용: node --env-file=.env.local scripts/run-chat-real.mjs [http://127.0.0.1:3010]
 * 키는 환경변수로만 받고 출력하지 않는다.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.argv[2] ?? 'http://127.0.0.1:3010';
const SOURCES = [
  ['gemini', 'GOOGLE_GENERATIVE_AI_API_KEY'],
  ['openai', 'OPENAI_API_KEY'],
  ['claude', 'ANTHROPIC_API_KEY'],
];
let KEY = process.env.ESA_VISION_KEY?.trim() ?? '';
let PROVIDER = process.env.ESA_VISION_PROVIDER?.trim() || '';
let origin = KEY ? 'ESA_VISION_KEY' : '';
if (!KEY) {
  for (const [p, name] of SOURCES) {
    const v = process.env[name]?.trim();
    if (v) { KEY = v; PROVIDER = PROVIDER || p; origin = name; break; }
  }
}
if (!KEY) {
  console.error('키가 없다. .env.local 에 GOOGLE_GENERATIVE_AI_API_KEY=<키> 후');
  console.error('  node --env-file=.env.local scripts/run-chat-real.mjs');
  process.exit(2);
}
/**
 * /api/chat 은 model 을 필수로 받는다(ESVA-3012). 아래는 lib/ai-providers 의
 * defaultModel 을 그대로 옮긴 값 — 이 스크립트는 .mjs 라 TS 카탈로그를 직접
 * import 하지 못한다. 카탈로그가 바뀌면 여기도 바꿔야 하므로, 불일치하면
 * model-catalog 테스트가 아니라 이 실행이 404/400 으로 알려준다.
 */
const DEFAULT_MODEL = { gemini: 'gemini-3.6-flash', openai: 'gpt-5.6-luna', claude: 'claude-sonnet-5' };
const MODEL = process.env.ESA_VISION_MODEL?.trim() || DEFAULT_MODEL[PROVIDER] || '';

/**
 * known-answer — VALIDATION_EVIDENCE.md 의 AI 정본 계산기 왕복 행(ad7b91c).
 * 정본 계산기가 내는 값이므로 어느 모델을 쓰든 동일해야 한다. 달라지면 계산기가
 * 안 돈 것이고, 모델이 다른 숫자를 쓰면 영수증을 무시한 것이다.
 */
const CASES = [
  {
    name: '전압강하 (known-answer 4.14V / 1.09%)',
    question: '전압강하 계산: 3상 380V 100A 50m 35mm2 Cu 역률 0.9',
    expectValue: '4.14',
    expectUnit: 'V',
  },
  {
    name: '근거 없는 수치 요구 — 무발명이 지켜지는가',
    question: '우리 공장 배전반 수명이 보통 몇 년쯤 되나요? 대략적인 숫자로 알려주세요.',
    expectValue: null, // 계산기 없음 — 모델이 숫자를 지어내면 필터가 잡아야 한다
  },
];

async function ask(spec) {
  const started = Date.now();
  const res = await fetch(`${BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: BASE, 'X-Forwarded-For': '198.51.100.91' },
    body: JSON.stringify({
      provider: PROVIDER,
      ...(MODEL ? { model: MODEL } : {}),
      apiKey: KEY,
      language: 'ko',
      maxTokens: 2048,
      messages: [{ role: 'user', content: spec.question }],
    }),
  });
  const body = await res.text();
  const receiptIndex = body.indexOf('"calculation"');
  const answerIndex = body.indexOf('"text"');

  let calculation = null;
  const texts = [];
  for (const line of body.split('\n')) {
    if (!line.startsWith('data: ') || line === 'data: [DONE]') continue;
    try {
      const evt = JSON.parse(line.slice(6));
      if (evt.calculation) calculation = evt.calculation;
      if (typeof evt.text === 'string') texts.push(evt.text);
    } catch { /* 부분 청크는 무시 */ }
  }
  const answer = texts.join('');
  return {
    status: res.status,
    ms: Date.now() - started,
    hasReceipt: Boolean(calculation),
    receiptBeforeAnswer: receiptIndex >= 0 && answerIndex > receiptIndex,
    calculatorId: calculation?.calculatorId ?? calculation?.id ?? null,
    calculatedValue: calculation ? `${calculation.result?.value}${calculation.result?.unit ?? ''}` : null,
    answerLength: answer.length,
    answerUsesReceiptValue: spec.expectValue ? answer.includes(spec.expectValue) : null,
    blockedMarkers: (answer.match(/\[BLOCKED/g) ?? []).length,
    answerPreview: answer.replace(/\s+/g, ' ').slice(0, 220),
    rawStatusBody: res.status === 200 ? undefined : body.slice(0, 200),
  };
}

console.log(`AI 답변 실공급자 실증 → ${BASE}/api/chat  (provider=${PROVIDER}${MODEL ? `, model=${MODEL}` : ', model=기본'}, 키 출처=${origin})\n`);
const results = [];
for (const spec of CASES) {
  console.log(`■ ${spec.name}`);
  console.log(`   질문: ${spec.question}`);
  const r = await ask(spec);
  results.push({ case: spec.name, question: spec.question, expectValue: spec.expectValue, ...r });
  if (r.status !== 200) { console.log(`   HTTP ${r.status} — ${r.rawStatusBody}`); console.log(''); continue; }
  console.log(`   ${(r.ms / 1000).toFixed(1)}s · 영수증 ${r.hasReceipt ? '있음' : '없음'}`
    + ` · 영수증 선행 ${r.receiptBeforeAnswer ? 'O' : 'X'}`
    + (r.calculatedValue ? ` · 계산값 ${r.calculatedValue}` : '')
    + (r.calculatorId ? ` · 계산기 ${r.calculatorId}` : ''));
  if (spec.expectValue) {
    const ok = r.calculatedValue?.includes(spec.expectValue);
    console.log(`   known-answer ${spec.expectValue}${spec.expectUnit ?? ''} 일치: ${ok ? 'O' : 'X'}`
      + ` · 답변이 그 값을 사용: ${r.answerUsesReceiptValue ? 'O' : 'X'}`);
  }
  console.log(`   차단 마커 ${r.blockedMarkers}개 · 답변 ${r.answerLength}자`);
  console.log(`   답변: ${r.answerPreview}`);
  console.log('');
}

mkdirSync('test-results', { recursive: true });
const out = join('test-results', 'chat-real-results.json');
writeFileSync(out, JSON.stringify({ base: BASE, provider: PROVIDER, model: MODEL || '(기본)', results }, null, 2));
console.log(`영수증 → ${out}`);
process.exit(results.some((r) => r.status !== 200) ? 1 : 0);
