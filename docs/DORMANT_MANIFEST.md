# Dormant Module Manifest (§2.5-② — 잔존 휴면 코드의 정직한 대장)

> 목록 생산 ≠ 종결. 삭제하지 않고 남기는 휴면 모듈은 아래에 상태·사유·소유자·
> 활성 조건·재검토 조건을 기록한다. 여기 없는 휴면 모듈 발견 = 대장 위반.
> 2026-07-24 기준. 2026-07-23 전수 점검에서는 화면·호출처가 없고 성공할 수 없던
> YouTube 501 API/미구현 유틸리티와 구형 `src/services/aiProviders*` 두 파일을
> 외부참조 0 확인 후 제거했다.
> 2026-07-24 점검에서 `src/lib` 하위 휴면 모듈 6건이 대장에 없던 것을 적발해
> 아래에 등재했다(약 1,450줄). 판정 기준은 저장소 전체에서 정적·동적 import가
> 모두 0인 것이며, `providers.tsx`가 동적 import로 살려 쓰는 `analytics`·`cwv`·
> `error-reporter`와 `report/[id]`가 쓰는 `report-pdf`는 활성으로 분류해 제외했다.

| 모듈 | 상태 | 사유(왜 남기나) | 소유 | 활성 조건 | 재검토 |
|---|---|---|---|---|---|
| `engine/chain/calc-chain-executor.ts` | DORMANT | 범용 계산 체인 실행기. 현행 SLD 합성은 도면에서 필수 입력이 유일하게 결박된 전압강하만 별도 정본 경로로 실행하며, 이 범용 실행기는 production caller가 없음 | 도면 파이프라인 | 토폴로지 `extractCalcParams`가 지원 계산기별 실입력을 산출하고 보고서·UI 계약이 정해질 때 | 계산 체인 확장 착수 시 |
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
| `lib/fetch-url-guard.ts` + `lib/security/index.ts` | DORMANT(중복 정책) | 범용 SSRF 차단기. 현행 production URL 정책은 `lib/onpremise-policy.ts`의 정확 origin allowlist가 단독 담당하며 이 배럴을 import하는 코드가 0. 호스트명 문자열만 보고 DNS 결과·일반 IPv6·userinfo는 보지 않아 allowlist보다 약함 | 보안 | 임의 외부 URL을 서버가 가져와야 하는 기능이 생길 때. 그때 DNS 재바인딩·IPv6·userinfo를 먼저 보강 | URL 페치 기능 착수 시 |
| `lib/env.ts`의 설정 상수(`FIREBASE_CONFIG` 등) | DORMANT(부분) | `validateEnv()`는 이번에 `instrumentation.ts` 부팅 경로에 개통했으나, 타입 설정 상수들은 각 모듈이 `process.env`를 직접 읽고 있어 caller가 0 | 플랫폼 | 환경변수 접근을 이 모듈로 일원화하기로 결정할 때 | 설정 계층 정리 착수 시 |
| `lib/api-helpers.ts` | DORMANT(테스트만) | 응답·검증 헬퍼. 자기 테스트 외 production caller 0. 현행 Route Handler는 각자 `NextResponse.json` 계약을 직접 씀 | API | Route Handler 응답 계약을 공통 헬퍼로 통일하기로 결정할 때 | API 계층 정리 착수 시 |
| `lib/cache.ts` | DORMANT | 범용 캐시 계층. 현행 캐시는 `ai-cache.ts`·`receipt-cache.ts`가 용도별로 직접 담당하며 이 범용 모듈 caller 0 | 플랫폼 | 캐시 정책을 한 계층으로 합치기로 결정할 때 | 성능 작업 착수 시 |
| `lib/chunker.ts` | DORMANT(환경) | 문서 청킹 — RAG 코퍼스 적재용. 위 Weaviate 경로와 세트로 잠들어 있음 | 인프라 | Weaviate 프로비저닝과 동시 | RAG 배치 |
| `lib/error-messages.ts` | DORMANT | 사용자 표면 오류 문구 사전. 현행 화면·라우트가 문구를 각 위치에서 직접 쓰고 있어 caller 0 | UI | 오류 문구를 한 사전으로 통일하기로 결정할 때 | UI 카피 정리 착수 시 |
