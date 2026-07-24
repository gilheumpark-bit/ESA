# ESVA 문서 지도

문서는 현재 제품 정본, 검증 원장, 설계 참고, 역사 기록으로 나뉩니다. 서로 다른 상태의 문서를 기능 완료 근거로 합산하지 마십시오.

## 문서 상태

| 상태 | 의미 | 사용법 |
|---|---|---|
| 현재 정본 | 현재 코드와 함께 유지하는 사용·구조·계약 문서 | 판단과 변경의 시작점으로 사용 |
| 검증 원장 | 교보재, 명령, 커밋, 결과를 재실행할 수 있는 기록 | 앵커를 현재 리비전에서 재실행 |
| 설계 참고 | 구현 선택과 목표를 설명하는 문서 | 현재 코드·결정 기록과 대조 |
| 역사 기록 | 당시 리비전의 계획, 심사, 수리, 인수인계 | 현재 상태 주장으로 사용 금지 |

## 처음 읽는 순서

1. [제품 범위와 실행](../README.md)
2. [현재 프로젝트 상태](../PROJECT_STATE.md)
3. [아키텍처와 신뢰 경계](../ARCHITECTURE.md)
4. [기능 배선 지도](project/IMPLEMENTATION_MAP.md)
5. [사용자 가이드](USER_GUIDE.md) 또는 [API 계약](API_REFERENCE.md)
6. 도면 작업이면 [실증 증거 원장](VALIDATION_EVIDENCE.md)과 [SLD V3 추적표](project/SLD_V3_TRACEABILITY.md)

## 현재 정본

| 문서 | 책임 |
|---|---|
| [README](../README.md) | 제품 목적, 현재 제공 범위, 실행과 기본 검증 |
| [ARCHITECTURE](../ARCHITECTURE.md) | 계층, 호출 흐름, 저장, 보안과 외부 서비스 경계 |
| [PROJECT_STATE](../PROJECT_STATE.md) | 현재 기준 커밋, 완료·부분·미검증, 다음 행동 |
| [사용자 가이드](USER_GUIDE.md) | 화면별 사용법과 결과 해석 |
| [API 레퍼런스](API_REFERENCE.md) | 공개·조건부 Route Handler 계약 |
| [현실화 상태](REALIZATION_PLAN.md) | 배포 환경에서 닫아야 할 마지막 게이트 |
| [휴면 기능 대장](DORMANT_MANIFEST.md) | UI 미노출, 환경 대기, 플래그 OFF 기능과 활성 조건 |
| [변경 이력](../CHANGELOG.md) | 릴리스와 Unreleased 변경 요약 |
| [기여 가이드](../CONTRIBUTING.md) | 개발·검증·문서 갱신 규칙 |
| [보안 정책](../SECURITY.md) | 제보, 신뢰 경계, 알려진 공백 |
| [평가 가이드](../EVALUATION_GUIDE.md) | C/D/I/X/V/O 단계별 평가 절차 |

`GET /api/openapi`는 공개 핵심 API의 실행 계약입니다. 저장소의 모든 내부·조건부 라우트를 자동 열거하는 문서는 아닙니다.

## 도면 검증과 교보재

| 문서 | 상태 | 책임 |
|---|---|---|
| [VALIDATION_EVIDENCE](VALIDATION_EVIDENCE.md) | 검증 원장 | 공개·합성 교보재, 커밋, 재실행 명령 |
| [DRAWING_VALIDATION_RESULT](DRAWING_VALIDATION_RESULT.md) | 역사적 결과 스냅샷 | 당시 도면 fixture 판독 결과와 결함 |
| [DRAWING_ANALYSIS_AUDIT](DRAWING_ANALYSIS_AUDIT.md) | 역사적 감사 | 특정 리비전의 분석 경로 점검 |
| [DRAWING_VALIDATION_PLAN](DRAWING_VALIDATION_PLAN.md) | 역사적 계획 | 초기 교보재 검증 계획 |
| [QA_REPORT_2026-07-19](QA_REPORT_2026-07-19.md) | 역사적 QA | 2026-07-19 상태 |
| [REPAIR_PLAN_2026-07-19](REPAIR_PLAN_2026-07-19.md) | 역사적 수리 계획 | 2026-07-19 수리 지시 |
| [CUSTOM_RULES_DESIGN](CUSTOM_RULES_DESIGN.md) | 설계 참고 | 사용자 규칙셋 형식과 검증 경계 |

교보재 자체의 출처와 사용 조건은 [외부 자료 출처](../fixtures/drawings/external/SOURCES.md), [공개 fixture 안내](../fixtures/drawings/public/README.md), [커밋하지 않는 로컬 자료 정책](../fixtures/drawings/local/README.md)을 함께 확인하십시오.

## 프로젝트 구조 기록

| 문서 | 상태 | 책임 |
|---|---|---|
| [IMPLEMENTATION_MAP](project/IMPLEMENTATION_MAP.md) | 현재 정본 | production entry부터 실패·재조회까지 배선 |
| [DECISIONS](project/DECISIONS.md) | 현재 정본 | 유지해야 할 구조적 결정과 불변식 |
| [SLD_V3_TRACEABILITY](project/SLD_V3_TRACEABILITY.md) | 현재 정본 | 설계 §1–15와 생산 코드·검증 연결 |
| [도면 심사 단계 설계](project/design/2026-07-21-drawing-review-ladder.md) | 설계 참고 | 심사 강도와 역할 분리 |
| [토폴로지 스냅·분류 재설계](project/design/2026-07-24-topology-snap-and-classification-redesign.md) | 설계 확정·실측 대기 | 스냅 허용반경 유도, 기기 분류 어휘 계층, 경로 탐색 비용 |
| [약점 축 90점 설계](project/design/2026-07-24-weak-axes-to-90-design.md) | 설계 | 라벨 공장(IND 사다리·표본 통계), 게이트 안정화, 환경 동등성 |
| [HANDOFFS](project/HANDOFFS.md) | 역사 기록 색인 | 작업 시점별 인수인계와 검증 영수증 |

## 상세 설계와 실행 계획

[docs/superpowers](superpowers/README.md)의 사양과 계획은 구현 당시의 설계 근거입니다. 제목에 날짜가 있으며 현재 구현 여부는 `IMPLEMENTATION_MAP`, `DECISIONS`, `PROJECT_STATE`에서 다시 확인합니다.

저장소 초기 종합 설계서는 [files 문서 안내](../files/README.md)에서 구분합니다. 이 문서는 개념과 요구사항 추적에만 사용하며 현재 API·모델·정확도 근거로 사용하지 않습니다.

## 정책·협업 참고

- [CLAUDE.md](../CLAUDE.md): 이 저장소에서 AI가 지켜야 할 제품 경계와 검증 규칙
- [CODE_OF_CONDUCT.md](../CODE_OF_CONDUCT.md): 커뮤니티 행동 규범
- [LICENSE](../LICENSE): CC BY-NC 4.0
- [GitHub PR 양식](../.github/pull_request_template.md)과 [issue 양식](../.github/ISSUE_TEMPLATE/bug_report.md): 기여 시 필요한 재현·검증 정보

## 갱신 규칙

- 현재 기능이 바뀌면 README, API, 아키텍처, 구현 배선 지도 중 영향을 받는 문서를 같은 작업에서 고칩니다.
- 외부 실증을 새로 수행하면 `VALIDATION_EVIDENCE.md`에 커밋, 교보재, 명령, 결과를 추가합니다.
- 구조적 선택이 바뀌면 `DECISIONS.md`에 한 항목을 추가합니다.
- 과거 계획과 인수인계의 본문을 현재형으로 덮어쓰지 않습니다. 필요한 경우 상단 상태 표시와 현재 정본 링크만 추가합니다.
- 새 Markdown 파일은 이 지도 또는 하위 색인에 등록하고 `npm run check:docs`로 로컬 링크를 확인합니다.
