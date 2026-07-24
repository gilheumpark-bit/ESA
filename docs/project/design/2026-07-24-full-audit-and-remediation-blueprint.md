# ESA 종합 감사 보고서 · 수리 설계도

2026-07-24 · 감사 기준선 `6bcf39f` (base `fef4352`) · PR [#24](https://github.com/gilheumpark-bit/ESA/pull/24)

CI 복구에서 시작해 전수 딥 패스까지 이어진 감사의 결론과, 확인된 결함을
닫기 위한 설계를 한 문서에 담는다. 개별 설계 2건은 별도 문서로 있고
([토폴로지](2026-07-24-topology-snap-and-classification-redesign.md) ·
[약점 축 90점](2026-07-24-weak-axes-to-90-design.md)) 여기서는 그 둘을
전체 그림 안에 배치한다.

## 0. 이 문서를 읽는 법

- **주장에는 앵커가 있다.** 커밋 SHA, CI run/job ID, 파일:라인, 실행 명령.
  앵커 없는 문장은 추정이며 그렇게 표시했다.
- **실행하지 않은 검사는 통과로 쓰지 않는다.** 이 감사 세션은 `npm ci`가
  레지스트리 403으로 막혀 있어 `tsc`·`lint`·`jest`·`build`·`gate:pdf`를
  직접 실행하지 못했다. 해당 결과는 전부 CI 실측을 인용한다.
- **오탐을 결함과 같은 비중으로 기록한다.** 걷어낸 오탐이 이번 감사의
  최대 소득이다.

---

## 1. 감사 범위와 실제 커버리지

| 구분 | 규모 | 커버리지 |
|---|--:|---|
| `src` 전체 | 약 124,000줄 / 476파일 | 패턴 전수 스캔 |
| 정밀 정독 | 약 34,000줄 | 배치 1~6 |
| `supabase/migrations` | 1,503줄 / 6파일 | **전수 정독 + 정책 파싱** |
| 페이지 | 33개 | 정적 신호 전수 + 후보 5개 정독 |
| API 라우트 | 49개 | 경계 행렬 전수 + 의심 6개 정독 |
| 테스트 | 185파일 / 1,237테스트 | 계량 전수 + 표본 정독 |

**수행하지 않은 검사** — 브라우저 실측(스크린샷·클릭·반응형·접근성),
성능·번들, i18n, 실제 AI 공급자 왕복. 프리뷰 환경과 외부 키가 필요하다.

---

## 2. 확정 결함 (5건)

### [DB-001] 🟡 RLS가 앱 트래픽의 방어선이 아니다

- **근거**: 정책 70개가 `auth.uid()`(Supabase Auth 주체)에 의존.
  앱은 Firebase ID 토큰을 서버에서 검증하고 DB는 `service_role`로 접근하며,
  `service_role`은 RLS를 우회한다. 브라우저 Supabase 클라이언트 호출처 0.
- **현재 위험**: 없음. 실제 경계는 라우트 핸들러의 서버측 소유권 검증이며
  이번 감사에서 동작을 확인했다.
- **미래 위험**: 브라우저 클라이언트를 추가하면 Firebase 사용자에게
  `auth.uid()`가 NULL이라 모든 own-row 정책이 **조용히 전면 차단**된다.
  안전 방향이지만 원인 불명 장애가 된다.
- **수리**: 마이그레이션 헤더와 `SECURITY.md`에 "이 정책들은 service_role
  경계 하에서 비활성인 심층 방어이며, Firebase 주체를 RLS로 쓰려면
  `request.jwt.claims` 기반 재작성이 필요하다"를 명시.

### [DB-002] 🟡 `community_votes` 공개 SELECT가 `user_id`를 노출한다

- **근거**: `001_initial_schema.sql`의 `cv_select_all ... FOR SELECT USING (true)`.
  테이블에 `user_id` · `target_id` · `direction(-1/1)`이 있어 **누가 어떤 글에
  반대표를 던졌는지** 조회 가능.
- **현재 도달 경로 없음**: 브라우저 Supabase 클라이언트 호출처 0,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`는 `/api/health`(서버)와 테스트에서만 참조돼
  클라이언트 번들에 인라인되지 않는다. `supabase-runtime-contract.test.ts`가
  특정 경로의 anon 키 부재를 계약으로 검증하고 있다.
- **수리**: `004`가 `cq/ca_select_all`을 `hidden = false`로 교체한 선례를 따라
  집계 뷰 또는 본인 표 한정으로 축소.

### [LLM-001] 🟡 출처 탐지 창이 비대칭이다

- **근거**: `engine/llm/output-filter.ts:110-115`는 숫자에 대해
  `sPos >= pos && sPos <= pos + 200` — **전방 200자만**. 같은 파일 246-251의
  표준 인용 검사는 `Math.abs(sPos - pos) <= 150` — **양방향**.
- **결과**: `[SOURCE: KEC 232.52] 전압강하는 4.14V입니다` 순서면 정당한
  출처가 무시돼 `[BLOCKED: 출처 없는 수치]`로 치환된다. 정답을 훼손하는
  방향의 오차단이다.
- **미검출 이유**: `output-filter.test.ts`의 통과 케이스가 전부 소스 태그를
  숫자 **뒤에** 둔다. 앞에 두는 케이스가 없다.
- **수리**: 숫자 검사도 양방향으로 통일하고, 소스 태그 선행 케이스를
  회귀 테스트로 잠근다.

### [LLM-002] 🔵 `isClean()`이 `filterLLMOutput()`보다 엄격하다

- **근거**: `isClean()`은 `trustedInput` 인자가 없어 사용자 입력을 그대로
  인용한 숫자도 거부한다. `filterLLMOutput()`은 `isTrustedInput`으로 통과시킨다.
- **실피해 없음**: production 호출처 0 (`engine/index.ts` 재수출만).
- **수리**: 시그니처를 맞추거나, 사용처가 없으면 `DORMANT_MANIFEST` 등재.

### [LLM-003] 🔵 한국어 연도가 오차단될 수 있다

- **근거**: 단위 정규식이 `[A-Za-zΩ]+`라 `년`을 단위로 인식하지 못한다.
  `2021년 개정` 의 `2021`은 unit 없음 · 값 > 10 · 허용 문맥 아님 → 차단.
  `KEC 2021`처럼 표준명이 앞서면 허용 문맥에 걸려 통과한다.
- **수리**: 허용 단위에 한국어 시간·수량 단위(`년 월 일 개 명 회 배`)를 추가.

---

## 3. 오탐 6건 — 결함이 아니었던 것

grep 신호만으로 보고했다면 전부 거짓 결함이 됐을 항목이다. 같은 실수를
반복하지 않도록 판정 근거를 남긴다.

| 오탐 후보 | 기각 근거 |
|---|---|
| UPDATE 정책 `WITH CHECK` 누락 6건 | PostgreSQL은 `WITH CHECK` 생략 시 `USING` 식을 새 행에도 적용한다. 소유자 변경은 이미 차단됨 |
| `target="_blank"` rel 누락 3건 | `rel="noopener noreferrer"`가 다음 줄에 있음. 동일 행 grep의 한계 |
| `dangerouslySetInnerHTML` 2건 | `LaTeX.tsx`는 KaTeX 출력이며 **`trust: false`** 설정됨. `ThemeInitScript.tsx`는 사용자 입력이 닿지 않는 정적 상수 |
| 계산기 테스트 단언 부족 5파일 | `close()` 헬퍼가 `expect`를 래핑. 리터럴 `expect(` 카운트의 한계 |
| `/mobile` 로딩 UI 없음 | `'idle'\|'capturing'\|'processing'\|'done'\|'error'` 상태 기계 사용 |
| BYOK `localStorage` 평문 저장 | 저장값은 `encryptKey()` 산출 암호문(`v5:` 접두). 키는 IndexedDB 비추출 CryptoKey. CLAUDE.md 계약 준수 |

---

## 4. 확인된 강점 (실측 근거 포함)

| 항목 | 근거 |
|---|---|
| RLS 커버리지 | 테이블 25개 중 **25개 활성**, 7개는 정책 0 = service_role 전용 fail-closed |
| audit_log 불변성 | `003`이 `BEFORE UPDATE OR DELETE` 트리거로 **service_role도 차단** |
| 공유 비밀번호 제한 | `005` — `SECURITY DEFINER` + `SET search_path` + 입력 정규식 + `REVOKE ALL FROM PUBLIC, anon, authenticated` + 원자적 슬라이딩 윈도우(5회/15분) |
| 계산기 정확도 테스트 | 기댓값을 표준 공식에서 **손계산**, 산식을 테스트명에 문서화, 앱 출력 복사 명시적 배제, 1% 상대오차 |
| 테스트 위생 | 1,237테스트 · 2,952단언 · **skip/todo 0건** |
| API 문서 정합 | `API_REFERENCE.md` ↔ 실제 라우트 **49개 1:1**, 누락·유령 0 |
| 제안 계층 무발명 | `recommendation-engine.ts` 첫 줄이 계약: *Deterministic recommendation templates — no free-form VLM proposals* |
| 도면 물리량 | 픽셀 기반 길이 추정 **0건**, DXF는 `$INSUNITS`만 |
| BYOK 위생 | vision·electrical 경로에서 키 로그 유출 **0건** |
| XSS 관문 | KaTeX `trust: false` |

---

## 5. 프로덕션 준비도 스코어카드

딥 패스 전 점수는 2% 표본 위의 추정치였다. 아래는 갱신치다.

```
[Production Readiness Scorecard — 2026-07-24 딥 패스 후]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  문서 정합성     █████████░  9/10
  테스트 게이트   ███████░░░  7/10   (6 → 7)
  관측 체계       ████░░░░░░  4/10
  보안 정책       █████████░  9/10   (8 → 9)
  배포 회복력     █████░░░░░  5/10
  기능 성숙도     ████████░░  8/10
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  종합: 7.0 / 10   판정: 클로즈드 베타 가능
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

상향 사유는 새 강점 발견이 아니라 **미확인이 실제로 깨끗했음을 확인**한
것이다. 관측 4점은 변동 없다 — `api-logger`가 49개 라우트 중 5개에만
배선돼 있다.

---

## 6. 수리 설계도

### 6.1 전체 지도

```
                    ┌─ P0 ─────────────────────────────┐
   지금 수리 가능    │ R1 LLM-001 출처 창 양방향        │  CI verify로 검증
   (실행 환경 불요)  │ R2 DB-001 RLS 비활성 명시        │
                    │ R3 DB-002 투표 SELECT 축소       │
                    │ R4 A1 npm audit high 1건         │
                    │ R5 A2 api-logger 49개 배선       │  관측 4 → 7
                    │ R6 A3 coverageThreshold          │  테스트 7 → 8
                    │ R7 LLM-003 한국어 단위           │
                    └──────────────────────────────────┘
                                   │
                    ┌─ P1 ─────────┴───────────────────┐
   실행 환경 필요    │ M0 gate:pdf circuit vs grid 실측 │  ← 잠금 해제 지점
   (npm ci 가능)     │ S1 스냅 반경 유도 (별도 설계)    │
                    │ S2 기기 분류 어휘 계층           │
                    │ S3a findPath parent-map          │
                    │ A5 standalone 자산 복사 자동화   │  배포 5 → 7
                    └──────────────────────────────────┘
                                   │
                    ┌─ P2 ─────────┴───────────────────┐
   전문가 시간 필요  │ W1 라벨 공장 (별도 설계)         │  계량 35 → 90
                    │ A7 롤백·on-call 문서화           │
                    └──────────────────────────────────┘
```

### 6.2 P0 수리 명세

**R1 — 출처 창 양방향화** (`engine/llm/output-filter.ts`)

```
현재: sPos >= pos && sPos <= pos + 200        (전방 한정)
수리: Math.abs(sPos - pos) <= 200             (표준 인용 검사와 동일 형태)
```
회귀 잠금: 소스 태그가 숫자 **앞**에 오는 케이스 · 뒤에 오는 기존 케이스
둘 다 통과. 차단 강도는 그대로 유지된다(창이 넓어질 뿐 무출처 숫자는 계속 차단).

**R2 — RLS 비활성 사실 명시** — 문서만. `002_firebase_contract.sql` 헤더와
`SECURITY.md`에 service_role 경계와 `auth.uid()` 비활성을 기록.

**R3 — `cv_select_all` 축소** — 새 마이그레이션(`006_`)으로
`DROP POLICY` → 집계 뷰 또는 본인 표 한정 정책 생성. `004`의 형태를 따른다.
**주의**: 접두사 중복(`001_` 2건)이 이미 있으므로 새 파일은 `006_`부터.

**R4 — `npm audit` high 1건** — 어떤 패키지인지 먼저 식별해야 한다(현재는
CI 설치 로그의 요약만 확인). CI에 `npm audit --audit-level=high` 단계 추가.

**R5 — `api-logger` 전면 배선** — 현재 5/49. 라우트 핸들러 공통 래퍼로
일괄 적용하되, BYOK·비밀값이 로그에 들어가지 않도록 마스킹 계약을 함께 건다.

**R6 — `coverageThreshold`** — 현재 커버리지를 먼저 측정해 그 값을 기준선으로
고정한다(임의의 높은 수치를 걸어 게이트를 깨뜨리지 않는다).

**R7 — 한국어 단위** — 허용 단위 정규식에 `년 월 일 개 명 회 배 시간 분` 추가.

### 6.3 P1 — M0가 잠금 해제 지점

`gate:pdf` 6/17은 **원인 미확정이 아니다**. 전후 차분으로 롤백 대상이
없음을 확정했다(선분 추출 로직·`endpoint-snap.ts`·fixture·기대값·pdfjs 버전
전부 무변경). 남은 분기는 하나 — 게이트 fixture와 파이프라인 계약 중
어느 쪽이 틀렸는가.

```bash
npm ci && npm run build && npm start -- --port 3010 &
npm run gate:pdf -- http://127.0.0.1:3010
# circuit.pdf(4pt 간격 평행 수직선 2개)와 grid.pdf(닫힌 사각형)의
# lines.length · snap.stats 대조
```

이 실측이 S1(스냅 반경)의 첫 데이터도 된다 — `circuit`은 반경 계산이
결과를 지배하는 형태다.

### 6.4 P2 — 사람 시간이 드는 구간

W1 라벨 공장은 [별도 설계](2026-07-24-weak-axes-to-90-design.md)에 있다.
핵심 제약 둘을 여기 다시 적는다.

- **순환성**: pre-label을 만드는 파이프라인과 평가받는 파이프라인이 같다.
  15장 중 2장 백지 홀드아웃으로 앵커링 편향을 수치 추정해 지표 옆에 병기하며,
  편향 추정 없는 F1은 출고하지 않는다.
- **조달**: 재배포 가능한 실도면 13장 추가 확보가 실제 임계 경로다.
  부족분은 저장소 밖 비공개 세트 + SHA-256 앵커로 운영한다.

---

## 7. 이번 감사 배치에서 실제로 착지한 것

| 커밋 | 내용 | CI |
|---|---|---|
| `7c96763` | CI 차단 2건 수리(죽은 링크·`jest.config.mjs`) + 레인 분리 | verify green |
| `b362cb6`·`12ccb9c` | 중복 run 제거 (첫 시도 실패 → `ref_name`으로 정정) | 실증 완료 |
| `cafb016` | 새 테스트의 tsc 오류 수리 | verify 복구 |
| `a754b92` | `makeBlock` 배선 + 인용 레지스트리 + 원문 유도 | verify green |
| `bab5e43` | 전압강하 20°C를 결정으로 고정(제 지적 철회) | verify green |
| `8d25700` | 제안 계층 근거 결박 3건 | verify green |
| `4213fe7` | 보류에 근거 인용 (`rule-basis.ts`) | verify green |
| `e8be594` | `gate:pdf` 진단 정정 — 회귀 아님 | verify green |
| `7eff3ce`·`6cd199d`·`6bcf39f` | 설계 3종 + 적대 점검 | verify green |

**CI `verify`는 12커밋 연속 green이다.** `live-gates`는 `gate:pdf`로 red이며
M0 전까지 유지된다.

---

## 8. 비변경 원칙 (감사 전체에 적용)

- 게이트 기대값을 실행 없이 낮추지 않는다. 그것은 검증이 아니라 게이트 약화다.
- 판정 입력(도면 기하 파라미터·기기 분류·계산 공식)을 실측 없이 바꾸지 않는다.
- 교보재와 블라인드 라벨은 설계의 심판이지 수정 대상이 아니다.
- 지표 임계값(0.95/0.98)과 fail-closed 설계를 점수를 위해 낮추지 않는다.
- 현업 관행과 어긋나는 "정밀도 개선"을 임의로 넣지 않는다
  (전압강하 20°C 저항률 결정 — [DECISIONS](../DECISIONS.md) 2026-07-24 항목).
