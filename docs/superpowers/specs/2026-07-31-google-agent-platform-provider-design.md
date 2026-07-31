# Google Agent Platform 공급자 설계

## 1. 목적

ESA에 기존 `gemini` 공급자와 분리된 `google-agent-platform` 공급자를 추가한다. 이 공급자는 `aiplatform.googleapis.com`의 Agent Platform Express Mode를 사용해 Google Cloud 프로젝트의 결제·크레딧 경로로 텍스트 생성과 전기 도면 이미지 분석을 수행한다.

기존 Gemini Developer API(`generativelanguage.googleapis.com`)는 그대로 유지한다. 사용자가 Agent Platform을 선택했는데 Developer API로 조용히 전환하는 폴백은 금지한다.

## 2. 공식 근거와 기준일

- Google Agent Platform Express Mode는 `https://aiplatform.googleapis.com/v1/publishers/google/models/{model}:generateContent` 형식의 전역 엔드포인트를 제공한다.
- Google Cloud API 키는 URL 쿼리보다 `x-goog-api-key` 요청 헤더 사용이 권장된다.
- Vercel AI SDK의 `@ai-sdk/google-vertex`는 `createVertex({ apiKey })`로 Express Mode를 지원하고 기본 환경변수 이름으로 `GOOGLE_VERTEX_API_KEY`를 사용한다.
- Gemini 3.6 Flash, 3.5 Flash, 3.5 Flash-Lite, 3.1 Flash-Lite와 3.1 Pro Preview는 2026-07-31 기준 Agent Platform 모델 문서에 등재되어 있다.

기준일: 2026-07-31. 모델 수명주기와 Express Mode가 Preview인 점은 재검증 대상이다.

## 3. 공급자 계약

| 항목 | 값 |
|---|---|
| 공급자 ID | `google-agent-platform` |
| UI 표시명 | `Google Agent Platform (Cloud 크레딧)` |
| 서버 키 | `GOOGLE_VERTEX_API_KEY` |
| 기본 모델 | `gemini-3.6-flash` |
| 생성 호스트 | `aiplatform.googleapis.com` |
| 인증 전달 | `x-goog-api-key` 또는 공식 SDK 내부 인증 |
| 지원 표면 | 채팅, SLD 전체 분석, 구획별 독립 심사, 명판 OCR |
| 비지원 표면 | Express Mode 임베딩, Agent Engine 배포 |

`GOOGLE_API_KEY`와 `GOOGLE_GENAI_USE_ENTERPRISE`는 Google Gen AI SDK의 자동 환경 감지용 이름이다. ESA는 공급자 선택을 명시적으로 처리하므로 사용자 키를 `GOOGLE_VERTEX_API_KEY` 하나로 보관하고 코드에서 API 경로를 고정한다.

## 4. 모델 카탈로그

Agent Platform에는 Gemini Developer API와 같은 단순 모델 목록 API를 전제로 하지 않는다. ESA 정적 카탈로그를 사용하고 사용자가 “기본 호출 호환성 검사”를 실행하면 모델별 텍스트 1회와 1×1 PNG 이미지 1회를 실제 호출한다.

초기 카탈로그:

- `gemini-3.1-pro-preview`
- `gemini-3.6-flash`
- `gemini-3.5-flash`
- `gemini-3.5-flash-lite`
- `gemini-3.1-flash-lite`

모델 ID는 영숫자·점·밑줄·콜론·슬래시·하이픈만 허용하고 `..`, `//`를 거부한다. 서버 소유 키를 사용할 때는 카탈로그 모델만 허용한다.

## 5. 호출 아키텍처

### 5.1 채팅

`/api/chat`은 `@ai-sdk/google-vertex`의 `createVertex({ apiKey })`로 모델을 만든다. 기존 스트리밍, 토큰 예약·정산, 계산기 근거 검증, 출력 필터를 그대로 통과한다.

### 5.2 도면 및 OCR

고정 엔드포인트 빌더가 공급자와 모델을 받아 다음 중 하나만 반환한다.

- `gemini`: `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`
- `google-agent-platform`: `https://aiplatform.googleapis.com/v1/publishers/google/models/{model}:generateContent`

키는 두 경로 모두 `x-goog-api-key` 헤더로 전송한다. URL·오류·로그·결과 JSON에는 키를 넣지 않는다.

다음 생산 경로가 같은 공급자 계약을 사용한다.

- `agent/vision/vlm-client`: 구획·역할별 VLM 판독
- `agent/vision/vision-splitter`: 구획 실행과 서버 키 선택
- drawing job `run`/`resume` 및 `team-review`/`sld` API
- `lib/sld-recognition`: 단일 SLD 분석
- `lib/ocr-nameplate`: 명판 OCR
- `agent/drawing/role-runner`: 역할별 원본 호출

### 5.3 임베딩

Express Mode REST 참조에는 `generateContent`, `streamGenerateContent`, `countTokens`만 명시되어 있다. 따라서 RAG 임베딩은 이번 변경에서 기존 OpenAI/Gemini Developer API 경로를 유지한다. Agent Platform 임베딩은 프로젝트·위치·권한 계약과 실호출을 별도로 검증한 뒤 추가한다.

## 6. 키와 오류 처리

- BYOK 키가 있으면 요청 키를 우선하고, 없으면 `GOOGLE_VERTEX_API_KEY`를 사용한다.
- 비로그인 도면 분석은 기존 정책대로 BYOK가 필요하다.
- `401/403`: 키·API 제한·서비스 계정 권한 문제로 실패 처리한다.
- `404`: 선택 모델이 Agent Platform에서 제공되지 않는 것으로 실패 처리한다.
- `429` 및 `5xx`: 할당량·일시 장애로 `HOLD` 처리한다.
- 15초 모델 프로브, 기존 VLM 요청 제한시간과 재시도 상한을 유지한다.
- Agent Platform 실패를 `gemini` 성공으로 바꾸지 않는다.

## 7. UI

BYOK 설정에 독립 카드를 노출한다. 저장 키와 선택 모델은 기존 브라우저 결박 AES-GCM 저장소를 재사용한다. 카피는 Cloud 크레딧 경로임을 명시하고, 키 확인 시 정적 카탈로그를 보여준 뒤 모델 호환성 검사를 실행할 수 있게 한다.

도면 업로드 화면은 `isVisionProvider()`를 통해 새 공급자를 기존 Vision 공급자와 동일하게 선택·전송한다. 결과 영수증의 `provider` 값은 `google-agent-platform`으로 보존한다.

## 8. 수용 기준

1. `.env.local`은 Git 비추적 상태이며 `GOOGLE_VERTEX_API_KEY`가 한 번만 존재한다.
2. `.env.example`과 중앙 환경변수 목록이 같은 이름을 사용한다.
3. 공급자 목록과 BYOK UI에서 기존 Gemini와 Agent Platform을 별개로 선택한다.
4. 채팅 요청이 Vertex Express Mode SDK 경로를 사용한다.
5. 도면 VLM·SLD·OCR 요청 URL은 `aiplatform.googleapis.com`이고 키가 URL에 없다.
6. 도면 관련 API가 새 공급자와 서버 키를 수용한다.
7. 잘못된 공급자·모델·키는 4xx 또는 명시적 실패/HOLD로 끝나며 다른 Google 공급자로 전환되지 않는다.
8. 기존 Gemini Developer API 테스트는 그대로 통과한다.
9. 실제 키가 설정되면 텍스트와 이미지 프로브를 실행하고 도면 1건 이상에서 분석→관계→제안 결과를 기록한다.
