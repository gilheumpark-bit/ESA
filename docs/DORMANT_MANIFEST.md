# Dormant Module Manifest (§2.5-② — 잔존 휴면 코드의 정직한 대장)

> 목록 생산 ≠ 종결. 삭제하지 않고 남기는 휴면 모듈은 아래에 상태·사유·소유자·
> 활성 조건·재검토 조건을 기록한다. 여기 없는 휴면 모듈 발견 = 대장 위반.
> 2026-07-20 기준. 이번 전수 점검에서는 화면·호출처가 없고 성공할 수 없던
> YouTube 501 API/미구현 유틸리티와 구형 `src/services/aiProviders*` 두 파일을
> 외부참조 0 확인 후 제거했다.

| 모듈 | 상태 | 사유(왜 남기나) | 소유 | 활성 조건 | 재검토 |
|---|---|---|---|---|---|
| `engine/chain/calc-chain-executor.ts` | DORMANT | 도면→실계산기(57) 자동 실행 다리의 완성형. 현행 sld-team은 honest-HOLD 간이 경로 — 명판/토폴로지에서 실전류를 추출하게 되면 이 실행기가 정본 | 도면 파이프라인 | 토폴로지 `extractCalcParams`가 실입력을 산출할 때 | 도면 Phase 3 착수 시 |
| `engine/topology/topology-graph.ts`의 `extractCalcParams`·`findPath`·`getUpstream/Downstream` | DORMANT(부분) | 연결 그래프는 이번에 개통(endpoint-snap). 경로 추적·파라미터 추출은 위 실행기와 세트 | 도면 파이프라인 | 동상 | 동상 |
| `engine/verification/reverse-calc.ts` | DORMANT | 역산 검증(출력→입력 재유도)은 영수증 무결성의 다음 단계 제품 기능 후보 | 검증 엔진 | 영수증 UI에 '역산 검증' 노출 결정 시 | E/F 배치 |
| `engine/verification/sensitivity.ts` | DORMANT | ±% 민감도 스윕 — 설계 여유 분석 기능 후보 | 검증 엔진 | 계산 결과 화면에 민감도 패널 결정 시 | E/F 배치 |
| `engine/verification/override.ts` | DORMANT | 실무자 수동 override 기록 — 감사추적 요구 시 필요 | 검증 엔진 | 프로젝트/감사 기능에서 요구 시 | E/F 배치 |
| `/api/review` (verification 파이프라인) | DORMANT(API-only) | audit·quality·multi-team·gen-verify 실로직. team-review와 달리 수동 파라미터 입력용이며 명확한 UI 표면 없음 | API | 제품 흐름과 입력 계약이 확정될 때 | 수요 발생 시 |
| `/api/calculate/batch` | DORMANT(API-only) | 실로직·호출 0. 비교/프로젝트 일괄 재계산 후보 | API | compare·projects 일괄 기능 결정 시 | 수요 발생 시 |
| `/api/feedback` | DORMANT(API-only) | 현재 UI 호출처가 없으며 피드백 저장은 Supabase service-role 구성과 keyed IP hash secret이 있어야 지속된다 | API/플랫폼 | 피드백 UI와 두 운영 자격증명을 함께 연결할 때 | UI 호출처 또는 저장 운영 구성이 바뀔 때 |
| `/api/benchmark` | DORMANT(운영도구) | dev/ADMIN_API_TOKEN 게이트의 내부 벤치 | 운영 | 그대로(내부용) | — |
| `/api/cron/crawl` | DORMANT(인프라) | 배포 스케줄 미등록 — RAG 코퍼스 구축용 | 인프라 | Weaviate 프로비저닝과 관리자 인증·스케줄 등록 | 인프라 구성 시 |
| RAG/Weaviate 경로 | DORMANT(환경) | 코드 실재·외부 인프라 부재 → local-search 폴백이 정직하게 작동 | 인프라 | Weaviate 호스트+키 제공 | F 배치 |
| 알림 email/push 발송 | STUB(설정만) | prefs 토글만 존재하고 sender 없음. 기본값은 모두 false이며 인앱 알림만 제품 기능 | 인프라 | 검증된 SMTP/FCM과 수신동의·반송 처리 연결 | 인프라 구성 시 |
| IPFS 타임스탬프 등록 | DORMANT(플래그 OFF) | Pinata/IPFS 경로는 있으나 블록체인·제3자 공증이 아니며 삭제·개인정보·운영 검증 전 일반 영수증에 노출하지 않음 | 인프라/법무 | `RECEIPT_NOTARIZE=true` 전 Pinata 왕복과 보존·삭제정책 확인 | 활성화 검토 시 |
