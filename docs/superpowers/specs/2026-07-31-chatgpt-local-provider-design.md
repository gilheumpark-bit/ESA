# ChatGPT 계정 로컬 자동 전환 설계

**상태:** 승인됨

**작성일:** 2026-07-31

**대상 기준선:** `main@4455a91`

**구현 브랜치:** `codex/chatgpt-local-provider`

## 1. 목표

로컬에서 실행 중인 ESA 사용자가 별도 OpenAI API 키를 발급하지 않아도, 자신의
공식 ChatGPT/Codex 로그인 계정으로 ESA의 AI 기능을 시험할 수 있게 한다.

사용자가 `ChatGPT 계정`을 선택하면 ESA는 다음을 자동 수행한다.

1. 같은 PC의 Codex CLI와 app-server 사용 가능 여부를 확인한다.
2. 현재 ChatGPT 로그인 상태와 플랜을 확인한다.
3. 로그인돼 있지 않으면 공식 ChatGPT 로그인 흐름을 시작한다.
4. 해당 계정에 실제 노출된 모델 목록을 불러온다.
5. 텍스트 답변과 이미지 도면 판독을 로컬 app-server 경로로 전환한다.

현재 단계는 로컬 실행 POC다. 공개 서버가 사용자의 ChatGPT 세션을 대신 보관하거나
직접 호출하는 기능은 범위에 넣지 않는다.

## 2. 채택 구조

```text
ESA 브라우저
  ├─ 기존 OpenAI API 키 선택 ──> /api/chat ──> OpenAI API
  └─ ChatGPT 계정 선택
       └─> 로컬 ESA Route Handler
             └─> Codex app-server (stdio)
                   └─> 사용자의 공식 ChatGPT/Codex 로그인
```

별도 상주 연결 도우미나 공개 포트는 만들지 않는다. 로컬 Next.js 서버 프로세스가
Codex app-server 자식 프로세스를 stdio로 관리한다. 향후 공개 배포에서는 동일한
`ChatGPTLocalTransport` 인터페이스 뒤에 사용자 PC용 연결 도우미를 붙인다.

## 3. 공급자와 자동 전환

- 기존 `openai`는 Platform API 키 기반 공급자로 유지한다.
- 신규 공급자 ID는 `chatgpt-local`로 분리한다.
- `chatgpt-local` 선택 시 API 키 입력과 서버 환경변수 해석을 건너뛴다.
- 요청마다 실행 파일을 새로 띄우지 않고 서버 프로세스 단위의 단일 app-server
  세션을 재사용한다.
- 프로세스 종료, 프로토콜 오류, CLI 버전 변경 시 한 번만 안전하게 재기동한다.
- 일반 공급자 오류가 발생해도 API 키 경로로 묵시 전환하지 않는다. 사용자가 선택한
  계정·비용 경계를 보존하기 위해 명시적인 오류와 전환 선택지를 표시한다.

## 4. 로컬 여부 판정

다음 조건을 모두 만족할 때만 `chatgpt-local`을 활성화한다.

- ESA 요청 Host가 loopback(`localhost`, `127.0.0.1`, `[::1]`)이다.
- 서버에서 `codex` 실행 파일과 지원 app-server 프로토콜을 확인할 수 있다.
- app-server 초기화와 `account/read`가 성공한다.

`NODE_ENV`만으로 로컬 여부를 판정하지 않는다. 로컬 production build도 사용할 수
있고, 반대로 공개 preview에서 development 설정이 사용될 수 있기 때문이다.

비-loopback 요청은 `404`로 닫아 기능 존재와 계정 상태를 외부에 노출하지 않는다.

## 5. app-server 계약

Codex CLI가 생성한 현재 프로토콜 스키마를 기준으로 다음 메서드만 사용한다.

- `initialize`
- `account/read`
- `account/login/start`
- `account/login/cancel`
- `account/logout`
- `model/list`
- `thread/start`
- `turn/start`
- `turn/interrupt`

ESA는 app-server 전체 JSON-RPC를 HTTP로 노출하지 않는다. 위 기능을 좁은 내부
함수로 감싸고, 클라이언트에는 ESA 전용 상태·로그인·모델·생성 계약만 제공한다.

로그인은 `type: "chatgpt"` 또는 공식 device-code 방식만 허용한다.
`chatgptAuthTokens`처럼 클라이언트가 액세스 토큰을 직접 주입하는 내부용 계약은
사용하지 않는다.

## 6. 텍스트 답변·계산기 배선

기존 `electrical-chat-client`와 `/api/chat`의 다음 의미를 보존한다.

- 완전한 계산 질문은 ESA 계산기를 먼저 실행한다.
- 계산기 ID·입력·결과·판정을 모델보다 먼저 영수증 이벤트로 보낸다.
- 모델은 계산을 다시 만들어내지 않고 계산 영수증을 설명한다.
- 기존 SSE 이벤트 순서와 취소 동작을 유지한다.

`chatgpt-local`은 기존 공급자 SDK 대신 app-server의 ephemeral thread와 turn을
사용한다. 한 ESA 대화 안에서는 thread를 재사용할 수 있지만, 새 브라우저 세션에서
과거 Codex thread를 임의로 복구하지 않는다.

## 7. 도면 분석 배선

도면 분석은 기존 전체도면→구획→독립 역할→합산 구조를 변경하지 않는다.

- `symbols`, `connections`, `text`, `logic`, coverage 역할은 기존처럼 별도 호출한다.
- 단일 SLD·OCR·전체도면처럼 출력 계약이 하나인 경로는 완전한 구조화 출력 스키마를
  `turn/start.outputSchema`에 전달한다. 역할별 출력은 서로 다른 계약이므로 불완전한
  범용 `{type:"object"}` 스키마를 보내지 않고 JSON 전용 프롬프트 뒤 기존 역할별
  엄격 파서로 검증한다.
- 이미지는 원본 파일 경로 대신 요청 범위의 data URL로 전달한다.
- 원본 해시, 페이지, 구획, `Sxx`·`Lxx`·`Pxx-Cxxx` 출처 ID는 기존 서버 검증기가
  다시 확인한다.
- app-server 출력이라고 해서 신뢰하지 않으며, 기존 JSON salvage·출처·봉인·
  전기 논리 게이트를 그대로 통과해야 한다.

## 8. UI

설정의 OpenAI 영역에 인증 방식을 분리해 표시한다.

- `API 키 사용`
- `ChatGPT 계정 사용 (로컬)`

ChatGPT 계정 카드에는 다음만 표시한다.

- Codex 설치 여부
- 연결 상태
- 마스킹한 이메일
- 플랜 유형
- 사용 가능 모델
- `연결`, `다시 확인`, `연결 해제`

선택이 저장되면 채팅과 Vision 공급자 선택이 `chatgpt-local`로 자동 전환된다.
연결이 끊긴 상태에서는 요청 버튼을 실행한 뒤 실패시키지 않고 전송 전에 안내한다.

## 9. 보안 경계

- ESA는 ChatGPT 비밀번호, 쿠키, access token, refresh token을 읽거나 저장하지 않는다.
- app-server는 stdio만 사용하며 TCP/WebSocket 리스너를 열지 않는다.
- 원격 Host와 교차 출처 요청에서 로컬 계정 API를 노출하지 않는다.
- app-server의 `thread/shellCommand` 등 임의 명령 RPC를 ESA 라우트에 매핑하지 않는다.
- 추론 thread는 임시 빈 작업 디렉터리와 최소 권한으로 시작한다.
- 웹 검색, MCP, 동적 도구, 파일 변경은 켜지 않는다.
- command/file-change/approval 이벤트가 발생하면 해당 turn을 중단하고 결과를 폐기한다.
- 현재 CLI에서 추론 전용 권한을 fail-closed로 만들 수 없는 경우, 공개 시연 가능
  상태로 표시하지 않고 로컬 실험 기능으로만 남긴다.
- 계정 이메일과 플랜은 서버 로그에 남기지 않는다.

## 10. 오류 처리

| 상황 | 사용자 표시 | 동작 |
|---|---|---|
| Codex 미설치 | 설치 필요 | 로그인 버튼 비활성 |
| 미로그인 | ChatGPT 연결 필요 | 공식 로그인 URL 열기 |
| 로그인 취소/만료 | 연결되지 않음 | 토큰 재사용·추출 금지 |
| 모델 없음 | 사용 가능한 모델 없음 | 요청 차단 |
| 사용량 제한 | 계정 사용량 제한 | API 키 공급자 선택 안내 |
| app-server 종료 | 로컬 연결 복구 중 | 1회 재기동 후 실패 |
| 도구 실행 시도 | 안전 정책으로 중단 | turn 폐기, 결과 미사용 |
| 비-loopback 접근 | 노출하지 않음 | 404 |

## 11. 검증

### 단위·계약

- loopback/원격 Host 판정
- JSON-RPC 요청 ID, timeout, 취소, 프로세스 종료
- 계정·로그인·모델 응답 redaction
- `chatgpt-local`에서 API 키가 요구되거나 전달되지 않음
- 계산 영수증→모델 입력→SSE 순서
- 이미지 역할별 호출과 구조화 출력
- 명령·파일 변경·승인 이벤트 fail-closed

### 통합

- 현재 로그인된 개인 ChatGPT 계정으로 `account/read`
- 실제 `model/list`와 UI 선택 목록 일치
- 초급·중급·고급 전기 질문 각 1회
- 계산 질문 1회에서 ESA 계산기 선실행 확인
- 공개 교보재 이미지 도면 1건의 역할별 분석과 합산
- 로그아웃 후 요청이 전송 전에 차단되는지 확인

실계정 테스트는 사용자가 직접 완료한 공식 로그인만 사용하며, 계정 자격증명이나
토큰을 테스트 fixture와 로그에 기록하지 않는다.

2026-07-31 로컬 실측에서 텍스트·계산 영수증·SLD·OCR 왕복을 확인했다. 같은
`wiki-oneline.png`에서 `gpt-5.6-terra` SLD는 기기 17개·연결 16개로 완료됐고
`gpt-5.4-mini`는 120초 제한을 넘었다. 이는 전송·파싱 완주 증거이며 역할별 전체
합산 정확도나 95% 외부 품질 증거가 아니다.

## 12. 공개 배포 전환

현재 `ChatGPTLocalTransport`의 호출자와 계약은 유지하고 전송 구현만 교체한다.

```text
현재: ESA 로컬 서버 ──stdio──> Codex app-server
향후: ESA 공개 브라우저 ──pairing──> 사용자 PC 연결 도우미 ──stdio──> Codex app-server
```

공개 전환 전에는 연결 도우미의 loopback 결박, 출처 allowlist, 일회용 pairing,
서명된 세션, 자동 업데이트, 제거 절차를 별도 보안 심사한다. OpenAI가 일반 파트너
OAuth를 제공하면 같은 공급자 인터페이스에 공식 원격 구현을 추가하되, 현재 로컬
세션을 서버 토큰 저장 방식으로 변환하지 않는다.
