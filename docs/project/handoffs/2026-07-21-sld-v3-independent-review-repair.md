---
schemaVersion: 1
project: ESA
status: active
baselineBranch: codex/sld-v3-completion
codeBaselineCommit: 896ae31f5faf764aa3b44acfd8573c9d4a0cec77
updatedAt: 2026-07-21T06:53:49.8775095+09:00
trigger: architecture
changedDomains: [agent, app]
---

# SLD V3 독립 리뷰 수리 인수인계

## 변경

- 독립 수리 지시서의 P0·P1·P2와 프론트·E2E·평가기 경고를 반증 테스트부터 재현하고 현재 생산 경로에 수리했다.
- 도면 판독 입력, 전기 논리 합성, 장시간 작업 복구, 사용자 정정, 결과 UI와 평가 실행기를 같은 기준선에서 재검증했다.

## 이유

- 일부 결과가 테스트에서는 녹색이어도 JSON 왕복, 해상도, 재개, 파일락, 실제 브라우저 업로드에서 실패하거나 잘못된 FAIL/PASS를 만들 수 있었다.
- 원본에 없는 계산 입력과 선분 기하 순서를 전기적 사실로 사용하지 않는다는 제품 경계를 코드 계약으로 고정해야 했다.

## 사용자 소유 변경

- 사용자가 미리 둔 `docs/project/handoffs/2026-07-21-independent-review-repair-directives.md`는 읽기만 했고 수정·스테이징하지 않았다.
- 회사 도면, 운영 자격증명, 외부 AI 키와 운영 데이터는 사용하지 않았다.

## 기준선

- 제품 코드 기준선: `896ae31f5faf764aa3b44acfd8573c9d4a0cec77`
- 브랜치: `codex/sld-v3-completion`
- 입력 리뷰: `rev f21691c` 독립 수리 지시서
- 범위: SLD V3 해시·전기 판정·계산·동시성·저장·예산·UI·평가 실행 경로

## 완료

- JSON 전송 의미와 영수증 canonical hash를 맞춰 `undefined` 속성이 생성 직후 해시 불일치를 만들지 않게 했다.
- `0.400kV`·`6.600kV`를 400V·6,600V로 정규화하고 계산 라우터에서 800kV 초과를 거부한다.
- 선분의 기하 시작·끝을 전력 방향으로 단정하지 않고, 다단 보호 경로는 연결 그래프를 따라 확인한다. 확정할 수 없는 방향은 HOLD다.
- 전압강하는 명시된 길이·케이블 규격·계통전압·전류·도체·상·역률이 모두 있을 때만 정본 계산기를 호출한다. 10m·35sq·380V 같은 폴백은 없다.
- 정상 SKIPPED 계산 영수증과 사유를 최종 합성까지 보존해 실제 production 경로에서 PASS가 구조적으로 도달 가능하다.
- 실행 중 정정 409, stale lock 탈취, 파일락 실패 명시 예외, 고해상도 비례 선 dedupe를 연결했다.
- 벡터 감사 역할을 실제 검출·토폴로지 결과로 기록하고 VLM 호출 상한을 재개 전체에 누적한다.
- 저장소 미구성 동기 작업 API를 503으로 닫고, HTTP 연결 단절이 작업 취소·원본 임대 소각으로 이어지지 않게 했다.
- 정격전압과 계통전압을 분리하고 PT를 계통 전압 불변식 비교에서 제외했다.
- V3 내부 enum 한국어화, 정정 연타 차단·오류 처리, 재개 조건 파생, 다크 테마 의미 토큰, SVG 키보드 초점 표식을 반영했다.
- `npm run test:sld-benchmark`가 체크인 DXF를 production 분석기→V3 평가기→prediction/eval/suite writer로 실행한다.
- Playwright가 합성 DXF 업로드→기기 5개·연결 4개 결과 도착을 실주행한다.

## 부분 완료

- 비로그인 팀 검토 보고서는 현재 브라우저 세션에서만 보존된다. 서버 report reader는 존재하지만 이 생성 경로의 writer는 없고, UI도 다른 세션 보관을 약속하지 않는다.
- V3 95% 평가 실행기는 production 경로와 writer까지 연결됐지만 manifest는 합성 데이터만 포함하고 `claimEligible=false`다.

## 미검증

- 독립 판정자가 작성한 공개 교보재 정답표를 사용한 공급자별 기호·문자·관계 정확도와 3회 반복 편차.
- 운영 `DRAWING_JOB_STORE_DIR` 공유 볼륨에서 다중 인스턴스 락 탈취·재개·새 세션 read-back.
- 실제 OpenAI·Gemini·Claude BYOK로 동일 공개 도면을 반복 분석한 비용·timeout·누락률.

## 보류

- 실도면 독립 라벨, 승인 Ed25519 키와 서명된 3회 영수증이 없으므로 `verified95=true` 주장은 계속 HOLD다.
- 사용자가 미리 둔 `docs/project/handoffs/2026-07-21-independent-review-repair-directives.md`는 미추적 상태로 보존했고 이번 커밋에 포함하지 않았다.

## 검증

- `npx tsc --noEmit`: exit 0.
- `npm run lint -- --max-warnings=0`: exit 0, 경고 0.
- `npm test -- --runInBand`: exit 0, 136 suites·1,115 tests.
- `npm run build`: exit 0, Next.js production build·64 route 항목 생성.
- 신선 production 서버 `node scripts/pdf-fixture-gate.mjs http://127.0.0.1:3129`: exit 0, 9/9.
- `npx playwright test e2e/smoke.spec.ts --grep "공개 합성 DXF" --reporter=line`: exit 0, 1/1.
- 반증 후 GREEN: 전기 P0/P1, 저장·resume·coverage·예산 API, UI 상태·포커스, production benchmark 테스트가 전체 스위트에 포함된다.

## 다음 첫 행동

1. 공개 교보재 PDF/DXF에 독립 기호·문자·관계 정답표를 작성하고 현재 benchmark 입력 계약으로 변환한다.
2. 승인 공급자·모델별 같은 데이터셋을 3회 실행해 서명된 suite receipt를 만들되, real-adjudicated strata가 없으면 95% 배지를 열지 않는다.
3. 제품에서 다른 세션 보고서 보관이 필요하면 `POST /api/reports` writer와 소유권·해시 read-back을 함께 설계한다.
