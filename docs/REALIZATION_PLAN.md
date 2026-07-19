# ESVA 현실화 계획 (Realization Plan)

> 작성 2026-07-19 · feat/esva-v1.0 · 근거: 전 페이지/API/엔진/제품 인벤토리(에이전트 실측 grep, file:line) + 계산기 57 검증 + 도면 파이프라인 매핑.
> "현실성 렌즈": REAL(실작동) · PARTIAL(일부) · DORMANT(코드有·호출0) · STUB(빈껍데기) · FAKED(가짜값 하드코딩) · DEMO(목업) · FLAG-OFF(플래그로 꺼짐).

---

## 1. 마스터 카탈로그 (요약 + 현실화 백로그)

### 1.1 페이지 (36개)
- **REAL (대다수)**: 홈·검색·calc 허브·calc 실행·field·standards·glossary·settings·byok·compare·projects×3·community×3·mobile·history·receipt×2·정적(terms/privacy/…)·contact.
- **DEMO-ONLY**: `/report/[id]`(항상 데모 리포트 — API fetch 주석·sessionStorage 미기록).
- **DORMANT**: `/preview/ax`·`/preview/ax/answer`·`/preview/concept-v2`·`/preview/concept-v2/answer`(디자인 프로토타입·인바운드 링크 0).
- **PARTIAL**: `/dashboard`(뉴스 항상 빈값·글로벌비교 하드코딩 프리셋) · `/admin`(실 API + 목업 폴백 "데모 데이터" 배지) · `/settings/onpremise`(설정을 sessionStorage에 쓰지만 **읽는 코드 없음** → 온프렘 활성화 무효).

### 1.2 API (35 라우트)
- **REAL & 정상 배선**: calculate·sld(BYOK)·autocomplete·chat·community×3·convert·dashboard·export(POST)·feedback·field×2·notifications·ocr·projects×2·search·onpremise-test·standard-convert·youtube (+ health·openapi 인프라).
- **DORMANT (호출 0)**: `/api/calculate/batch` · `/api/calculate/[id]`(페이지가 부재 라우트 호출) · `/api/team-review` · `/api/benchmark` · `/api/review` · `/api/cron/crawl`(vercel.json 미등록).
- **FLAG-OFF (기본 403)**: `/api/dxf` · `/api/pdf-drawing` (`DRAWING_PARSER=false`).
- **FAKED/PARTIAL**: `/api/admin`(usage 타일·tenant 블록 하드코딩 목업, source='database'에도 반환).
- **배선버그(라우트는 정상, 호출부가 깨짐)**: `/api/checkout` `<a href>` GET→POST전용 **405** · `/api/export` 리포트 `window.open` GET→**405** · `/api/notarize` 미검증 JWT claim 티어 fast-path(권한상승) · receipt 페이지가 부재 `/api/receipt/[id]` 호출.

### 1.3 계산기 (57개) — ✅ 검증 완료(별건)
전수 known-answer 검증 완료. 2버그(impedance-voltage %Z·motor-efficiency IE1절감) + 3 공식정정 수리·47개 accuracy 테스트 잠금(커밋 7c84d42·e3485e5, jest 496 GREEN). 잔여: push/병합 미실시.

### 1.4 도면 (SLD) 파이프라인
- **REAL(도달)**: 이미지→VLM 기기인식 + "추천 계산 순서(plan)". DXF/PDF 파서도 실재하나 **FLAG-OFF(403)**.
- **DORMANT+FAKED(미도달)**: 분석·개선제안(sld/layout/consensus team·`/api/team-review`) 코드는 실재하나 UI 호출 0. **도면→계산 다리 위조**: `sld-team.ts:189/245`가 `compliant:true` 하드코딩, `:261` 가정 100A. 마감 모듈 `executeCalcChain`·`extractCalcParams`·`generateDesignReview` 전부 dead. 파서 node-id 불일치로 연결 그래프 단절.

### 1.5 엔진/표준
- **REAL**: quality-checklist(19규칙 임계값) · audit-engine(16영역 A~F 가중·critical auto-F) · receipt seal(SHA-256) · standard-refs(78) · knowledge-graph(~80노드) · intent-parser/tools(계산기 라우팅).
- **표준 판정 DATA-THIN(핵심 리스크)**: 조항은 ~239개(KEC 137·NEC 41·IEC 24·JIS 19·ESA 8·NER 10)지만 **실제 pass/fail 평가기는 ~13개뿐**. 나머지는 evaluator-guard가 HOLD 처리(value:0 placeholder)하거나 KEC-extended 59개처럼 `==1`(플래그 켜짐?) 사소 체크. **ESA·NER은 열람 전용**(evaluateStandard 미라우팅→판정 불가).
- **위조/미적용(안전)**: `standard-comparator.compareAmpacity`가 NEC/IEC를 **KEC×0.95/×0.98로 날조**(실 테이블 `data/ampacity-tables/` 존재하는데 미사용·compare 페이지 노출) · quality-checklist **입력 없으면 PASS**(빈 데이터=합격) · `/api/chat`이 `output-filter`(무근거 숫자 차단) **미적용** · SJC `judge.ts`+`source-tracker.ts`(엔진 판정·무근거 BLOCK 게이트) **dormant**(계산기는 types.ts 직접 호출) · `verifyReceipt` 변조검증 **프로덕션 호출 0**(seal만 실작동·keyless).
- **검증 파이프라인 전체가 UI-고아**: audit·quality·multi-team·gen-verify는 `/api/review`, standards-team은 `/api/team-review` 경유인데 둘 다 UI 호출 0.
- **DEAD(prune/wire 대상)**: `design-review.ts`·`calc-chain-executor.ts`·`chain/index.ts`·`reverse-calc(-extended).ts`·`sensitivity.ts`·`override.ts`·`llm/system-prompt.ts`.

### 1.6 제품/횡단
- **REAL**: 인증(Firebase+jose JWKS)·API 신원/소유권 검증·BYOK 키(AES-GCM)·community·projects·dashboard·i18n·in-app 알림·rate-limit(인메모리).
- **공동(空洞) — 결제/티어**: 크레딧 원장 **없음** · Stripe **webhook 없음** · billing 스키마 없음 · `getUserTier`가 부재 `user_profiles` 조회(실테이블 `users`)→항상 free · checkout 405 · **`OPEN_BETA=true`가 전부 가림**(현재 모두 Pro).
- **DORMANT/STUB**: RAG/Weaviate(미프로비저닝→local 폴백) · team-review(UI 0) · 알림 email/push 발송(prefs만·sender 없음) · analytics(stdout만·집계 없음) · BYOK 클라우드 동기화(문구만).
- **플래그 기본 OFF 2개**: `DRAWING_PARSER`, `RECEIPT_NOTARIZE`. (별도 `OPEN_BETA=true` 하드코딩)

---

## 2. 현실화 계획 (우선순위 배치)

원칙: **안전(거짓 판정 제거) > 깨진 배선 > 죽은 핵심기능 배선 > 정리 > 결제/인프라(외부 의존)**. A~D는 코드 전용(외부 의존 없음)이라 자율 실행 가능. E~F는 외부 리소스(Stripe 키·Weaviate·SMTP) 필요 → 코드는 짜되 활성화는 사용자 제공 대기.

### Batch A — 안전: 거짓 판정 제거 (코드 전용) 🔴
- **A1** `standard-comparator.compareAmpacity` 날조 제거: NEC/IEC를 KEC×0.95/×0.98이 아니라 실 테이블(`data/ampacity-tables/`)에서 조회. **사용자 도달(compare 페이지)·안전 직결·실테이블 존재 → 최우선.**
- **A2** `sld-team.ts` 위조 제거: `compliant:true` 하드코딩·가정 100A → 실제 계산기 연결 또는 "수동검증 필요"로 정직 반환(거짓 합격 landmine).
- **A3** `quality-checklist` "입력 없으면 PASS" → HOLD/needs-data. 빈 데이터 만점 차단.
- **A4** `/api/chat` `output-filter` 적용(무근거 숫자 차단 게이트를 실제 채팅 경로에). LLM 할루 숫자 방어.

### Batch B — 깨진 배선 수리 (코드 전용)
- **B1** `/api/export` 리포트 GET→405: `/report/[id]` 다운로드를 POST+blob로.
- **B2** receipt 페이지: 부재 `/api/receipt/[id]` → `/api/calculate/[id]`로 교정(또는 alias 라우트 신설·응답 shape 정합).
- **B3** `/api/notarize` 미검증 JWT claim 티어 fast-path 제거(서버 검증만).

### Batch C — 죽은 핵심기능 배선 (코드 전용) — 도면의 "분석·개선제안" 실현
- **C1** `/api/team-review` → SLD/리포트 UI 연결 + 리포트 실제 생성·저장 → `/report/[id]` DEMO 해제.
- **C2** 도면→실계산 다리 복구: node-id 통일(연결성)·`extractCalcParams`→`executeCalcChain`로 57계산기 실구동·standard-drawing taxonomy 매핑.
- **C3** `DRAWING_PARSER` 플래그 ON(DXF/PDF 해제) — 미출시라 저위험.
- **C4** `/api/review`·`/api/calculate/batch` 가치 있는 곳에 UI 연결.

### Batch D — 죽은/오해 표면 정리 (코드 전용)
- **D1** `/preview/*` 4페이지: 제거 또는 내부 전용 게이트.
- **D2** `/settings/onpremise` 저장값을 chat 경로가 읽게 배선(또는 제거).
- **D3** `/dashboard` 뉴스·하드코딩 프리셋 실데이터화. `/admin` 목업 타일 실API 또는 명확 라벨.
- **D4** 홈/로그인 하드코딩 통계 수치 → SoT(CALCULATOR_COUNT 등) 참조.

### Batch C2 — 표준 판정 실질화 + 무결성 (코드 전용)
- **G1** 고빈도 조항 placeholder→dedicated evaluator 승격(NEC/IEC/JIS 과전류·허용전류·접지·전압강하). value:0 HOLD를 실 pass/fail로. (사용자 지침: 임계값은 공인값만·추정 금지)
- **G2** ESA·NER을 `evaluateStandard`에 라우팅(현재 열람 전용).
- **G3** `verifyReceipt`를 receipt 조회 경로에 실제 호출(변조검증 노출). HMAC 서명은 별도 검토.
- **G4** SJC `judge.ts`+`source-tracker.ts`(무근거 BLOCK) 또는 등가 게이트를 실경로에 배선(또는 명시적 제거).

### Batch E — 결제/티어 (외부 의존: Stripe 키) 💰
- **E1** `getUserTier` → `users` 테이블 + Firebase UID 매핑. tier CHECK에 `team` 추가.
- **E2** Stripe webhook + fulfillment + billing 스키마 컬럼.
- **E3** checkout `<a>` → POST fetch(priceId/returnUrl).
- **E4** `OPEN_BETA` 수명주기 문서화·게이트(E1 없이 끄면 전원 잠김 방지).

### Batch F — 인프라 (외부 의존: Weaviate·SMTP·store)
- **F1** RAG/Weaviate 프로비저닝 or 검색을 "로컬 전용" 명시.
- **F2** 알림 email/push 발송 채널 구현 or 토글 제거.
- **F3** analytics 저장/집계 sink.
- **F4** 분산 rate-limit(Redis/Upstash).

---

## 3. 실행 상태 (2026-07-20 갱신)

| 배치 | 상태 | 커밋 |
|---|---|---|
| A 안전(A1~A4) | ✅ 완료 | 838daf4·b189741·c4a08a4 (aa94609 혼입→분리 재커밋) |
| B 배선(#1 checkout·#2 export·#3 receipt·notarize) | ✅ 완료 | 0aea260·2deeaca·df98c81 (+배치 B3) |
| D 표면 정리(D1~D4+Onboarding) | ✅ 완료 | 651641c·7a92dd4 일부 |
| C 도면(C1 UI배선·C2 node-id·C3 플래그 ON) | ✅ 완료 — 잠복 3버그(ctor interop·LINE vertices·끝점 결속)까지 | 4629e41·7a92dd4 |
| C 잔여 C4(/api/review·batch UI) | ⏸ 보류 — 명확한 표면 없음(YAGNI), dormant 유지 선언 |
| C2 무결성(G2 ESA/NER·G3 verifyReceipt) | ✅ 완료 | 0717c05 |
| C2 잔여 G1·G4·dead 정리·D2 onpremise | ✅ 완료 — G1 6조항 승격(실평가기 13→19·430.32 의도 보류)·G4 judge/source-tracker 삭제 결정·dead 6모듈 제거+DORMANT_MANIFEST·D2 chat 배선(SSRF 사설만) |
| E/F 결제·인프라 | ⏸ **유일 잔여** — 외부 리소스 대기(Stripe 키/Weaviate/SMTP). writer 봉인 스냅샷·G1 추가승격(원문 확인 필요분)도 이때 |

라이브 실증 하이라이트: 도면 파이프라인 최초 개통 — 실 DXF 업로드→토폴로지 valid(고립 0)→
4팀 리뷰→ESVA Verified 리포트(honest-HOLD 마킹) 생성, /report/[id] 인계 배선.

## 3-구. 실행 순서
A(안전) → B(배선) → D(정리) → C(핵심기능·큰 작업) → E/F(외부 의존, 사용자 리소스 대기). 각 배치 종료마다 게이트(jest·tsc·build) + `[심사 증거]`. E/F는 코드까지만·활성화는 키/호스트 제공 시.
