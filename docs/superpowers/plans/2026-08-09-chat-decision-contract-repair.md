# Chat Decision Contract Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 일반 AI 답변이 판단 책임을 사용자에게 넘기면 같은 모델로 한 번만 교정하고, 재실패 시 원답을 노출하지 않는 실패 폐쇄 계약을 구현한다.

**Architecture:** 책임 전가 검출·교정 프롬프트·폴백은 공급자와 무관한 순수 모듈로 분리한다. `/api/chat`은 첫 생성 결과를 검사하고 위반일 때만 기존 공급자 디스패치를 한 번 재사용하며, 최종 선택 답변에 기존 수치·출처 필터를 적용한 뒤 SSE로 보낸다.

**Tech Stack:** TypeScript, Next.js Route Handler, Vercel AI SDK, Jest, 기존 `token-budget`·`output-filter` 모듈

## Global Constraints

- 정상 답변에는 추가 모델 호출을 만들지 않는다.
- 교정 호출은 동일 공급자·동일 모델에서 최대 1회만 허용한다.
- 서버 키 교정 호출은 별도 토큰을 예약·정산하고, 예산이 없으면 호출하지 않는다.
- 교정 전 원답은 계약 위반 상태에서 SSE 경계를 넘지 않는다.
- 기존 수치·출처 필터는 최종 선택 답변 뒤에 실행한다.
- 로그에 사용자 질문·원답·교정답·API 키를 새로 남기지 않는다.
- 도면 V3 결정론적 제안과 공급자 카탈로그는 변경하지 않는다.

---

### Task 1: 판단 책임 계약 순수 모듈

**Files:**
- Create: `src/lib/chat-decision-contract.ts`
- Create: `src/lib/__tests__/chat-decision-contract.test.ts`

**Interfaces:**
- Produces: `inspectDecisionContract(text: string, language: 'ko' | 'en'): DecisionContractInspection`
- Produces: `buildDecisionRepairPrompt(query: string, answer: string, language: 'ko' | 'en'): DecisionRepairPrompt`
- Produces: `buildDecisionContractFallback(language: 'ko' | 'en'): string`
- Produces: `DecisionContractInspection`, `DecisionContractViolation`, `DecisionRepairPrompt`

- [ ] **Step 1: 검출 계약의 실패 테스트 작성**

```ts
import {
  buildDecisionContractFallback,
  buildDecisionRepairPrompt,
  inspectDecisionContract,
} from '../chat-decision-contract';

describe('chat decision contract', () => {
  test.each([
    '몇 개인지 사용자가 판단해 주세요.',
    '어느 쪽이 맞는지 직접 선택해 주세요.',
    '계통전압 값을 알려 주시면 판단하겠습니다.',
  ])('판단 책임 전가를 검출한다: %s', (answer) => {
    expect(inspectDecisionContract(answer, 'ko').passed).toBe(false);
  });

  test.each([
    'ESA 잠정 판단: VCB 가능성이 가장 높습니다. 결론 변경 조건: 원본의 기호 접점.',
    '현행 KEC 원문과 대조한 뒤 작업하십시오.',
    '사용자가 물은 “몇 개인가요?”에 대해 현재 판독은 세 개입니다.',
  ])('정상 판단·안전 지시·인용 질문은 통과한다: %s', (answer) => {
    expect(inspectDecisionContract(answer, 'ko').passed).toBe(true);
  });

  test('영어 책임 전가를 검출한다', () => {
    expect(inspectDecisionContract('You need to decide which symbol it is.', 'en').passed).toBe(false);
  });

  test('교정 프롬프트는 질문형 인계와 새 수치 생성을 금지한다', () => {
    const prompt = buildDecisionRepairPrompt('이 기호가 뭐야?', '직접 판단해 주세요.', 'ko');
    expect(prompt.instructions).toContain('ESA 잠정 판단');
    expect(prompt.instructions).toContain('새 수치');
    expect(prompt.input).toContain('<untrusted_answer>');
  });

  test('폴백은 해당 판단만 보류하고 나머지 분석을 유지한다', () => {
    const fallback = buildDecisionContractFallback('ko');
    expect(fallback).toContain('판단 미완결');
    expect(fallback).toContain('나머지 분석은 유지');
    expect(inspectDecisionContract(fallback, 'ko').passed).toBe(true);
  });
});
```

- [ ] **Step 2: 테스트를 실행해 RED 확인**

Run: `npm test -- --runInBand src/lib/__tests__/chat-decision-contract.test.ts`

Expected: FAIL because `chat-decision-contract` does not exist.

- [ ] **Step 3: 최소 순수 구현 작성**

```ts
export type DecisionContractViolationKind = 'delegated_judgment' | 'reverse_input_question';

export interface DecisionContractViolation {
  kind: DecisionContractViolationKind;
  text: string;
  index: number;
}

export interface DecisionContractInspection {
  passed: boolean;
  violations: DecisionContractViolation[];
}

export interface DecisionRepairPrompt {
  instructions: string;
  input: string;
}

export function inspectDecisionContract(
  text: string,
  language: 'ko' | 'en',
): DecisionContractInspection {
  // 따옴표 안의 질문 재진술은 제외하고, 판단·결정·선택 위임과
  // 결론 입력을 사용자에게 요구하는 문장만 위치와 함께 반환한다.
}

export function buildDecisionRepairPrompt(
  query: string,
  answer: string,
  language: 'ko' | 'en',
): DecisionRepairPrompt {
  // 원질문과 원답을 각각 untrusted XML 경계에 넣고 새 사실·수치·조항 금지,
  // ESA 잠정 판단·근거·결론 변경 조건 형식을 지시한다.
}

export function buildDecisionContractFallback(language: 'ko' | 'en'): string {
  // 질문 없이 판단 미완결·국소 보류·나머지 분석 유지 문장을 반환한다.
}
```

- [ ] **Step 4: 단위 테스트 GREEN 확인**

Run: `npm test -- --runInBand src/lib/__tests__/chat-decision-contract.test.ts`

Expected: 1 suite PASS, all tests PASS.

- [ ] **Step 5: 첫 구현 커밋**

```powershell
git add src/lib/chat-decision-contract.ts src/lib/__tests__/chat-decision-contract.test.ts
git commit -m "feat(chat): add decision responsibility contract"
```

---

### Task 2: 공급자 생성 재사용과 1회 교정

**Files:**
- Modify: `src/app/api/chat/route.ts`
- Create: `src/app/api/chat/__tests__/decision-contract.test.ts`

**Interfaces:**
- Consumes: Task 1의 `inspectDecisionContract`, `buildDecisionRepairPrompt`, `buildDecisionContractFallback`
- Produces: 내부 `GenerationResult = { text: string; finishReason: unknown; totalTokens?: number }`
- Produces: 내부 `generateChatText(...) => Promise<GenerationResult>`
- Produces: SSE `filter.decisionContract = { passed, repairAttempted, repairSucceeded, violationCount }`

- [ ] **Step 1: 정상 1회·위반 2회·재실패 폴백의 실패 테스트 작성**

```ts
test('정상 답변은 모델을 한 번만 호출한다', async () => {
  streamTextMock.mockImplementationOnce(() => generation('ESA 판단: 현재 근거로 정상입니다.'));
  const body = await readSse(await POST(request('질문')));
  expect(streamTextMock).toHaveBeenCalledTimes(1);
  expect(body).toContain('현재 근거로 정상');
});

test('책임 전가 답변은 같은 모델로 한 번 교정하고 원답을 숨긴다', async () => {
  streamTextMock
    .mockImplementationOnce(() => generation('몇 개인지 사용자가 판단해 주세요.'))
    .mockImplementationOnce(() => generation('ESA 잠정 판단: 세 개로 판독합니다. 결론 변경 조건: 원본 경계.'));
  const body = await readSse(await POST(request('몇 개야?')));
  expect(streamTextMock).toHaveBeenCalledTimes(2);
  expect(body).not.toContain('사용자가 판단');
  expect(body).toContain('ESA 잠정 판단');
});

test('교정도 책임을 넘기면 원답과 교정답을 숨기고 폴백한다', async () => {
  streamTextMock
    .mockImplementationOnce(() => generation('직접 선택해 주세요.'))
    .mockImplementationOnce(() => generation('사용자가 결정해 주세요.'));
  const body = await readSse(await POST(request('무엇이 맞아?')));
  expect(streamTextMock).toHaveBeenCalledTimes(2);
  expect(body).not.toContain('직접 선택');
  expect(body).not.toContain('사용자가 결정');
  expect(body).toContain('판단 미완결');
});
```

- [ ] **Step 2: 라우트 테스트 RED 확인**

Run: `npm test -- --runInBand src/app/api/chat/__tests__/decision-contract.test.ts`

Expected: normal case may pass, responsibility-transfer cases FAIL because no repair call exists.

- [ ] **Step 3: 생성 코드를 `generateChatText`로 분리**

```ts
interface GenerationResult {
  text: string;
  finishReason: unknown;
  totalTokens?: number;
}

async function generateChatText(params: {
  provider: string;
  model: string;
  messages: ChatMessage[];
  systemPrompt?: string;
  apiKey: string;
  temperature: number;
  maxTokens: number;
  onpremBaseUrl?: string;
  signal?: AbortSignal;
}): Promise<GenerationResult> {
  // 기존 chatgpt-local 및 Vercel AI SDK 공급자 switch를 그대로 옮긴다.
}
```

- [ ] **Step 4: 최대 1회 교정과 폴백 선택 구현**

```ts
const first = await generateChatText(firstRequest);
const firstInspection = inspectDecisionContract(first.text, language);
let selected = first;
let repairAttempted = false;
let repairSucceeded = false;

if (!firstInspection.passed && !signal?.aborted) {
  repairAttempted = true;
  const repair = buildDecisionRepairPrompt(lastUserQuery, first.text, language);
  const second = await generateChatText({
    ...firstRequest,
    messages: [{ role: 'user', content: repair.input }],
    systemPrompt: repair.instructions,
    maxTokens: Math.min(maxTokens, 2_048),
  });
  if (inspectDecisionContract(second.text, language).passed) {
    selected = second;
    repairSucceeded = true;
  } else {
    selected = { text: buildDecisionContractFallback(language), finishReason: 'decision-contract-fallback' };
  }
}
```

예외 처리에서 교정 호출 실패는 잡아서 폴백으로 전환한다. 최초 생성 실패는 기존 오류 동작을 유지한다.

- [ ] **Step 5: 최종 선택 답변에만 기존 출력 필터 적용**

```ts
const filtered = filterLLMOutput(
  selected.text,
  [],
  trustedInput,
  attestedSources,
);
```

로그와 SSE 메타데이터에는 내용 없이 boolean·count만 기록한다.

- [ ] **Step 6: 라우트 테스트 GREEN과 기존 공급자 회귀 확인**

Run: `npm test -- --runInBand src/app/api/chat/__tests__/decision-contract.test.ts src/app/api/chat/__tests__/provider-dispatch.test.ts src/app/api/chat/__tests__/chatgpt-local-dispatch.test.ts src/app/api/chat/__tests__/onpremise-security.test.ts`

Expected: all suites PASS; normal provider assertions remain one call.

- [ ] **Step 7: 라우트 구현 커밋**

```powershell
git add src/app/api/chat/route.ts src/app/api/chat/__tests__/decision-contract.test.ts
git commit -m "feat(chat): repair decision-deflecting answers once"
```

---

### Task 3: 교정 호출 서버 예산과 실패 폐쇄

**Files:**
- Modify: `src/app/api/chat/route.ts`
- Modify: `src/app/api/chat/__tests__/token-budget.test.ts`
- Modify: `src/app/api/chat/__tests__/decision-contract.test.ts`

**Interfaces:**
- Consumes: `checkTokenBudget`, `settleTokenUsage`, `estimateTokens`
- Produces: 내부 `RepairBudget = { reserve(estimatedTokens: number): ((actualTokens?: number) => void) | null }`

- [ ] **Step 1: 서버 키 예산·BYOK·예산 거절 테스트 작성**

```ts
test('서버 키 교정 호출은 별도 예약하고 실제 토큰으로 정산한다', async () => {
  // 첫 답변 위반, 둘째 답변 통과, usage 값을 서로 다르게 설정한다.
  // 응답 후 남은 예산이 두 호출의 실제 사용량을 반영하는지 확인한다.
});

test('교정 예산이 없으면 두 번째 호출 없이 폴백한다', async () => {
  // 첫 호출 직후 남은 예산보다 repair estimate가 크도록 예산을 채운다.
  expect(streamTextMock).toHaveBeenCalledTimes(1);
  expect(body).toContain('판단 미완결');
});

test('BYOK 교정은 서버 토큰 예산을 차감하지 않는다', async () => {
  // apiKey를 요청에 넣고 위반→교정 응답을 만든다.
  expect(streamTextMock).toHaveBeenCalledTimes(2);
  expect(serverBudgetAfter).toBe(serverBudgetBefore);
});
```

- [ ] **Step 2: 예산 테스트 RED 확인**

Run: `npm test -- --runInBand src/app/api/chat/__tests__/token-budget.test.ts src/app/api/chat/__tests__/decision-contract.test.ts`

Expected: FAIL because repair reservation is not separated.

- [ ] **Step 3: 위반 시점 별도 예약 콜백 구현**

```ts
interface RepairBudget {
  reserve(estimatedTokens: number): ((actualTokens?: number) => void) | null;
}

const repairBudget: RepairBudget | undefined = usesServerKey
  ? {
      reserve(estimatedTokens) {
        const reservation = checkTokenBudget(ip, estimatedTokens);
        budgetRemaining = reservation.remaining;
        if (!reservation.allowed) return null;
        return (actualTokens) => {
          if (actualTokens !== undefined) settleTokenUsage(ip, estimatedTokens, actualTokens);
        };
      },
    }
  : undefined;
```

교정 프롬프트와 `min(maxTokens, 2048)`을 `estimateTokens`로 계산한다. 예약이 거절되면 교정 공급자 호출을 시작하지 않는다.

- [ ] **Step 4: 예산 테스트 GREEN 확인**

Run: `npm test -- --runInBand src/app/api/chat/__tests__/token-budget.test.ts src/app/api/chat/__tests__/decision-contract.test.ts`

Expected: all tests PASS; repair is capped at one call and server/BYOK accounting differs as designed.

- [ ] **Step 5: 예산 수리 커밋**

```powershell
git add src/app/api/chat/route.ts src/app/api/chat/__tests__/token-budget.test.ts src/app/api/chat/__tests__/decision-contract.test.ts
git commit -m "fix(chat): meter decision repair calls separately"
```

---

### Task 4: 문서·생산 배선·전체 출고 검증

**Files:**
- Modify: `README.md`
- Modify: `docs/USER_GUIDE.md`
- Modify: `PROJECT_STATE.md`
- Modify: `docs/superpowers/README.md`
- Modify: this plan checkboxes as tasks complete

**Interfaces:**
- Consumes: Task 1~3의 확정 동작과 SSE 메타데이터
- Produces: 사용자 설명, 현재 프로젝트 상태, 재현 가능한 검증 영수증

- [ ] **Step 1: 문서에 실제 동작과 비용 경계를 기록**

README와 사용자 가이드에 다음 사실을 쓴다.

```text
정상 답변은 한 번 호출한다. 판단을 사용자에게 넘기는 답변만 같은 모델로 한 번 교정한다.
교정도 실패하거나 서버 예산이 없으면 원답을 표시하지 않고 판단 미완결로 닫는다.
```

PROJECT_STATE 완료 항목에 production caller, 최대 1회 교정, 최종 출력 필터 순서를 기록한다.

- [ ] **Step 2: 0-caller·상한·필터 순서 정적 반증**

Run:

```powershell
rg -n "inspectDecisionContract|buildDecisionRepairPrompt|buildDecisionContractFallback" src/app/api/chat/route.ts
rg -n "MAX_DECISION_REPAIR_ATTEMPTS|filterLLMOutput" src/app/api/chat/route.ts
rg -n "사용자가 판단|직접 선택|알려 주시면 판단" src/lib/chat-decision-contract.ts src/app/api/chat/route.ts
```

Expected: three helpers have production callers; retry constant is `1`; final filter call occurs after answer selection; forbidden phrases appear only in detector/test data.

- [ ] **Step 3: 표적 검증**

Run:

```powershell
npm test -- --runInBand src/lib/__tests__/chat-decision-contract.test.ts src/app/api/chat/__tests__/decision-contract.test.ts src/app/api/chat/__tests__/token-budget.test.ts src/lib/__tests__/electrical-chat.test.ts src/lib/__tests__/chat-calculation-shortfall.test.ts
npx tsc --noEmit --incremental false
$changed = git diff HEAD~3 --name-only -- '*.ts' '*.tsx'; npx eslint $changed
npm run check:docs
```

Expected: every command exits 0 with no warning-producing test failure.

- [ ] **Step 4: 전체 검증**

Run:

```powershell
npm test -- --runInBand
npm run build
git diff --check
```

Expected: all non-skipped Jest tests pass, production build exits 0, diff check is empty.

- [ ] **Step 5: 문서와 최종 상태 커밋**

```powershell
git add README.md docs/USER_GUIDE.md PROJECT_STATE.md docs/superpowers
git commit -m "docs: record chat decision repair contract"
```

- [ ] **Step 6: 원격 선행 여부 확인 후 푸시**

```powershell
git fetch origin main
git rev-parse HEAD
git rev-parse origin/main
git push origin main
git status --short
```

Expected: fetch 후 원격이 작업 기준선에서 예상치 않게 전진하지 않았고 push 성공, working tree clean, `HEAD == origin/main`.
