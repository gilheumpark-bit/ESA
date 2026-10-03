# ESA 기술부채 대장

> 기준 코드: `2990de29bbbed94d2d7d8e10ed89c7f45950d7e3` · 2026-10-03 (전수 감사의 출발점)
> 열린 활성 코드 부채: 10건

이 문서는 production 경로에 남아 있지만 현재 배치에서 안전하게 제거할 수 없는
개발 부채만 추적합니다. 의도적으로 꺼 둔 기능은 [휴면 기능 대장](DORMANT_MANIFEST.md),
외부 실증이 필요한 성능·운영 항목은 [현재 프로젝트 상태](../PROJECT_STATE.md), 과거에
닫힌 작업의 상세는 [변경 이력](../CHANGELOG.md)과 [인수인계 색인](project/HANDOFFS.md)이
맡습니다.

## 열린 부채

| ID | 위험·영향 | 위치 | 현재 억제책 | 폐쇄 조건 | 상태 |
|---|---|---|---|---|---|
| `DEBT-SAFETY-001` | 절연장갑 Class 1~4 값은 채팅 출력 교차검증에 쓰이지만 앱의 다른 기준 화면에는 같은 값을 확인할 경로가 없다. 따라서 앱 내부 상수가 사실상 출처가 될 수 있다. | `src/engine/llm/app-asserted-constants.ts` | 등급 식별자 없는 전압은 통과시키지 않고, 사용자가 적은 값과 상충하면 출력 필터가 차단한다. 현재 값 자체의 최신 판본 대조는 이번 배치에서 수행하지 않았다. | 적용할 IEC 60903 판본과 공신력 있는 원문을 고정하고, 기준 화면·근거 영수증에서 같은 출처를 조회하게 한 뒤 상충·판본 회귀를 추가한다. 그 경로를 만들지 않으면 Class 1~4를 앱 주장 상수에서 제거한다. | `OPEN` · 도메인/안전 검토 필요 |
| `DEBT-UI-001` (`UIV-001`) | 재계산 후 결과 영수증이 제한시간 안에 사라지지 않는 간헐 현상. | `src/hooks/useCalculator.ts`, `src/components/CalculatorForm.tsx`, `e2e/frontend-public-workflows.spec.ts` | 입력/요청 소유권·취소를 유지하고 실패 trace·JSON을 CI 성공 여부와 무관하게 보존한다. 기존 재시도 수·타임아웃은 늘리지 않는다. | 추적으로 원인을 특정하고 수리 전 실패/수리 후 반복 통과를 확인한다. 단순 미재현으로 닫지 않는다. | `OPEN` · 프런트엔드/QA |
| `DEBT-ARCH-001` | 빠른 분석과 V3가 별도 업로드/실행 경로라 공통 파싱·작업 상태의 중복 가능성이 있다. 중복 비용 비율은 아직 측정하지 않았다. | `src/app/(with-nav)/tools/sld/page.tsx`, `src/app/api/dxf/route.ts`, `src/app/api/drawing-jobs/route.ts` | 기존 결과·취소·재개를 유지하고 동일 문서 실행 안의 준비 결과만 재사용한다. | 단일 작업의 빠른/정밀 결과, 권한·버전·취소·재개·사용량 회귀와 실측 비교를 통과한다. | `OPEN` · 분석/플랫폼 |
| `DEBT-CALC-001` | 아크플래시 계산기가 280개 격자점 중 189곳에서 아크 전류를 볼트 단락전류보다 크게 낸다(물리적으로 성립하지 않는 값). 이 값은 PPE 등급 산출에 쓰인다. | `src/engine/calculators/protection/` 아크플래시, `…/__tests__/arc-flash-physics.test.ts`(`VIOLATION_BASELINE = 189`) | 위반 지점 수가 늘지 않게 잠그고, 위반 결과에는 경고를 붙인다. | 적용 판본의 IEEE 1584 원문 식으로 다시 구현하고 원문 예제값으로 대조한 뒤 기준선을 0 으로 내린다. 원문을 확보하지 못하면 계산기를 「참고용」으로 낮추거나 내린다. | `OPEN` · 도메인 검토 필요 |
| `DEBT-STD-001` | KEC `360.1` 을 인용하지만 그 조항이 조항 목록에서 확인되지 않는다. | `src/engine/standards/kec/__tests__/clause-numbers-exist.test.ts`, `clause-citations-repo-wide.test.ts` 의 선언 잔여 | 두 테스트가 이 한 건만 예외로 두고 새 미확인 조항은 막는다. | 원문에서 조항을 확인해 목록에 넣거나, 인용을 맞는 조항으로 고친다. | `OPEN` · 기준 검토 |
| `DEBT-API-001` | 요청 본문을 보호 없이 파싱하는 라우트가 8개 남아 있다(`stripe/webhook`·`notarize`·`community/*` 등). 잘못된 본문이 4xx 가 아닌 500 으로 나갈 수 있다. | `src/app/api/__tests__/body-parse-guard.test.ts` 의 `MEASURED_4XX` 기준선 | 기준선 테스트가 새 라우트의 무보호 파싱을 막는다. | 8개 라우트에 본문 파싱 실패 처리를 넣고 기준선을 비운다. | `OPEN` · API |
| `DEBT-DEP-002` | 개발 의존성 감사(`gate:audit:all`)가 high 5건으로 실패한다. 전부 `braces` ≤3.0.3 한 건(GHSA-vfj7-8cjw-p6xm, 깊게 중첩된 패턴의 스택 고갈)에서 나오고 `micromatch`→`fast-glob`→`eslint-config-next` 로 올라온다. 3.0.3 이 최신이라 올릴 버전이 없다. | `package-lock.json` 의 `braces`, `scripts/audit-baseline-gate.mjs` | 린트 도구 안에서만 쓰이고 배포 이미지의 실행 경로에 없다. 운영 의존성 감사(`gate:audit`)는 0건이다. | 고친 `braces` 가 나오면 잠금 파일을 갱신한다. 그 전에 CI 를 초록으로 만들려면 이 권고 하나를 기한부 예외로 둘지 소유자가 정한다(게이트를 임의로 풀지 않았다). | `OPEN` · 상류 대기 / 소유자 결정 |
| `DEBT-TEST-001` | 실도면 증거에 묶인 테스트가 CI 에서 실행되지 않는다. 보정점 3건은 재배포할 수 없는 래스터가 없어 건너뛰고, 스캔 영수증 대조 1건은 영수증이 gitignore 대상이다. | `src/lib/__tests__/drawing-text-quality.test.ts`, `src/engine/review/__tests__/no-connections-gap.test.ts` | 둘 다 조용한 통과가 아니라 「건너뜀」으로 보고된다(후자는 2026-10-03 에 고침). | 재배포 가능한 합성 열화 쌍과 작은 영수증 fixture 를 저장소에 넣어 CI 에서 실행되게 한다. | `OPEN` · 도면/QA |
| `DEBT-DRAW-001` | 기기 종류 어휘가 단계마다 다르다. 판독 단계는 48종 정본 이름을 내는데 전기 불변식·규격 소유 판정은 `VCB`·`TR` 같은 약어 정규식으로 찾는다. 맞지 않는 기기는 보호·전원·규격 소유를 인정받지 못해 보류로 남는다. | `src/agent/vision/spatial-graph.ts` ↔ `src/agent/electrical/electrical-invariants.ts`·`domain-normalizer.ts`·`logic-conflicts.ts` | 틀리는 방향이 보류 쪽이라 거짓 합격은 생기지 않는다. | 어휘를 한 정본으로 합치되, **보류가 줄어드는 변경**이므로 실도면 fixture 로 거짓 합격이 생기지 않음을 먼저 보인다. | `OPEN` · 소유자 결정 + 도면 |
| `DEBT-DRAW-002` | 팀 검토·V3 경로가 받은 것을 쓰지 않는 자리가 남아 있다: ① V3 벡터 문서는 계산·기준·위반을 계산하고도 결과에 싣지 않는다(항상 빈 목록) ② 화면이 PDF 쪽 번호를 보내지 않아 항상 1쪽만 본다 ③ 팀 경로가 PDF 일람표(`scheduleTables`)를 버린다 ④ 토론의 물리법칙 대조가 계산기 이름을 받아 어느 분기에도 걸리지 않는다. | `src/agent/drawing/document-orchestrator.ts`, `team-result-adapter.ts`, `src/agent/teams/sld-team.ts`, `src/agent/debate/debate-protocol.ts`, `tools/sld/page.tsx` | 모두 「덜 말하는」 쪽 결함이다. 2026-10-03 에 같은 경로의 거짓 판정 원인(자기 불일치·확신도 고정·문턱 없음)은 고쳤다. | 항목별로 받은 값을 실제 출력에 연결하고, 화면에서 쪽을 고를 수 있게 한다. | `OPEN` · 도면 |

## 이전 정리에서 종결한 부채 — 2026-08-26 기록

| ID | 당시 종결 내용 | 당시 증거 |
|---|---|---|
| `DEBT-OPS-001` | 실제 취약점이 0건인데 `high 9`를 허용하던 감사 기준선을 0으로 내리고, Windows의 `shell: true` npm 호출을 현재 npm CLI의 Node 직접 실행으로 교체했다. 실행 실패·비JSON·형식 변경도 판정 불가로 닫는다. | `npm run gate:audit` → critical 0 · high 0 · exit 0, DEP0190 경고 없음 |
| `DEBT-CONFIG-001` | 서버 `OPEN_BETA`만 예제에 있어 브라우저 기능 게이트와 어긋날 수 있던 설정을 `NEXT_PUBLIC_OPEN_BETA`와 한 쌍으로 만들었다. | `scripts/check-docs.mjs`가 두 키의 존재·동일 값을 검사, `npm run check:docs` exit 0 |

위 표는 당시 기록이다. 이후 확인된 감사 프로세스의 종료 코드 처리 결함은 아래 `DEBT-CI-001`에서 별도로 수정했다.

## 2026-09-09 정리

| ID | 처리 내용 | 폐쇄 확인 |
|---|---|---|
| `DEBT-CODE-001` | 미사용 지역 선언·import·계산식·XML helper 제거. 호환 인자는 명시적으로 미사용 표시. | noUnusedLocals/noUnusedParameters를 기본 타입 검사에 연결. 기존 계산/도면 결과 회귀와 함께 확인. |
| `DEBT-OPS-002` | 개발 의존성까지 critical/high 0 정책 확대. URI/YAML/브라우저리스트 잠금 의존성을 부모 제약 내 패치. | npm ci, gate:audit:all, raw audit의 최종 버전·판정은 이번 인수인계와 CI를 따른다. |
| `DEBT-CI-001` | npm 프로세스 실패인데 정상 모양 JSON만 읽고 통과하던 경로 차단. | 실제 CLI에 npm exit 2/zero JSON을 주면 기존 exit 0, 수정 후 exit 2. 회귀 검사 추가. |
| `DEBT-MAINT-001` | 임시 작업공간·생성물의 재커밋 차단, 오래된 상태 문서 보존·현재 정본 분리. | gate:hygiene, 실제 Git 인덱스 회귀, check:docs. 과거 실증·교보재·매뉴얼을 삭제하지 않는다. |

이번 변경의 정확한 최종 검증은 [개발 부채 정리 인수인계](project/handoffs/2026-09-09-development-debt-cleanup.md)와 해당 HEAD의 CI를 따른다. 미실행 운영 조건을 완료로 합산하지 않는다.

## 2026-10-03 전수 감사

고친 것과 남긴 것의 목록은 [전수 감사 인수인계](project/handoffs/2026-10-03-full-wiring-debt-audit.md)에 있다.
위 표의 `DEBT-CALC-001` 이하 7건은 그때까지 테스트 안의 기준선·예외로만 적혀 있던 것을 이 대장으로 옮긴 것이다.

같은 날 닫은 것: `DEBT-DEP-001` — `axe-core`·`undici` 를 개발 의존성으로 선언하고 `@sentry/nextjs` 를 실행 의존성으로 옮겼다. Next.js 16.3.8(치명 권고 해소), firebase 12.19.0, `@firebase/firestore` 아래 `@grpc/grpc-js` 1.14.5 override(이 앱은 Firestore 를 import 하지 않는다)로 운영 의존성 감사를 0건으로 되돌렸다.

## 갱신 규칙

- 열린 항목에는 반드시 코드 위치, 현재 억제책, 폐쇄 조건을 적습니다.
- `TODO`·`FIXME`를 단순 삭제해 부채를 숨기지 않습니다. 안전하게 닫지 못한 항목은
  `DEBT-*` 식별자와 이 문서를 함께 갱신합니다.
- 코드에서 제거하거나 폐쇄 조건을 충족한 항목만 닫힌 부채로 이동합니다.
- 부분 구현, 휴면, 미실증을 이 문서에 중복 등록하지 않습니다.
