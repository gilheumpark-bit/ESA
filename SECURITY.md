# ESVA 보안 정책

> 최종 확인: 2026-07-31 · 적용 대상: 현재 `main`과 병합 예정 변경

## 취약점 제보

보안 취약점은 공개 GitHub issue에 올리지 마십시오.

1. `gilheumpark@gmail.com`으로 재현 절차, 영향 범위, 관련 파일과 가능한 완화책을 보냅니다.
2. 실제 API 키, 회사 도면, 개인정보는 첨부하지 않습니다. 필요한 경우 비민감 재현 자료를 만듭니다.
3. 접수 확인 목표는 영업일 기준 5일입니다. 수정·공개 일정은 심각도와 배포 상태를 확인한 뒤 조정합니다.

## 신뢰 경계

### BYOK와 AI

- 새 BYOK 키는 브라우저 Web Crypto의 AES-256-GCM으로 암호화합니다.
- 추출 불가능한 `CryptoKey`는 IndexedDB, 암호문은 `localStorage`에 저장합니다.
- 복호화한 키는 AI 요청 중 TLS로 ESVA 서버를 통과해 공급자 호출에 사용됩니다. “서버를 전혀 통과하지 않는다”고 표현하지 않습니다.
- 애플리케이션은 평문 키를 DB, 로그, URL, 응답에 저장하지 않아야 합니다.
- 채팅 시스템 지침은 서버가 생성합니다. 클라이언트가 보낸 시스템 지침은 신뢰하지 않습니다.
- 완전한 계산 질문은 정본 계산기를 먼저 실행하고 그 영수증만 확인된 수치 근거로 모델에 전달합니다.

레거시 BYOK 암호문은 마이그레이션을 위해 복호화 경로가 남아 있습니다. 새 저장은 브라우저 결박 v5 형식만 사용합니다.

### 로컬 ChatGPT 계정

- 로컬 ESA는 loopback과 same-origin 요청에서만 같은 PC의 `codex app-server`에 stdio로 연결합니다. TCP나 WebSocket 포트를 열지 않습니다.
- 계정 로그인은 Codex가 소유합니다. ESA는 ChatGPT 비밀번호, 쿠키, access token, refresh token을 읽거나 저장하지 않습니다.
- 클라이언트에는 마스킹한 이메일, 플랜 유형, 허용 모델만 반환합니다. 원격 Host에는 계정 API 존재를 404로 숨깁니다.
- 추론은 빈 임시 작업 디렉터리의 ephemeral thread로 실행합니다. command, file change, MCP, dynamic tool, web search, 협업 에이전트, 승인 요청 이벤트가 나오면 turn을 중단하고 결과를 사용하지 않습니다.
- 공개 배포 서버가 사용자 PC의 Codex 세션을 직접 사용하는 경로는 없습니다. 향후 연결 도우미는 pairing·출처·업데이트·제거 정책을 별도로 심사해야 합니다.

### 인증과 소유권

- 보호 API는 Firebase ID 토큰을 서버에서 검증합니다.
- 요청 본문의 `userId`나 디코딩만 한 JWT를 권한 근거로 사용하지 않습니다.
- 프로젝트, 영수증, 보고서, 알림, 커뮤니티, 현장 기록은 서버 검증 UID와 리소스 소유권 또는 공개 범위를 함께 확인합니다.
- Supabase service-role 키는 서버 전용이며 `NEXT_PUBLIC_*`로 노출하지 않습니다.
- Supabase RLS 정책은 `auth.uid()`, 즉 Supabase Auth 주체를 기준으로 작성돼 있습니다. 이 앱의 주체는 Firebase UID이고 DB 접근은 service-role로 하며 service-role은 RLS를 우회합니다. 따라서 현재 앱 트래픽의 실제 경계는 RLS가 아니라 Route Handler의 서버측 소유권 검증입니다. 정책이 존재한다는 이유로 행 수준 방어가 활성화됐다고 주장하지 않습니다.

### 파일과 도면

- 업로드는 형식, 크기, 페이지 수, 총 픽셀과 실행 예산을 제한합니다.
- 원본 도면과 작업 결과는 SHA-256 source hash로 결박합니다.
- SLD V3 원본 임대는 `DRAWING_SOURCE_LEASE_SECRET`으로 파생한 AES-256-GCM 암호문으로 저장하며 owner와 작업 ID를 확인합니다.
- 운영 저장 경로가 없으면 내구 저장 성공으로 위장하지 않습니다.

### 외부 연결

- 온프레미스 AI는 `ONPREMISE_ALLOWED_ORIGINS`의 정확한 origin만 허용합니다.
- Stripe는 서명 웹훅과 멱등 이벤트 원장을 권한 정본으로 사용합니다.
- Weaviate, Pinata, 크롤러와 기타 외부 fetch는 별도 자격증명·허용 정책·타임아웃이 필요합니다.
- `src/lib/fetch-url-guard.ts`는 현재 export만 있고 일반 production caller가 없습니다. 이 유틸리티가 존재한다는 이유로 전체 SSRF 방어가 활성화됐다고 주장하지 않습니다. 새 사용자 지정 URL 기능은 실제 호출부에 정책을 연결하고 우회 IP를 테스트해야 합니다.

### 요청 제한과 관측

- `src/proxy.ts`와 Route Handler의 제한은 단일 프로세스 보호입니다. 다중 인스턴스 전역 쿼터는 공유 저장소 또는 신뢰 프록시가 필요합니다.
- Sentry client, server, edge 설정은 DSN이 있을 때만 초기화하며 `sendDefaultPii=false`를 사용합니다.
- DSN이 없으면 Sentry는 no-op이고 구조화 로그가 기본 관측 수단입니다.
- 오류 응답과 로그에 환경 변수, 공급자 원문 응답, API 키와 업로드 본문을 넣지 않습니다.

## 영수증과 서명

- 일반 계산·보고서의 SHA-256은 저장 내용의 동일성을 확인합니다. 제3자 공증이나 법적 서명이 아닙니다.
- 구형 SLD golden 영수증과 SLD V3 외부 평가 영수증은 별도 계약입니다.
- V3의 Ed25519 서명은 승인된 평가 메타데이터와 지표 위조를 막는 장치입니다. 현장 설계 승인이나 도면 소유권을 증명하지 않습니다.
- IPFS 타임스탬프 등록은 기본 비활성이며 블록체인 거래나 제3자 공증으로 표현하지 않습니다.

## 알려진 공백

- 다중 인스턴스 공유 레이트 리밋이 없습니다.
- 일반 사용자 지정 URL fetch 전체를 포괄하는 공통 SSRF guard는 production caller에 배선되지 않았습니다.
- 외부 AI 공급자별 프롬프트 주입·출력 품질은 실제 모델과 반복 표본으로 계속 검증해야 합니다.
- Supabase, Stripe, Weaviate, Pinata의 운영 자격증명 왕복은 배포 환경마다 별도 확인해야 합니다.
- 회사 기밀 도면, 실제 고객 개인정보, 운영 결제 데이터로 자동 QA를 실행하지 않습니다.
- `npm audit` high 33건이 남아 있으며 전부 `brace-expansion <=5.0.7`의 ReDoS 하나에서 파생됩니다(minimatch → readdir-glob → archiver → exceljs, 그리고 eslint·jest 계열). 2026-07-25에 `overrides`로 `brace-expansion@5.0.8` 강제를 실제로 적용해 봤습니다 — `npm audit`은 0건이 됐지만 `minimatch@3`이 `TypeError: expand is not a function`으로 깨졌습니다(5.x가 기본 내보내기를 바꿨습니다). ESLint가 즉시 실패했고, 같은 `minimatch@3`을 `archiver`/`readdir-glob`도 쓰므로 Excel 내보내기가 테스트로는 안 잡히는 방식으로 깨질 수 있어 되돌렸습니다. npm이 제시하는 대안은 `exceljs@4.1.1`로의 semver-major 다운그레이드라 취약점 해소가 아니라 기능 후퇴입니다. ReDoS는 공격자가 glob 패턴을 제어할 때 도달하는데 이 앱의 glob은 전부 저장소 설정과 자체 생성 경로라 현재 도달 경로가 없습니다. 상류 `minimatch`가 patched `brace-expansion`을 받으면 재평가합니다.
- RLS 정책이 `auth.uid()`에 묶여 있어, 브라우저 Supabase 클라이언트를 추가하면 Firebase 사용자에게는 `auth.uid()`가 NULL이라 own-row 정책이 전면 차단됩니다. 차단은 안전한 방향이지만 원인을 알기 어려운 장애로 나타납니다. Firebase 주체를 RLS로 실제 집행하려면 `request.jwt.claims` 기준으로 정책을 다시 써야 합니다.

## 배포 전 보안 확인

```bash
npm audit --omit=dev
npm run lint -- --max-warnings=0
npm test -- --runInBand
npm run build
```

추가로 다음을 실제 배포 환경에서 확인합니다.

- Firebase 토큰 만료·다른 사용자 IDOR 거부
- Supabase RLS와 service-role 서버 경계
- Stripe 테스트 모드 서명 웹훅과 중복 이벤트
- 온프레미스 origin 허용·거부와 loopback 정책
- 업로드 크기·페이지·픽셀·시간 제한
- 로그와 Sentry 이벤트의 키·PII·도면 본문 누출 여부

보안 상태는 문서만으로 통과하지 않습니다. 현재 리비전의 테스트와 실제 배포 관측을 함께 남겨야 합니다.
