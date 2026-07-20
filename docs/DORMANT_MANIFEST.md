# Dormant Module Manifest (§2.5-② — 잔존 휴면 코드의 정직한 대장)

> 목록 생산 ≠ 종결. 삭제하지 않고 남기는 휴면 모듈은 아래에 상태·사유·소유자·
> 활성 조건·재검토 조건을 기록한다. 여기 없는 휴면 모듈 발견 = 대장 위반.
> 2026-07-20 기준. 삭제분(6)은 커밋 메시지에 기록: chain/design-review·
> chain/index(barrel)·verification/reverse-calc-extended·llm/system-prompt·
> sjc/judge·sjc/source-tracker (전 심볼 외부참조 0 반증 후 제거).

| 모듈 | 상태 | 사유(왜 남기나) | 소유 | 활성 조건 | 재검토 |
|---|---|---|---|---|---|
| `engine/chain/calc-chain-executor.ts` | DORMANT | 도면→실계산기(57) 자동 실행 다리의 완성형. 현행 sld-team은 honest-HOLD 간이 경로 — 명판/토폴로지에서 실전류를 추출하게 되면 이 실행기가 정본 | 도면 파이프라인 | 토폴로지 `extractCalcParams`가 실입력을 산출할 때 | 도면 Phase 3 착수 시 |
| `engine/topology/topology-graph.ts`의 `extractCalcParams`·`findPath`·`getUpstream/Downstream` | DORMANT(부분) | 연결 그래프는 이번에 개통(endpoint-snap). 경로 추적·파라미터 추출은 위 실행기와 세트 | 도면 파이프라인 | 동상 | 동상 |
| `engine/verification/reverse-calc.ts` | DORMANT | 역산 검증(출력→입력 재유도)은 영수증 무결성의 다음 단계 제품 기능 후보 | 검증 엔진 | 영수증 UI에 '역산 검증' 노출 결정 시 | E/F 배치 |
| `engine/verification/sensitivity.ts` | DORMANT | ±% 민감도 스윕 — 설계 여유 분석 기능 후보 | 검증 엔진 | 계산 결과 화면에 민감도 패널 결정 시 | E/F 배치 |
| `engine/verification/override.ts` | DORMANT | 실무자 수동 override 기록 — 감사추적 요구 시 필요 | 검증 엔진 | 프로젝트/감사 기능에서 요구 시 | E/F 배치 |
| `/api/review` (verification 파이프라인) | DORMANT(API-only) | audit·quality·multi-team·gen-verify 실로직. team-review와 달리 수동 파라미터 입력용 — 명확한 UI 표면 없음(YAGNI로 C4 보류 선언) | API | OpenAPI 문서화 유지, UI 표면 확정 시 | 수요 발생 시 |
| `/api/calculate/batch` | DORMANT(API-only) | 실로직·호출 0. 비교/프로젝트 일괄 재계산 후보 | API | compare·projects 일괄 기능 결정 시 | 수요 발생 시 |
| `/api/feedback` | DORMANT(API-only) | 현재 UI 호출처가 없으며 피드백 저장은 Supabase service-role 구성과 keyed IP hash secret이 있어야 지속된다 | API/플랫폼 | 피드백 UI와 두 운영 자격증명을 함께 연결할 때 | UI 호출처 또는 저장 운영 구성이 바뀔 때 |
| `/api/benchmark` | DORMANT(운영도구) | dev/ADMIN_API_TOKEN 게이트의 내부 벤치 | 운영 | 그대로(내부용) | — |
| `/api/cron/crawl` | ORPHANED | vercel.json crons 미등록 — RAG 코퍼스 구축용 | 인프라 | Weaviate 프로비저닝(F1)과 함께 등록 | F 배치 |
| RAG/Weaviate 경로 | DORMANT(환경) | 코드 실재·외부 인프라 부재 → local-search 폴백이 정직하게 작동 | 인프라 | Weaviate 호스트+키 제공 | F 배치 |
| 알림 email/push 발송 | STUB(설정만) | prefs 토글만 존재·sender 없음 | 인프라 | SMTP/FCM 제공(F2) | F 배치 |
| `settings/onpremise` 저장값 | WRITE-ONLY | 연결 테스트는 실작동. 저장 설정을 chat이 소비하는 배선은 미구현 | 제품 | chat 라우트 onpremise provider 지원 구현 시(후속) | 다음 회차 |
