---
schemaVersion: 1
project: ESA
status: active
baselineBranch: codex/sld-95-intelligence
codeBaselineCommit: e29ced9b3435f367be0e4a2e92cab40b39f699d3
updatedAt: 2026-07-20T20:25:52.9400811+09:00
trigger: architecture
changedDomains: [agent, app, components, lib, scripts]
---

# 2026-07-20 SLD 95% 지능화 인수인계

## 변경

- 전체 도면과 구획 변형을 `symbols`, `connections`, `text`, `logic` 네 역할에 독립 배정하고 봉인된 심사 봉투를 메인 합산 단계로 전달했다.
- 기호·문자·선의 원본 ID, 페이지, 좌표, owner를 정규화하고 전원-부하 방향, 보호, 접지, 전압 영역, 복수 경로와 논리 판독을 교차검증했다.
- 실제 계산기는 현재 도면 근거로 필수 입력이 유일하게 채워진 경우에만 실행하고 모든 기본값과 보류 입력을 영수증에 남겼다.
- 원본 도면을 브라우저 IndexedDB에 해시 결박해 보관하고 보고서 오버레이·표에 동일한 `Sxx`·`Lxx` 번호와 양방향 선택을 연결했다.
- 정확한 데이터셋 집합과 Ed25519 서명을 요구하는 SLD 골든 게이트를 추가하고, 합성 데이터만으로 95%를 주장하지 못하게 했다.
- CSP blob 이미지, 모바일 오버플로, 기준서 검색 접기·펼치기, Playwright 포트 오인, 구식 데모·API·반응형 검사를 수리했다.
- 저장소에 없던 `scripts/enforce.ps1`을 추가해 프로젝트 문서의 전체 게이트를 실제 실행 파일로 만들었다.

## 이유

- 기존 도면 분석은 기기명 일부를 읽더라도 케이블·관계·보호 논리와 전체 수량을 한 근거 체계로 설명하지 못했다.
- 같은 AI 응답을 여러 심사처럼 취급하거나 근거 없는 계산·추천을 합산하면 현직자가 요구하는 누락·모호성 검출이 불가능하다.
- 구현 테스트 통과와 실제 현장 도면 95% 정확도는 다른 주장이다. 외부 라벨·서명·holdout 없이 수치를 올리는 경로를 구조적으로 차단할 필요가 있었다.

## 사용자 소유 변경

- 회사 도면, 외부 AI 키, 운영 DB, 결제 정보는 읽거나 커밋하지 않았다.
- 브라우저 검증에는 로컬에서 만든 비민감 합성 SLD만 사용했고 검증 세션에서 삭제했다.
- 원본 작업트리의 사용자 `next-env.d.ts` 변경은 건드리지 않았다. 현재 worktree의 `.next/`, `test-results/`와 이동 보관한 개발 캐시는 Git ignore 상태로 남겼다.

## 완료

- 역할별 독립 호출→봉투 검증→정규화→전기 불변식→계산 라우팅→합산 보고서의 production caller를 연결했다.
- 원본 저장→보고서 source hash→reload→해시 재검증→object URL→오버레이 표시 왕복을 연결했다.
- 보고서 원본·기기·선·수량·관계·HOLD·계산의 번호와 provenance를 일관되게 표시한다.
- 브라우저 데스크톱·모바일에서 원본 크기, 페이지 폭, 기기와 관계의 양방향 선택을 실측했다.
- 전체 Jest, TypeScript, 무경고 ESLint, production build, PDF fixture, E2E와 독립 diff·비밀자료 심사를 통과했다.
- [기능 배선 지도](../IMPLEMENTATION_MAP.md)와 [구조 결정 기록](../DECISIONS.md)을 당시 코드 기준선으로 갱신했다.

## 부분 완료

- 이미지·DXF·PDF 코드와 합성 fixture 검증은 완료했지만 실제 공급자와 현장 대표 도면의 통계적 정확도는 아직 측정하지 않았다.
- 95% 게이트 구현은 연결됐지만 승인된 `real-adjudicated` 데이터셋, 예측, 평가 키가 없어 활성화할 수 없다.
- Supabase, Stripe, Weaviate와 외부 AI의 코드 계약은 유지되지만 이번 배치에서 실환경 왕복은 수행하지 않았다.

## 미검증

- 독립 라벨러가 만든 실도면 골든셋의 기호 macro-F1, text field accuracy, edge-F1, junction accuracy, critical logic recall.
- 공급자별 동일 도면 반복 호출의 누락·오탐·비용·timeout과 모델 간 교차 재현성.
- 스테이징 Supabase·Stripe·Weaviate의 write→persist→새 세션 read-back.
- 전용 보안 스캐너와 운영 관측성·rollback 실전 훈련.

## 보류

- `npm run gate:sld-golden`은 exit 1이다. receipt의 실패 사유는 `ATTESTATION_KEY_MISSING`, 합성 예측 부재, `MANIFEST_NOT_CLAIM_ELIGIBLE`, `NO_REAL_ADJUDICATED_DATASET`이며 `verified95=false`가 정직한 현재 상태다.
- 현장 실증 자료와 승인 키가 제공되기 전에는 제품 화면·문서·영업 문구에서 95% 달성을 주장하지 않는다.

## 검증

- `pwsh -NoProfile -File scripts/enforce.ps1`: exit 0.
- TypeScript: exit 0.
- ESLint `--max-warnings=0`: exit 0.
- Jest: 112개 스위트·1,015개 테스트, 실패 0.
- Next.js production build: exit 0, 64개 route 항목, Turbopack 경고 0.
- PDF fixture gate: 9/9 통과.
- Playwright smoke: 29/29 통과.
- 브라우저: 1200×700 합성 원본 로드, 1440px·375px 페이지 오버플로 0, 기기·관계 선택 왕복 확인.
- 독립 심사: 최종 P0~P2 0건, 비밀·회사 원본·대형 생성물 유입 0건.
- SLD golden gate: exit 1, `verified95=false`로 HOLD가 재현됨.

## 다음 첫 행동

1. 기밀 제거된 대표 도면을 이중 라벨링하고 불일치 adjudication을 끝낸 `real-adjudicated` 데이터셋을 만든다.
2. 승인된 평가 키 지문과 예측 서명을 고정하고 receipt를 새 프로세스에서 다시 검증한다.
3. 데이터셋별·전체 임계값이 모두 통과한 뒤에만 manifest `claimEligible` 변경을 심사한다.
4. 스테이징 키로 Supabase, Stripe, Weaviate, AI 공급자 실왕복을 별도 실행한다.
