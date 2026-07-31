# Google Agent Platform Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Google Cloud 크레딧을 사용하는 Agent Platform Express Mode를 ESA의 채팅·도면·OCR 생산 경로에 독립 공급자로 연결한다.

**Architecture:** `google-agent-platform`을 기존 `gemini`와 별도 카탈로그·키로 등록한다. 채팅은 공식 Vertex AI SDK 공급자를 사용하고, 도면 계층은 고정 Google 엔드포인트 빌더와 `x-goog-api-key` 헤더를 공유한다. 공급자 실패는 다른 Google API로 폴백하지 않으며 임베딩은 기존 경로를 유지한다.

**Tech Stack:** Next.js 16, React 19, TypeScript 5.9, Jest 30, AI SDK 7, `@ai-sdk/google-vertex` 5, Google Agent Platform Express Mode REST v1.

## Global Constraints

- 공급자 ID는 정확히 `google-agent-platform`이다.
- 서버 환경변수는 정확히 `GOOGLE_VERTEX_API_KEY`이다.
- API 키는 URL·로그·오류·응답 JSON에 포함하지 않는다.
- Agent Platform 실패 시 `gemini`로 자동 전환하지 않는다.
- 임베딩 공급자 타입과 RAG 경로는 이번 변경에서 수정하지 않는다.
- 서버 소유 키에는 정적 카탈로그 모델만 허용한다.

---

### Task 1: Environment, Catalog, and Key Resolution

**Files:**
- Modify: `.env.example`
- Modify: `src/lib/env.ts`
- Modify: `src/lib/ai-providers.ts`
- Modify: `src/lib/server-ai.ts`
- Test: `src/lib/__tests__/server-ai.test.ts`
- Test: `src/lib/__tests__/google-agent-platform-provider.test.ts`

**Interfaces:**
- Produces: provider ID `google-agent-platform`, default model `gemini-3.6-flash`
- Produces: `resolveProviderKey('google-agent-platform') -> GOOGLE_VERTEX_API_KEY`

- [ ] **Step 1: Write failing catalog and environment key tests**

```ts
expect(getProvider('google-agent-platform')).toMatchObject({
  name: 'Google Agent Platform (Cloud 크레딧)',
  defaultModel: 'gemini-3.6-flash',
});
process.env.GOOGLE_VERTEX_API_KEY = 'agent-platform-test-key';
expect(resolveProviderKey('google-agent-platform')).toEqual({
  key: 'agent-platform-test-key',
  source: 'env',
});
```

- [ ] **Step 2: Run tests and confirm RED**

Run: `npx jest --runInBand src/lib/__tests__/server-ai.test.ts src/lib/__tests__/google-agent-platform-provider.test.ts`

Expected: provider and environment mapping assertions fail because the provider is absent.

- [ ] **Step 3: Add catalog, central env definition, display name, key mapping, and key format validation**

The provider models are `gemini-3.1-pro-preview`, `gemini-3.6-flash`, `gemini-3.5-flash`, `gemini-3.5-flash-lite`, and `gemini-3.1-flash-lite`.

- [ ] **Step 4: Run focused tests and confirm GREEN**

Run: `npx jest --runInBand src/lib/__tests__/server-ai.test.ts src/lib/__tests__/google-agent-platform-provider.test.ts`

- [ ] **Step 5: Commit the configuration boundary**

Commit only the environment example, catalog, server key code, tests, design, and plan with message `feat: register Google Agent Platform provider`.

### Task 2: Chat Transport

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src/app/api/chat/route.ts`
- Test: `src/app/api/chat/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `provider='google-agent-platform'`, `model`, resolved API key
- Produces: an AI SDK language model created by `createVertex({ apiKey })`

- [ ] **Step 1: Install the compatible Vertex provider**

Run: `npm install @ai-sdk/google-vertex@^5.0.36`

- [ ] **Step 2: Add a failing chat route test**

Mock `@ai-sdk/google-vertex` and assert:

```ts
expect(createVertex).toHaveBeenCalledWith({ apiKey: 'agent-platform-test-key' });
expect(vertexProvider).toHaveBeenCalledWith('gemini-3.6-flash');
```

- [ ] **Step 3: Run the chat test and confirm RED**

Run: `npx jest --runInBand src/app/api/chat/__tests__/route.test.ts`

- [ ] **Step 4: Add the `google-agent-platform` switch branch**

```ts
const { createVertex } = await import('@ai-sdk/google-vertex');
const vertexProvider = createVertex({ apiKey });
sdkModel = vertexProvider(model);
```

- [ ] **Step 5: Run the chat test and typecheck**

Run: `npx jest --runInBand src/app/api/chat/__tests__/route.test.ts`

Run: `npx tsc --noEmit`

### Task 3: Fixed Google Multimodal Transport

**Files:**
- Create: `src/lib/google-model-transport.ts`
- Create: `src/lib/__tests__/google-model-transport.test.ts`
- Modify: `src/agent/vision/vlm-client.ts`
- Modify: `src/agent/vision/review-types.ts`
- Modify: `src/agent/vision/drawing-council.ts`
- Modify: `src/agent/teams/types.ts`
- Test: `src/agent/vision/__tests__/vlm-role-prompt.test.ts`

**Interfaces:**

```ts
export type GoogleModelProvider = 'gemini' | 'google-agent-platform';

export function googleGenerateContentEndpoint(
  provider: GoogleModelProvider,
  model: string,
): string;

export function googleApiKeyHeaders(apiKey: string): {
  'Content-Type': 'application/json';
  'x-goog-api-key': string;
};
```

- [ ] **Step 1: Write failing endpoint and secret-transport tests**

```ts
expect(googleGenerateContentEndpoint('google-agent-platform', 'gemini-3.6-flash'))
  .toBe('https://aiplatform.googleapis.com/v1/publishers/google/models/gemini-3.6-flash:generateContent');
expect(googleGenerateContentEndpoint('google-agent-platform', 'bad/../model')).toThrow();
expect(endpoint).not.toContain(apiKey);
expect(headers['x-goog-api-key']).toBe(apiKey);
```

- [ ] **Step 2: Run tests and confirm RED**

Run: `npx jest --runInBand src/lib/__tests__/google-model-transport.test.ts src/agent/vision/__tests__/vlm-role-prompt.test.ts`

- [ ] **Step 3: Implement the fixed endpoint helper and add `google-agent-platform` to VLM provider types**

The Agent Platform VLM request reuses the Gemini JSON body and parser but selects its own endpoint and provider label.

- [ ] **Step 4: Extend the VLM role prompt test**

Assert the Agent Platform request:

```ts
expect(String(url)).toContain('aiplatform.googleapis.com/v1/publishers/google/models/');
expect(String(url)).not.toContain(apiKey);
expect(request.headers).toMatchObject({ 'x-goog-api-key': apiKey });
```

- [ ] **Step 5: Run focused tests and typecheck**

Run: `npx jest --runInBand src/lib/__tests__/google-model-transport.test.ts src/agent/vision/__tests__/vlm-role-prompt.test.ts`

Run: `npx tsc --noEmit`

### Task 4: Vision Selection and API Entry Points

**Files:**
- Modify: `src/lib/vision-byok.ts`
- Modify: `src/agent/vision/vision-splitter.ts`
- Modify: `src/app/api/team-review/route.ts`
- Modify: `src/app/api/sld/route.ts`
- Modify: `src/app/api/drawing-jobs/route.ts`
- Modify: `src/app/api/drawing-jobs/[jobId]/run/route.ts`
- Modify: `src/app/api/drawing-jobs/[jobId]/resume/route.ts`
- Test: `src/lib/__tests__/vision-byok.test.ts`
- Test: `src/app/api/drawing-jobs/[jobId]/run/__tests__/route.test.ts`
- Test: `src/app/api/team-review/__tests__/route.test.ts`

**Interfaces:**
- Produces: `VisionProvider = 'openai' | 'claude' | 'gemini' | 'google-agent-platform'`
- Produces: server key resolution for `GOOGLE_VERTEX_API_KEY`

- [ ] **Step 1: Add failing provider acceptance and server key tests**

```ts
expect(isVisionProvider('google-agent-platform')).toBe(true);
process.env.GOOGLE_VERTEX_API_KEY = 'agent-platform-server-key';
```

Assert the drawing job and team-review pass the exact provider and key into the orchestrator.

- [ ] **Step 2: Run route and selection tests and confirm RED**

Run: `npx jest --runInBand src/lib/__tests__/vision-byok.test.ts src/app/api/drawing-jobs/[jobId]/run/__tests__/route.test.ts src/app/api/team-review/__tests__/route.test.ts`

- [ ] **Step 3: Extend every Vision allowlist and server-key selector**

Use the shared `VisionProvider` type where possible. Preserve the existing unauthenticated BYOK requirement.

- [ ] **Step 4: Run focused tests and typecheck**

Run: `npx jest --runInBand src/lib/__tests__/vision-byok.test.ts src/app/api/drawing-jobs/[jobId]/run/__tests__/route.test.ts src/app/api/team-review/__tests__/route.test.ts`

Run: `npx tsc --noEmit`

### Task 5: BYOK Validation and Model Selection UI

**Files:**
- Modify: `src/app/api/settings/byok-test/route.ts`
- Modify: `src/app/(with-nav)/settings/byok/page.tsx`
- Test: `src/app/api/settings/byok-test/__tests__/route.test.ts`
- Test: `src/app/(with-nav)/settings/byok/__tests__/page.test.tsx`

**Interfaces:**
- Consumes: static Agent Platform model catalog
- Produces: `{ valid, models }` after a real text capability probe
- Produces: model probe outcomes `{ status: 'success'|'failed'|'hold', detail, latencyMs }`

- [ ] **Step 1: Add failing API tests**

Assert key validation calls the fixed Agent Platform endpoint with `x-goog-api-key`, returns catalog models, accepts `action='probe-model'`, and never includes the key in the URL or JSON response.

- [ ] **Step 2: Run API tests and confirm RED**

Run: `npx jest --runInBand src/app/api/settings/byok-test/__tests__/route.test.ts`

- [ ] **Step 3: Generalize the Gemini capability probe to both Google providers**

Agent Platform key validation uses one text probe against its default model because Express Mode has no required list-models contract. Map `429` and `5xx` to `HOLD`; map authorization and unsupported model errors to failed.

- [ ] **Step 4: Add the independent UI card and enable the compatibility table**

Place `google-agent-platform` after `gemini` in the provider order. The compatibility table condition accepts both Google vision providers.

- [ ] **Step 5: Run API and UI tests**

Run: `npx jest --runInBand src/app/api/settings/byok-test/__tests__/route.test.ts src/app/(with-nav)/settings/byok/__tests__/page.test.tsx`

### Task 6: SLD, OCR, and Role Runner

**Files:**
- Modify: `src/lib/sld-recognition.ts`
- Modify: `src/lib/ocr-nameplate.ts`
- Modify: `src/agent/drawing/role-runner.ts`
- Test: `src/lib/__tests__/gemini-key-transport.test.ts`
- Test: `src/lib/__tests__/google-agent-platform-vision.test.ts`
- Test: `src/agent/drawing/__tests__/role-runner.test.ts`

**Interfaces:**
- Consumes: `googleGenerateContentEndpoint()` and `googleApiKeyHeaders()`
- Produces: the same parsed SLD, nameplate, and role-review schemas as existing Gemini

- [ ] **Step 1: Add failing transport tests for all three production callers**

Each test asserts Agent Platform host selection, header authentication, key absence from URL/error text, and no fallback request to `generativelanguage.googleapis.com`.

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `npx jest --runInBand src/lib/__tests__/google-agent-platform-vision.test.ts src/agent/drawing/__tests__/role-runner.test.ts`

- [ ] **Step 3: Route both Google providers through the fixed endpoint helper**

Retain caller-specific prompts and response schemas. Error prefixes identify `Agent Platform` when that provider was selected.

- [ ] **Step 4: Run focused tests and typecheck**

Run: `npx jest --runInBand src/lib/__tests__/gemini-key-transport.test.ts src/lib/__tests__/google-agent-platform-vision.test.ts src/agent/drawing/__tests__/role-runner.test.ts`

Run: `npx tsc --noEmit`

### Task 7: Verification, Live Drawing Gate, and Publication

**Files:**
- Modify only if results require a localized repair: files already listed above
- Record: command output and live probe result in the final work report

**Interfaces:**
- Consumes: configured `GOOGLE_VERTEX_API_KEY`
- Produces: success/failure/hold receipt for text, image, and one drawing analysis

- [ ] **Step 1: Run provider-focused suites**

Run all tests added or modified in Tasks 1–6 without piping output.

- [ ] **Step 2: Run repository gates once**

Run: `npx tsc --noEmit`

Run: `npm run lint`

Run: `npm test -- --runInBand`

Run: `npm run build`

- [ ] **Step 3: Run the live capability gate when the local key is non-empty**

Execute one text probe and one tiny-image probe for the selected default model. Then analyze one repository drawing fixture through the production VLM path. Record `success`, `failed`, or `hold` without printing the key or raw company data.

- [ ] **Step 4: Verify wiring and secret boundaries**

Run:

```powershell
rg -n "google-agent-platform|GOOGLE_VERTEX_API_KEY" .env.example src package.json
rg -n "GOOGLE_VERTEX_API_KEY|x-goog-api-key" src
rg -n "key=\\$\\{|\\?key=" src
```

Confirm every new provider function has a production caller and no API key is placed in a URL.

- [ ] **Step 5: Commit and push**

Stage explicit paths only, commit the remaining implementation, push `codex/google-agent-platform-provider`, and report any live test that could not run because the local key value is empty.
