# ChatGPT Local Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 로컬 ESA에서 `ChatGPT 계정`을 선택하면 공식 Codex 로그인을 자동 인식해 채팅·계산 영수증·도면 분석을 API 키 없이 실행한다.

**Architecture:** Next.js Node Route Handler가 stdio로 `codex app-server`를 한 번 실행하고 좁은 JSON-RPC 클라이언트로 계정·모델·turn만 사용한다. 기존 OpenAI BYOK 경로는 그대로 두고 `chatgpt-local` 공급자를 별도 선택지로 추가하며, loopback 요청에서만 활성화한다.

**Tech Stack:** Next.js 16 Route Handlers, TypeScript 5.9, Node `child_process`, Codex app-server v2 JSON-RPC, Jest 30, React 19

## Global Constraints

- `chatgpt-local`은 Host가 `localhost`, `127.0.0.1`, `[::1]`일 때만 노출한다.
- ChatGPT 비밀번호·쿠키·access token·refresh token은 읽거나 저장하지 않는다.
- `codex app-server`는 stdio만 사용하고 네트워크 리스너를 열지 않는다.
- `openai` Platform API 키 공급자와 `chatgpt-local` 계정 공급자를 합치지 않는다.
- command, file-change, MCP, web-search, approval 이벤트가 나오면 turn을 중단하고 결과를 폐기한다.
- 도면 분석의 기존 역할 분리·출처 ID·봉인·전기 논리 검증을 우회하지 않는다.
- 신규 런타임 패키지를 추가하지 않는다.

---

### Task 1: Loopback 경계와 Codex JSON-RPC 전송

**Files:**
- Create: `src/lib/chatgpt-local-loopback.ts`
- Create: `src/lib/chatgpt-local-protocol.ts`
- Test: `src/lib/__tests__/chatgpt-local-loopback.test.ts`
- Test: `src/lib/__tests__/chatgpt-local-protocol.test.ts`

**Interfaces:**
- Produces: `isLoopbackHost(host: string | null): boolean`
- Produces: `assertLoopbackRequest(request: Pick<Request, 'url' | 'headers'>): void`
- Produces: `CodexAppServerClient.request<T>(method: string, params: unknown, options?): Promise<T>`
- Produces: `CodexAppServerClient.runTurn(params, hooks): Promise<LocalTurnResult>`

- [ ] **Step 1: loopback 판정 실패 테스트 작성**

```ts
expect(isLoopbackHost('localhost:3000')).toBe(true);
expect(isLoopbackHost('127.0.0.1:3000')).toBe(true);
expect(isLoopbackHost('[::1]:3000')).toBe(true);
expect(isLoopbackHost('esa.example.com')).toBe(false);
expect(isLoopbackHost('localhost.attacker.test')).toBe(false);
```

- [ ] **Step 2: loopback 테스트가 함수 부재로 실패하는지 실행**

Run: `npx jest --runInBand src/lib/__tests__/chatgpt-local-loopback.test.ts`

- [ ] **Step 3: URL 파싱 기반 loopback 판정 구현**

```ts
export function isLoopbackHost(host: string | null): boolean {
  if (!host) return false;
  const hostname = new URL(`http://${host}`).hostname.toLowerCase();
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}
```

- [ ] **Step 4: JSON-RPC ID·timeout·종료·비JSON stderr 격리 실패 테스트 작성**

가짜 `ChildProcess`의 stdout에 분할 JSONL을 넣고 같은 ID의 Promise만 resolve되는지,
프로세스 종료 시 대기 요청이 모두 `LOCAL_CODEX_EXITED`로 reject되는지 검증한다.

- [ ] **Step 5: stdio JSON-RPC 클라이언트 최소 구현**

```ts
export interface LocalTurnResult {
  text: string;
  model: string;
  durationMs: number;
}

export class CodexAppServerClient {
  request<T>(method: string, params: unknown, options?: { timeoutMs?: number }): Promise<T>;
  runTurn(
    params: LocalTurnParams,
    hooks?: { onDelta?: (delta: string) => void },
  ): Promise<LocalTurnResult>;
  close(): void;
}
```

Windows에서는 `cmd.exe /d /s /c "codex app-server --stdio"`를 고정 문자열로 실행하고,
다른 OS에서는 `codex app-server --stdio`를 직접 실행한다. 외부 입력을 command
문자열에 연결하지 않는다.

- [ ] **Step 6: 위험 이벤트 fail-closed 구현**

`item/started`·`item/completed`에서 `commandExecution`, `fileChange`, `mcpToolCall`,
`dynamicToolCall`, `webSearch`를 발견하거나 서버가 승인 request를 보내면
`turn/interrupt`를 전송하고 `LOCAL_CODEX_TOOL_BLOCKED`로 reject한다.

- [ ] **Step 7: Task 1 테스트 통과 및 커밋**

Run: `npx jest --runInBand src/lib/__tests__/chatgpt-local-loopback.test.ts src/lib/__tests__/chatgpt-local-protocol.test.ts`

Commit: `feat: 로컬 Codex 프로토콜 경계를 추가`

---

### Task 2: 계정·로그인·모델 서비스와 설정 카드

**Files:**
- Create: `src/lib/chatgpt-local.ts`
- Create: `src/lib/chatgpt-local-selection.ts`
- Create: `src/app/api/settings/chatgpt-local/route.ts`
- Create: `src/components/ChatGPTLocalCard.tsx`
- Modify: `src/app/(with-nav)/settings/byok/page.tsx`
- Test: `src/lib/__tests__/chatgpt-local-service.test.ts`
- Test: `src/app/api/settings/chatgpt-local/__tests__/route.test.ts`
- Modify: `src/app/__tests__/byok-model-selection.test.ts`

**Interfaces:**
- Consumes: `CodexAppServerClient`, `assertLoopbackRequest`
- Produces: `getChatGPTLocalStatus(): Promise<ChatGPTLocalStatus>`
- Produces: `startChatGPTLocalLogin(): Promise<{ authUrl: string; loginId: string }>`
- Produces: `cancelChatGPTLocalLogin(loginId: string): Promise<void>`
- Produces: `logoutChatGPTLocal(): Promise<void>`
- Produces: `loadChatGPTLocalSelection()` / `saveChatGPTLocalSelection()`

- [ ] **Step 1: 계정 redaction과 모델 필터 테스트 작성**

```ts
expect(status.account).toEqual({
  connected: true,
  email: 'g***@gmail.com',
  planType: 'pro',
});
expect(status.models.every((model) => model.inputModalities.includes('text'))).toBe(true);
expect(JSON.stringify(status)).not.toContain('accessToken');
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx jest --runInBand src/lib/__tests__/chatgpt-local-service.test.ts`

- [ ] **Step 3: app-server singleton과 계정 서비스 구현**

```ts
export interface ChatGPTLocalStatus {
  available: boolean;
  connected: boolean;
  account?: { email: string | null; planType: string };
  models: Array<{ id: string; name: string; inputModalities: Array<'text' | 'image'> }>;
  reason?: 'NOT_LOOPBACK' | 'CODEX_NOT_FOUND' | 'NOT_LOGGED_IN' | 'PROTOCOL_ERROR';
}
```

`initialize → account/read → model/list` 순서를 지키고 이메일은 첫 글자와 도메인만
남긴다. singleton이 실패하면 제거해 다음 상태 확인에서 재생성할 수 있게 한다.

- [ ] **Step 4: 로컬 전용 설정 API 테스트와 구현**

`GET`은 상태, `POST {action:"login"}`은 공식 `authUrl`,
`POST {action:"cancel-login", loginId}`는 진행 중 로그인을 취소하고,
`POST {action:"logout"}`은 연결 해제를 반환한다. 원격 Host는 모든 동작에서 404다.
임의 action과 현재 로그인 ID가 아닌 취소 요청은 400이다.

- [ ] **Step 5: 브라우저 선택 저장 계약 구현**

```ts
export interface ChatGPTLocalSelection {
  enabled: boolean;
  model: string;
}
```

`localStorage["esa-chatgpt-local"]`에 비밀이 아닌 enabled/model만 저장하고 모델 ID는
기존 `SAFE_MODEL_ID` 규칙과 같은 형식으로 검증한다.

- [ ] **Step 6: 설정 카드 UI 구현**

`API 키 관리` 제목 아래에 `ChatGPT 계정 (로컬)` 카드를 먼저 배치한다. 설치 여부,
연결 상태, 마스킹 이메일, 플랜, 실제 모델 선택, 연결·다시 확인·연결 해제 버튼만
표시한다. 로그인 URL은 `window.open(url, '_blank', 'noopener,noreferrer')`로 연다.

- [ ] **Step 7: Task 2 테스트 통과 및 커밋**

Run: `npx jest --runInBand src/lib/__tests__/chatgpt-local-service.test.ts src/app/api/settings/chatgpt-local/__tests__/route.test.ts src/app/__tests__/byok-model-selection.test.ts`

Commit: `feat: ChatGPT 로컬 계정 설정을 연결`

---

### Task 3: 채팅·계산 영수증 자동 전환

**Files:**
- Modify: `src/lib/electrical-chat-client.ts`
- Modify: `src/app/api/chat/route.ts`
- Modify: `src/lib/ai-providers.ts`
- Test: `src/lib/__tests__/vision-byok-chat.test.ts`
- Test: `src/lib/__tests__/openai-chat-request-contract.test.ts`
- Modify: `src/app/api/chat/__tests__/provider-dispatch.test.ts`
- Create: `src/app/api/chat/__tests__/chatgpt-local-dispatch.test.ts`

**Interfaces:**
- Consumes: `loadChatGPTLocalSelection`, `getChatGPTLocalStatus`, `runChatGPTLocalTurn`
- Produces: `/api/chat` request `{provider:"chatgpt-local", model, messages}`

- [ ] **Step 1: 브라우저 자동 전환 실패 테스트 작성**

저장된 선택이 `{enabled:true, model:"gpt-5.6-terra"}`이면 BYOK 키보다 먼저
`provider:"chatgpt-local"`을 선택하고 `apiKey` 필드가 없는지 검증한다.

- [ ] **Step 2: 채팅 Route 실패 테스트 작성**

loopback 요청은 `resolveProviderKey`를 호출하지 않고 로컬 turn을 실행한다. 원격 Host는
404, 미로그인은 401, 사용량 제한은 429로 매핑한다.

- [ ] **Step 3: 클라이언트 전송 선택 구현**

`resolveBrowserChatTransport`에서 on-premise 다음, BYOK보다 앞에 ChatGPT 로컬 선택을
확인한다. 연결 상태가 끊겼으면 `/api/chat`에 보내기 전에 사람이 조치할 오류를 낸다.

- [ ] **Step 4: `/api/chat` 로컬 분기 구현**

기존 계산기 선실행과 시스템 프롬프트 생성 뒤 로컬 turn을 호출한다.

```ts
const local = await runChatGPTLocalTurn({
  model: body.model,
  systemPrompt: calibratedSystemPrompt,
  messages: body.messages,
  signal: request.signal,
});
```

로컬 답변도 `filterLLMOutput`을 거친 뒤 기존과 같은 `calculation → text → [DONE]`
SSE 순서로 보낸다. 로컬 계정 사용량은 ESA 서버 키 예산에 합산하지 않는다.

- [ ] **Step 5: 계산기 영수증 회귀 테스트**

`3상 380V 100A 50m 35mm² Cu PF 0.9` 요청에서 모델 호출 전에 `voltage-drop`
영수증이 생성되고 그 결과가 로컬 turn의 system prompt에 포함되는지 검증한다.

- [ ] **Step 6: Task 3 테스트 통과 및 커밋**

Run: `npx jest --runInBand src/app/api/chat/__tests__/chatgpt-local-dispatch.test.ts src/app/api/chat/__tests__/provider-dispatch.test.ts src/lib/__tests__/openai-chat-request-contract.test.ts src/lib/__tests__/vision-byok-chat.test.ts`

Commit: `feat: 채팅을 ChatGPT 로컬 계정으로 자동 전환`

---

### Task 4: 도면 역할 판독과 키 없는 Vision 요청

**Files:**
- Modify: `src/lib/vision-byok.ts`
- Modify: `src/agent/vision/vlm-client.ts`
- Modify: `src/agent/teams/types.ts`
- Modify: `src/agent/drawing/document-orchestrator.ts`
- Test: `src/lib/__tests__/vision-byok-model.test.ts`
- Modify: `src/agent/vision/__tests__/vlm-role-prompt.test.ts`
- Create: `src/agent/vision/__tests__/chatgpt-local-vlm.test.ts`

**Interfaces:**
- Produces: `VLMProvider = 'gemini' | 'openai' | 'claude' | 'chatgpt-local'`
- Produces: remote/local 구분이 가능한 `VLMOptions`
- Consumes: `runChatGPTLocalTurn({ imageDataUrl, outputSchema, ... })`

- [ ] **Step 1: local Vision 선택 실패 테스트**

ChatGPT 로컬 선택이 켜져 있고 선택 모델이 image modality를 지원하면
`getFirstAvailableVisionKey()`가 `{provider:"chatgpt-local", key:"", model}`을
반환하는지 검증한다. text 전용 모델이면 Vision 선택에서 제외한다.

- [ ] **Step 2: VLM 계약을 판별 가능한 union으로 변경**

```ts
type RemoteVLMOptions = {
  provider: 'gemini' | 'openai' | 'claude';
  apiKey: string;
};
type LocalVLMOptions = {
  provider: 'chatgpt-local';
  apiKey?: never;
};
export type VLMOptions = (RemoteVLMOptions | LocalVLMOptions) & VLMSharedOptions;
```

- [ ] **Step 3: 로컬 이미지 역할 전송 구현**

이미지를 `data:${mimeType};base64,...`로 만들고 역할 프롬프트와 함께 ephemeral turn에
전달한다. 결과는 기존 `parseRoleReviewData`로 파싱하며, 별도 완화 파서를 만들지 않는다.

- [ ] **Step 4: 원격 키 검증 회귀 확인**

remote provider의 빈 키·잘못된 OpenAI 키는 기존 오류를 유지하고,
`chatgpt-local`에서만 키 검증을 건너뛴다.

- [ ] **Step 5: Task 4 테스트 통과 및 커밋**

Run: `npx jest --runInBand src/lib/__tests__/vision-byok-model.test.ts src/agent/vision/__tests__/vlm-role-prompt.test.ts src/agent/vision/__tests__/chatgpt-local-vlm.test.ts`

Commit: `feat: 도면 역할 판독에 ChatGPT 로컬 모델을 추가`

---

### Task 5: SLD 작업 생성·실행·재개의 local provider 배선

**Files:**
- Create: `src/lib/drawing-vision-request.ts`
- Modify: `src/app/api/drawing-jobs/route.ts`
- Modify: `src/app/api/drawing-jobs/[jobId]/run/route.ts`
- Modify: `src/app/api/drawing-jobs/[jobId]/resume/route.ts`
- Modify: `src/app/api/sld/route.ts`
- Test: `src/lib/__tests__/drawing-vision-request.test.ts`
- Modify: `src/app/api/drawing-jobs/__tests__/route.test.ts`
- Modify: `src/app/api/drawing-jobs/[jobId]/run/__tests__/route.test.ts`
- Modify: `src/app/api/drawing-jobs/[jobId]/resume/__tests__/route.test.ts`

**Interfaces:**
- Produces: `resolveDrawingVisionRequest(form, request, owner): VLMOptions | undefined`
- Consumes: `assertLoopbackRequest`, `isCatalogModel`

- [ ] **Step 1: 세 라우트 공통 실패 계약 테스트**

`chatgpt-local`은 loopback에서 키 없이 통과하고, 원격 Host에서는 404다.
remote provider의 비로그인 무키 요청은 기존 401을 유지한다.

- [ ] **Step 2: 공통 공급자 파서 구현**

provider, model, apiKey 길이, 서버 키, 카탈로그 모델을 한 함수에서 검증한다.
`chatgpt-local`은 동적 `model/list`에 존재하고 image modality를 지원하는 모델만
허용한다.

- [ ] **Step 3: 생성·run·resume 라우트에 공통 파서 배선**

세 라우트의 중복 `VisionProvider`, `PROVIDERS`, `serverKey`를 제거하고 동일한
`VLMOptions`를 `runDocumentAnalysis`에 전달한다.

- [ ] **Step 4: 구형 `/api/sld` 동기 경로 배선**

이미지 탭의 구형 동기 호출도 같은 공통 파서를 사용한다. 그렇지 않으면 V3는 되는데
OCR·Studio 표면에서만 로컬 선택이 실패하는 분기 불일치가 남는다.

- [ ] **Step 5: Task 5 테스트 통과 및 커밋**

Run: `npx jest --runInBand src/lib/__tests__/drawing-vision-request.test.ts src/app/api/drawing-jobs/__tests__/route.test.ts src/app/api/drawing-jobs/[jobId]/run/__tests__/route.test.ts src/app/api/drawing-jobs/[jobId]/resume/__tests__/route.test.ts src/app/api/sld`

Commit: `feat: 전체 도면 작업을 로컬 계정으로 실행`

---

### Task 6: 문서·전체 게이트·실계정 왕복

**Files:**
- Modify: `README.md`
- Modify: `docs/USER_GUIDE.md`
- Modify: `docs/API_REFERENCE.md`
- Modify: `docs/project/IMPLEMENTATION_MAP.md`
- Modify: `docs/DORMANT_MANIFEST.md` only if a deferred public connector entry is required
- Modify: `PROJECT_STATE.md` because auth, chat, vision, UI, docs exceed three domains

**Interfaces:**
- Consumes: completed Tasks 1–5
- Produces: company tester instructions and reproducible verification receipt

- [ ] **Step 1: 사용자 문서 갱신**

`설정 → API 키 관리 → ChatGPT 계정 (로컬) → 연결 → 모델 선택` 순서를 기록한다.
공개 서버에서 자동 사용된다는 문구는 넣지 않고, 현재는 ESA와 Codex가 같은 PC에서
실행돼야 한다고 명시한다.

- [ ] **Step 2: 정적 검증**

Run:

```powershell
npx tsc --noEmit --incremental false
npm run lint -- --max-warnings=0
npm test -- --runInBand
npm run build
```

Expected: 각 명령 exit 0.

- [ ] **Step 3: 실계정 상태·모델 왕복**

로컬 production 서버에서 설정 카드를 열어 현재 계정이 마스킹 표시되고
`model/list`의 텍스트·이미지 modality와 UI 목록이 일치하는지 확인한다.

- [ ] **Step 4: 실계정 채팅·계산 왕복**

초급·중급·고급 전기 질문 각 1회와 전압강하 계산 질문 1회를 실행한다.
계산 질문은 영수증이 답변보다 먼저 표시되고 모델 설명 수치가 영수증과 일치해야 한다.

- [ ] **Step 5: 공개 교보재 도면 왕복**

저장소의 공개 또는 합성 SLD 1건을 `chatgpt-local` image 모델로 실행한다.
`symbols`, `connections`, `text`, `logic`, coverage 역할 호출과 최종 출처 ID·상태를
확인한다. command/file/MCP 이벤트는 0이어야 한다.

- [ ] **Step 6: 최종 커밋**

Commit: `docs: ChatGPT 로컬 계정 사용과 검증을 기록`
