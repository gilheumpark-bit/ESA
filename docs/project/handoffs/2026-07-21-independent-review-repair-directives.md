---
schemaVersion: 1
project: ESA
status: repair-directive
reviewBaselineCommit: f21691cd59268a9c8904cd70e9a3260f7910be10
author: 독립 리뷰(fresh-context 6좌석 + 기계 게이트 7종)
date: 2026-07-21
---

# ESA SLD V3 독립 리뷰 — 수리 지시서 (rev f21691c)

## 0. 이 문서의 성격과 GPT 작업 규칙

기계 게이트는 **전부 green**이었다(tsc 0·lint 0·jest 132스위트 1081·build 0·gate:pdf 9/9·E2E 29/29·gate:sld-v3-contract 5/5). 아래 결함은 전부 그 green 안에서 **정독·손계산으로만** 잡힌 것들이다. 즉 테스트를 맞추는 것으로는 안 닫힌다.

**수리 규칙 (필수):**
1. **반증 테스트 먼저.** 각 항목마다 현재 코드에서 RED가 나는 테스트를 먼저 추가해 결함을 재현하라. 그다음 수리. 테스트가 없으면 "수리했다"고 보고하지 말 것.
2. **도메인 항목은 "왜 틀렸나"를 읽고 이해하라.** 전기 판정 버그(방향·보호·전압·길이)는 테스트 숫자만 맞추면 다시 틀린다. 근거 문단을 이해하고 고쳐라.
3. **수리 회귀 차분.** 수리 전 관련 스위트 기준선 → 수리 후 재실행 → **차분만** 확인. 이번 배치의 이전 수리가 새 회귀를 만든 전례가 있다(락 동결·고무도장 게이트). 네 수리가 새로 깨는지 반드시 확인.
4. **green ≠ 완료.** 마지막에 전체 스위트 무삭제 1회 + `gate:pdf`(신선 서버) + tsc·lint exit 0 재확인.

**검증 상태 범례:** `[확정]` 리뷰어가 실코드 정독/손계산으로 재현 · `[구조의심]` 단독 관점 논증(수리 전 재현 먼저) · `[오탐]` 검증 결과 결함 아님(건드리지 말 것).

**⚠ 오탐 (건드리지 말 것):** 초기 리뷰가 "벡터 렌더 PDF + vision 키 = 전 페이지 실패"라고 했으나, `document-orchestrator.ts:573`에 이미 `|| (page.renderMode === 'vector' && Boolean(input.vision))` 절이 있어 shouldRunRaster가 true가 된다. **정상 작동한다. 이 줄을 지우거나 되돌리지 말 것.**

---

## P0 — 파일럿 차단 (실사용 파일럿 나가기 전 필수)

### P0-1 [확정] 정밀 검증 리포트가 생성 직후 자기 해시로 404가 된다
- **위치:** `src/engine/receipt/receipt-hash.ts:20-37` (`canonicalize`) + 봉인 지점 `src/agent/teams/consensus-team.ts` (reportClaim 해시).
- **증상:** ESVA 정밀 검증(`sld_dxf`·`sld_pdf`) 리포트가 생성 직후 클라이언트 무결성 검사에서 필연 FAIL → sessionStorage 캐시 삭제 → 404 "보고서를 찾을 수 없습니다".
- **왜 틀렸나:** `canonicalize`가 `Object.keys()` 순회라 **값이 `undefined`인 존재-키를 `"key":undefined`로 해시에 포함**한다. 봉인은 서버 인메모리 객체에서(키 존재), 검증은 HTTP JSON 왕복 후 객체에서(=`JSON.stringify`가 undefined-값 키를 **탈락**) 수행 → canonical 문자열 불일치 → 해시 불일치. undefined 생산처: `sld-team.ts`의 `rating: c.rating`·`position: c.position`·`cableType`·`length`(정격/스펙 미표기 부품이면 실도면 사실상 항상), `consensus-team.ts`의 조건부 `standardRef`·`suggestedFix`·`detail`, `debate-protocol.ts`의 `consensusPosition: undefined`.
- **수리 방향:** 봉인 직전 `reportClaim`을 `JSON.parse(JSON.stringify(reportClaim))`으로 정규화(undefined-키 제거) — V3 경로가 `document-orchestrator.ts:739`에서 이미 쓰는 관례. **또는** `canonicalize`가 값이 `undefined`인 키를 skip하도록 수정(JSON 의미론과 정합). 후자가 근본.
- **검증:** **JSON 왕복 후** verify하는 테스트를 추가하라. 현 `consensus-report-integrity.test.ts`는 인메모리 객체를 그대로 재해시하는 닫힌 순환이라 이 결함을 못 잡는다 — `const round = JSON.parse(JSON.stringify(sealed)); expect(verifyReportIntegrity(round)).toBe(true)` 형태로, `rating: undefined`인 부품을 포함한 리포트에 대해.

### P0-2 [확정] 전압 파싱 1000배 오염: "0.400kV" → 400,000V
- **위치:** `src/agent/electrical/domain-normalizer.ts:150-157` (`parseNumber`의 단일 점 분기, 특히 :154).
- **증상:** 변압기 명판 "22.9/0.400kV"에서 저압측 "0.400kV"가 **400,000V**로 파싱돼 전압강하·차단기 계산에 CALCULATED 증거로 무경고 유입. 400V 회로 계산이 1/1000로 오염.
- **왜 틀렸나:** `parseNumber("0.400")` 추적 — dots=[1], tail="400"(길이 3>2) → `/^\d{1,3}\.\d{3}$/.test("0.400")` TRUE → 천단위 그룹핑으로 오해석 → `"0.400".replace('.','')` = `"0400"` → **400**. 정수부가 "0"인데도 천단위 그룹으로 본다. 같은 뿌리로 "6.600kV"→6,600,000V, "역률 0.900"→900.
- **수리 방향:** 단일 점 3자리 소수는 본질적으로 ambiguous("1.500"=1500? 1.5?). 엔지니어링 값의 안전한 기본은 **정수부에 leading zero가 있으면(또는 정수부가 "0") 천단위 해석 금지 → 소수로 확정**. 최소 수리: :154 조건에 `&& !/^0\d/.test(unsigned.slice(0,index))` 류 가드, 그리고 정수부 "0"이면 소수 경로로. 더불어 router의 voltage 바인딩(`drawing-calculation-router.ts` voltage `positive`만 검사)에 도메인 상한(예 ≤ 800kV) 추가.
- **검증:** `expect(parseNumber("0.400")).toBe(0.4)`, `expect(parseNumber("6.600")).toBe(6.6)`, 그리고 기존 통과 케이스 회귀 확인(`"6,600"`→6600, `"22.900,5"`→22900.5는 유지돼야 함).

### P0-3 [확정] 판정 오염 ①: 선분의 기하학적 끝점 순서를 전력 방향으로 오독 → 옳은 도면 FAIL
- **위치:** `src/agent/electrical/logic-conflicts.ts:314-328` (`compareDirection`).
- **증상:** 정상 급전 관계(VCB→TR)를 "역방향(REVERSED_DIRECTION)" CONTRADICTION으로 판정 → verdict FAIL → 최종 리포트 FAIL. 방향 주장당 약 50% 확률(선 추적 방향이 무작위라).
- **왜 틀렸나:** :322-323에서 `graph.edges`의 `from`/`to`와 logic evidence의 `fromId`/`toId`를 방향 비교하는데, **그래프 edge의 from/to는 선분의 기하학적 양끝**이다(`spatial-graph.ts`가 `line.start`/`line.end`로 채움). connections VLM 프롬프트(`role-prompts.ts`)는 "start/end = path endpoints"만 요구하고 **전원측/부하측 방향을 요구하지 않는다** → VLM이 폴리라인을 부하쪽부터 추적하면 edge=(부하→전원). logic 판독이 정확히 "전원 feeds 부하"라 해도 reverse 매치 → 허위 CONTRADICTION. 증거: `electrical-invariants.test.ts`에 "orients … without trusting edge order" 테스트가 있고 역순 fixture를 쓴다 — **invariants는 edge 순서를 안 믿는데(옳음) logic-conflicts만 믿는다(틀림)**.
- **수리 방향:** edge 방향에 신뢰할 근거 계약이 생기기 전까지 **REVERSED_DIRECTION을 CONTRADICTION이 아니라 UNRESOLVED(HOLD)로 강등**(:326). "심판 아닌 조수" 방향과도 정합 — 확신 없으면 사람에게 확인 요청. (근본 수리: connections role에 source→load 방향을 요구하고 그 방향으로 edge를 정렬하는 계약 신설. 이건 별도 작업.)
- **검증:** 역순 edge fixture(부하→전원)에 정방향 logic 주장을 넣고 **CONTRADICTION이 나오지 않음**(HOLD)을 단언하는 테스트.

### P0-4 [확정] 판정 오염 ②: 보호를 1-hop 인접으로만 인정 → 다단 보호가 CONTRADICTION
- **위치:** `src/agent/electrical/logic-conflicts.ts:340-353` (`compareProtection`), `adjacent` :336-337.
- **증상:** 정상 다단 보호(모터 앞 로컬 MCCB + 상류 주 ACB)를 "보호 불일치(PROTECTOR_MISMATCH)" CONTRADICTION으로 판정 → FAIL.
- **왜 틀렸나:** :350은 asserted 보호기기가 **직접 인접(1-hop edge)**일 때만 통과. 전기적으로 보호는 **체인**이다 — 상류 어느 단이든 보호에 기여한다. 시나리오: M1 —MCCB(인접)— BUS —ACB(2-hop). logic "M1 protected by ACB"(참) → ACB 비인접 → known=[MCCB] 1개(:351) → CONTRADICTION(:352). 옳은 도면+옳은 판독이 FAIL.
- **수리 방향:** ① 즉효: PROTECTOR_MISMATCH를 CONTRADICTION→UNRESOLVED(HOLD)로 강등. ② 근본: `adjacent`를 **상류 경로 탐색(비보호 노드 경유 BFS로 subject→protector 도달 가능 & 그 사이 전원방향)**으로 바꿔, 체인 상에 asserted 보호기기가 있으면 통과. 파일럿 응급은 ①.
- **검증:** 2-hop 상류 보호(ACB) 주장 fixture에 CONTRADICTION 안 나옴 단언.

---

## P1 — 파일럿 신뢰 훼손 (실도면 검토 시 티남)

### P1-1 [확정] 케이블 길이 10m 날조 → 사내규정 false PASS
- **위치:** `src/agent/teams/sld-team.ts:510` `const length = conn.length ?? 10;`, 사내규정 경로 호출 `:558` `estimateVoltageDrop(conn)`, `:525` `assumed: false` 하드코딩.
- **왜 틀렸나:** KEC 경로는 `if (conn.length && conn.length > 0)` 가드로 폴백이 죽어 있으나 **사내규정 경로는 무가드**. 길이 미표기 케이블에 가공 10m를 넣어 전압강하를 산출하고 그걸로 사내규정 PASS/FAIL을 확정한다. 게다가 `assumed` 플래그가 **모든 경로에서 false 고정**(설정하는 코드 없음)이라, 이를 방어하려던 `voltageDropPercent: vd && !vd.assumed ? ...` 가드가 사문. 실길이 200m "CV 35sq 100A"가 10m로 → VD 0.23%(실 4.64%) → "전압강하 ≤2%" 사내규정 false PASS.
- **수리 방향:** `?? 10` 폴백 제거(길이 없으면 `null` 반환 → 계산 SKIP/HOLD). `assumed` 플래그를 실제로 설정(길이·전류 추정 시 true)하고 하류 가드가 그걸 존중하게. "추정치로 사내 기준 판정 금지"(코드 주석 :534)를 실제로 집행.
- **검증:** 길이 미표기 연결 → VD 계산이 실행되지 않고 HOLD 나옴 단언.

### P1-2 [확정] 간이 전압강하 추정기 4중 결함
- **위치:** `src/agent/teams/sld-team.ts:507-525` (`estimateVoltageDrop`).
- **왜 틀렸나:** ① `/(\d+)sq/`가 "2.5sq"에서 **"5"를 캡처**(2.5→5, 단면적 2배 오독) ② mm² 표기 무인식 → 35sq 폴백 ③ 분모 380V 고정(22.9kV 급전·단상 220V 무시) ④ 무조건 √3(단상 회로도 3상 계수). 손계산: "2.5sq 20A 40m" 참값 2.60% vs 코드 1.30%(한도 2%에서 판정 반전).
- **수리 방향:** 이상적으론 이 간이 추정기를 폐기하고 엔진의 검증된 voltage-drop 계산기로 위임. 최소 수리: `(\d+(?:\.\d+)?)\s*(?:sq|mm2|mm²)` 파싱, 실계통전압 사용, 단상/3상 상수 분기, 그리고 P1-1의 `assumed` 연동.
- **검증:** 위 손계산 케이스들 known-answer 테스트.

### P1-3 [확정] 정정(corrections)이 실행 중 상태를 되돌려 이중 동시 실행
- **위치:** `src/app/api/drawing-jobs/[jobId]/corrections/route.ts:77` + CAS `src/agent/drawing/drawing-job-store.ts:185`.
- **왜 틀렸나:** `updateOwnedJobIfDocumentVersion`이 `document.updatedAt`만 대조하고 **store의 실행 상태(status)는 검사하지 않는다**. resume 실행 중 저장된 document는 직전 PARTIAL 산출물이라 CAS 통과 → patch가 status를 PARTIAL로 덮음 → resume claim 허용목록 `['PARTIAL']`이 두 번째 실행을 허용 → 같은 job 오케스트레이터 2개 동시 실행(VLM 비용 2배·문서 인터리브·정정 소실).
- **수리 방향:** CAS에 store status 가드 추가 — 현재 상태가 mid-run(ENUMERATING/SURVEYING/ANALYZING_PAGES/RESCANNING_GAPS/RECONCILING_PAGES/SYNTHESIZING)이면 409. **또는** corrections patch에서 `status` 필드를 아예 빼서(문서만 갱신) 상태 역행을 원천 차단.
- **검증:** mid-run status에서 corrections 호출 → 409(또는 status 불변) 단언. 기존 corrections 테스트는 store를 전부 mock하므로 실 store CAS를 쓰는 테스트가 필요.

### P1-4 [확정] 크래시로 남은 파일락 → 해당 job 갱신 전량 침묵 소실
- **위치:** `src/agent/drawing/drawing-job-store.ts:84-104` (`withJobLock`), `Atomics.wait` :95.
- **왜 틀렸나:** `mkdirSync(lockPath)` 실패 시 25회 대기 후 **undefined 반환(연산 미수행)**. 락 해제는 `finally { rmdirSync }`뿐 — 프로세스가 mkdir~rmdir 사이에서 죽으면(serverless kill·OOM) `.lock` 디렉토리가 **TTL 없이 영구** 잔존 → 그 job의 모든 `updateJob`/claim/CAS가 즉시 undefined → 중간 갱신 침묵 소실, 최종 `updateJob(...)!` non-null 단언이 TypeError→500, job 영구 동결. 수동 파일 삭제만이 복구.
- **수리 방향:** `.lock` 디렉토리에 mtime 기반 stale 판정(예: 30초 초과 시 탈취) + `updateJob` undefined 반환을 오케스트레이터 최종 기록에서 명시 예외로 승격(침묵 금지).
- **검증:** stale `.lock`을 미리 만들어두고 락 획득이 탈취로 성공함을 단언.

### P1-5 [확정] 선 dedupe 절대 허용치가 고해상 스캔에서 무력 → 중복 토폴로지 무경보
- **위치:** `src/agent/vision/spatial-graph.ts:12-13` (`ENDPOINT_DEDUPE_TOLERANCE=1`, `INTERIOR_POLYLINE_TOLERANCE=2`).
- **왜 틀렸나:** 허용치가 원본 px 절대값인데 VLM 라인 좌표는 0..1000 정규화 후 원본 재투영된다. 양자화 단위 = W/1000 px. **W≥4000이면 반올림 오차만으로 최대 W/2000≥2px** → 같은 물리 라인의 full-소스판과 region-소스판이 허용치를 넘어 'different'로 남음 → 중복 라인/엣지가 수량·관계 계산에 무경보 진입. 테스트 fixture가 전부 100×80이라(1unit=0.1px) 이 붕괴가 불가시.
- **수리 방향:** 허용치를 해상도 비례로 — `tolerance ≥ 2·(source.width/1000)` (또는 정규화 공간에서 비교). near-parallel 판정도 동일 스케일링.
- **검증:** **W≥4000 fixture**를 추가하고, 2px 이내로 어긋난 동일 라인 2개가 병합됨을 단언(현 픽스처로는 재현 불가).

### P1-6 [구조의심] 긍정 판정 'PASS'가 프로덕션에서 도달 불가 + 보류 사유 소거
- **위치:** `src/agent/electrical/synthesis.ts:293·402-405` (`integrityGap`), verdict `:447-478`.
- **의심 내용:** 라우터가 scope마다 4계산기 영수증을 무조건 방출하는데 필드-소유자 게이팅상 한 scope가 4개 필수입력을 동시 충족 불가 → 매 실행 SKIPPED≥1 → `integrityGap=true` → verdict 항상 CONDITIONAL 이하, `'PASS'`는 사문. 부수적으로 SKIPPED 영수증(보류 사유 포함)이 최종 산출물에서 소거.
- **먼저 할 것:** 프로덕션 배선(`sld-team.ts` 라우터 직결)으로 실제 도면 1건을 태워 verdict가 PASS에 도달 가능한지 재현. 도달 불가 확인되면: verdict 합성에서 SKIPPED(입력 부족)와 integrity 위반(실오염)을 분리해, 입력 부족만으로 invariants 단계까지 HOLD 오귀속되지 않게. 보류 사유 영수증은 최종 아티팩트까지 보존.

---

## P2 — 후속 (파일럿 후 또는 병행)

- **[확정] vectorAudit 고무도장** `sld-team.ts:684` — 성공 시 무조건 `complete:true`+5역할 하드코딩이라 신설 커버리지 게이트(`markVectorCoverage`)가 판별력 0. topology `validation.issues`가 있어도 통과 주장. → 실제 통과 역할만 승계하도록.
- **[확정] VLM 예산 resume 리셋** `document-orchestrator.ts` `let vlmCalls=0`(매 run) — 문서당 누적 상한이 아니라 회당 상한. 게이트를 `(previousJob?.vlmCallsUsed ?? 0) + vlmCalls + plannedCalls > budget.maxVlmCalls`로.
- **[확정] 비-Docker 운영 동기 경로 500** `drawing-job-store.ts:106` `requireRepository` — deferred 경로엔 503 가드가 있으나 동기 분석 POST·GET엔 없어 Vercel류 배포에서 불투명 500. 동기 경로는 저장 없이 응답 반환하므로 부기 자체가 불필요 — 저장소 미설정 시 우회하거나 503.
- **[확정] 새로고침 = 자동 CANCELLED + run 경로 lease 즉시 소각** `run/route.ts` `signal: req.signal` + CANCELLED에도 lease 해제. 세션 복구 설계(page.tsx `V3_JOB_SESSION_KEY`)와 모순. lease 보존 또는 취소 임계 완화.
- **[확정] 보고서 저장 writer 0 + 거짓 약속** `team-review/route.ts` `persisted:false` 고정인데 `report/[id]/page.tsx:80` "다른 세션에서도 다시 열 수 있습니다" 잔존. → 명시 저장 엔드포인트(`POST /api/reports`) 신설 **또는** 약속 문구·reader(`/api/reports/[id]`·`listReports`) 정리. (제품 결정 필요: 보관함을 둘 것인가.)
- **[확정] "CI-signed receipt" 허위 주석** `src/agent/report/metrics.ts:90` — CI에 서명 스텝 없음. 주석 수정 또는 실제 CI 서명 배선.
- **[확정] 정격전압 vs 계통전압 무구분** `electrical-invariants.ts:459` — 정격 25.8kV와 계통 22.9kV를 불일치 FAIL로. 전압 라벨에 정격/계통 구분 도입(전류는 이미 구분됨). PT 1·2차 인접 비교도 제외.
- **[WARN] 프론트:** `tools/sld/page.tsx` handleV3Correct try/catch 부재+연타 이중제출, v3ResumeAvailable 스테일 · `DrawingEvidenceOverlay` 다크 테마 고정 hex 대비 · V3 표면 원시 영어 enum(documentStatus·certainty·`v3JobStatus`) 한국어화 · V3Overlay 키보드 포커스 불가시.
- **[WARN] 도면 E2E가 탭 토글만 확인** `e2e/smoke.spec.ts:317` — 업로드→분석→결과 실주행 0. 합성 DXF 1건으로 실 파이프라인 E2E 1개 추가(또는 `gate:pdf`를 CI에 jest와 동급으로 결속).
- **[WARN] 골든 게이트 생산 사슬 미완** `sld-benchmark-runner.ts` 0-caller·예측 writer 미배선·CI 미결속 — 실도면 라벨이 와도 못 돌린다. 러너 실행 진입점 + CI 결속. (골든 라벨 자체는 별도 확보 과제.)

---

## 우선순위 요약

| 순위 | 항목 | 한 줄 |
|---|---|---|
| P0-1 | canonicalize 404 | 리포트가 생성 즉시 소실 — 파일럿 1순위 |
| P0-2 | 전압 1000배 | 40만V 오염 — 엔지니어가 즉시 발견 |
| P0-3 | 방향 오독 FAIL | 옳은 도면을 틀렸다고 함 |
| P0-4 | 보호 1-hop FAIL | 다단 보호를 틀렸다고 함 |
| P1-1~2 | 길이 10m·VD 추정기 | 사내규정 오판정 |
| P1-3~5 | 정정 이중실행·락·dedupe | 동시성·고해상 |
| P1-6 | PASS 사문 | 구조 확인 후 |
| P2 | 나머지 | 병행/후속 |

> **핵심:** P0-2·3·4·P1-1·2는 GPT가 스스로 못 잡는 도메인 진실 위반이다(틀렸다는 걸 코드만 봐선 모른다). "왜 틀렸나"를 읽고, 테스트 숫자가 아니라 전기적 정합을 기준으로 고쳐라.
