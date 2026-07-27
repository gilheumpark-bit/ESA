# Dormant Module Manifest (§2.5-② — 잔존 휴면 코드의 정직한 대장)

> 목록 생산 ≠ 종결. 삭제하지 않고 남기는 휴면 모듈은 아래에 상태·사유·소유자·
> 활성 조건·재검토 조건을 기록한다. 여기 없는 휴면 모듈 발견 = 대장 위반.
> 2026-07-23 기준. 이번 전수 점검에서는 화면·호출처가 없고 성공할 수 없던
> YouTube 501 API/미구현 유틸리티와 구형 `src/services/aiProviders*` 두 파일을
> 외부참조 0 확인 후 제거했다.

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
| `lib/expert-verification.ts` (`requestVerification`·`approveVerification`·`rejectVerification`·`getUserVerifications`) | DORMANT(0-caller) | 전문가 인증 배지. 스키마·RLS·5개 자격 종류·승인/거부 로직이 다 있는데 **신청 라우트도 관리자 승인 화면도 없다** — `/api/admin` 은 읽기 전용 대시보드다(2026-07-28 실측). 읽기 쪽 `getExpertBadge` 만 배선돼 있어 `Answer.isExpert` 는 production 에서 항상 false. 함께 정리한 것: 질문 목록이 `q.isExpertAuthor` 로 배지를 그렸는데 `Question` 타입에도 행 매퍼에도 없는 필드라 절대 뜨지 않았다 — 분기 제거(§2.5-①), 승인 경로가 생기면 질문 쪽도 서버부터 만들어 되살릴 것 | 커뮤니티 | 신청 API + 관리자 승인 화면 + 인증서 이미지 보관 정책(개인정보) 이 셋이 함께 정해질 때 | 승인 경로 배선 시 — `community-ui-contract.test.ts` 가 그때 깨진다 |
| 커뮤니티 — 답변 채택 · 평판 | DORMANT(쓰기 경로 없음) | 읽기 쪽은 다 있는데 **쓰는 곳이 없다**(2026-07-28 실측). ① `is_accepted` 는 답변 생성 시 `false` 로만 들어가고 이후 어디서도 갱신되지 않는다 — src·supabase 전체에 UPDATE 0. 그런데 목록은 `is_accepted DESC` 로 정렬하고 화면은 채택 답변에 초록 테두리와 체크 배지를 그린다(`community/[id]/page.tsx:175,188`). 절대 뜨지 않는 표시다. ② `getUserReputation`(질문 5·답변 10·채택 15) 은 호출처 0. 그래서 지금 자기 투표에는 아무 결과가 없다 — `cast_community_vote` 는 중복·행잠금·숨김 제외·service_role 한정까지 갖췄으나 **자기 투표 금지가 없다**. 평판을 배선하는 순간 자기 글 자기 추천이 곧바로 점수가 된다. ③ 같은 파일의 주석은 "Downvote received: -2" 라고 적었지만 코드는 순 득표에 5·10 을 곱한다 — 문서/코드 불일치 | 커뮤니티 | 채택 액션 API + 질문 작성자 권한 + 평판 노출 화면이 함께 정해질 때 | 셋 중 하나라도 배선 시 — `community-accept-reputation.test.ts` 가 그때 깨진다. **그때 자기 투표·자기 채택 금지를 함께 넣어야 한다** |
| `lib/chunker.ts` | DORMANT(0-caller) | RAG 적재용 문서 분할기(`chunkText`·`extractClauseRefs`·`estimateTokens`). 위 Weaviate 경로와 세트이며 **테스트조차 없다** — 임포트 0 실측(2026-07-28). 되살릴 때 알아야 할 것: `detectHeading`이 `trimmed === trimmed.toUpperCase()`로 제목을 판별하는데 한글은 대소문자가 없어 **항상 참**이다. 그래서 대문자 라틴 약어가 하나라도 든 80자 미만 한글 줄(“MOF 2차측 결선”)은 전부 제목으로 잡힌다. 지금은 `currentSection` 라벨만 오염시키고 분할 경계는 건드리지 않아 죽은 결함이다 | 인프라 | Weaviate 적재 파이프라인 개통 시 | 되살리기 전 `detectHeading` 한글 처리 먼저 수리 |
| 알림 email/push 발송 | STUB(설정만) | prefs 토글만 존재하고 sender 없음. 기본값은 모두 false이며 인앱 알림만 제품 기능 | 인프라 | 검증된 SMTP/FCM과 수신동의·반송 처리 연결 | 인프라 구성 시 |
| IPFS 타임스탬프 등록 | DORMANT(플래그 OFF) | Pinata/IPFS 경로는 있으나 블록체인·제3자 공증이 아니며 삭제·개인정보·운영 검증 전 일반 영수증에 노출하지 않음. **플래그를 켜기 전에 닫아야 할 구멍 둘(2026-07-28 실측)**: ① `/api/notarize` POST 가 돌려주는 `verifyUrl`(`/receipt/{id}?verify=true`)의 쿼리를 **읽는 코드가 없다** — 화면의 "검증 페이지 열기" 를 눌러도 같은 화면이 다시 뜬다(§2.8 스텁 어포던스) ② 증명 레지스트리 대조 `verifyProof`(IPFS CID·txHash 불일치 검출)가 **호출처 0**. 대조 자체는 성립한다 — 영수증 행 `metadata.ipfsCid`·`proofRegistryRecordId` 와 proofs 표는 서로 다른 시점에 쓰인 별개 저장소다(자기 대조 아님). 지금 배선하지 않는 이유는 로직 문제가 아니라 **꺼진 기능에 UI 를 더 짓지 않기 위해서**다(§11) | 인프라/법무 | `RECEIPT_NOTARIZE=true` 전 Pinata 왕복·보존/삭제정책 확인 **+ 위 ①② 동시 마감** | 활성화 검토 시 — `receipt-notarize-dormancy.test.ts` 가 플래그가 켜지면 깨진다 |
