---
schemaVersion: 1
project: ESA
status: active
baselineBranch: feat/esva-v1.0
codeBaselineCommit: 31b6f095afbf2aa004cf23dc7fac60c1a12a54b1
updatedAt: 2026-07-20T11:39:33.7302794+09:00
trigger: architecture
changedDomains: [agent, app, engine, lib, supabase]
---

# 2026-07-20 전체 리뷰·수리 인수인계

## 변경

- 전체 페이지, API, 계산·기준서·도면·전문팀, 인증·저장·결제·운영 경계를 재검토하고 확인된 결함을 코드·테스트·문서에서 함께 수리했다.
- 3개 전문팀과 합의 단계를 분리하고, 이미지·DXF·PDF 도면의 실제 물리 근거와 보고서 증거를 연결했다.
- 인증·소유권·same-origin·SSRF·BYOK·오류 노출·파일 내보내기·보고서 인쇄 경계를 강화했다.
- Supabase 보고서·Firebase UID·구독·감사로그 마이그레이션과 Stripe 서명 웹훅 계약을 추가했다.
- 166개 추적 변경과 새 구현·회귀 테스트 범위에서 구형·중복·가짜 표면을 제거하고 사용자 문구와 운영 문서를 현재 구현에 맞췄다.

## 이유

- 기존 구현에는 서로 다른 전문팀처럼 보이는 동일 실행, 근거 없는 PASS, 랜덤 도면 마킹, 평문 BYOK, 리소스 소유권 누락, 공급자 오류 본문 노출, 운영 저장 성공 위장, 결제 티어의 비서명 입력 의존이 섞여 있었다.
- 화면이 존재한다는 사실과 실제 저장·재조회·운영 왕복이 검증됐다는 주장을 분리할 필요가 있었다.

## 사용자 소유 변경

- 작업 시작 전부터 수정 상태였던 `next-env.d.ts`는 건드리거나 되돌리지 않았다.
- 기존 또는 생성된 `test-results/`는 삭제하지 않았다.
- 커밋, 푸시, 운영 DB 변경, 실제 결제, 외부 유료 AI 호출은 수행하지 않았다.

## 완료

- TypeScript 전체 검사와 ESLint 무경고 검사가 현재 소스에서 exit 0이다.
- 보안·배선·도면·합의·저장 회귀 테스트를 추가하고 발견한 실패를 수리했다.
- 33개 페이지와 44개 Route Handler의 정적 인벤토리를 만들고 주요 공개 화면을 브라우저로 순회했다.
- 제품 상태, 기능 배선, 구조 의사결정, 휴면 기능의 활성 조건을 프로젝트 내부 정본으로 남겼다.

## 부분 완료

- 결제·외부 AI·Weaviate·Supabase는 로컬 코드 계약과 회귀 테스트를 닫았지만, 안전한 스테이징 자격증명이 없어 실환경 왕복은 남아 있다.
- 이메일·푸시 발송자와 관할 기관 기준서 최신 원문 자동 동기화는 제품 범위가 확정될 때까지 휴면 또는 수동 운영 상태다.

## 미검증

- 운영 또는 스테이징 Supabase 마이그레이션 적용과 새 세션 read-back.
- Stripe 테스트 모드 전체 구독 흐름과 실제 공급자 AI 도면 인식.
- Weaviate 실제 컬렉션과 이메일·푸시 발송자.
- 전용 보안 스캐너 앱 결과와 현장 도면 독립 골든 라벨 정확도.

## 보류

- 외부 자격증명과 안전한 스테이징 대상이 없어 실서비스 데이터 쓰기·결제·유료 AI 호출을 보류한다.
- 현재 변경은 미커밋이므로 `codeBaselineCommit`은 작업 시작 HEAD를 가리킨다. 다음 작업자는 Git diff와 본 문서를 함께 대조해야 한다.

## 검증

- `git diff --check`: exit 0. 줄 끝 변환 안내 외 공백 오류는 0건이다.
- `npx tsc --noEmit`: exit 0.
- `npm run lint -- --max-warnings=0`: exit 0.
- `npm test -- --runInBand`: exit 0, 88개 스위트·748개 테스트 통과.
- `npm run build`: exit 0, Next.js 16.2.10 production build와 64개 정적 생성 항목 완료.
- `npm run gate:pdf`: exit 0, 회로·표제란·그리드·필터·12MB 경계·비PDF 거부를 포함한 fixture 9/9 통과.
- 중앙 `scripts/enforce.ps1 -Path .`: exit 0, 확정 BLOCKER 0건, 문맥 REVIEW 0건, 범용 휴리스틱 WARN 49건, `PASS-WITH-REVIEW`.
- `npm audit --audit-level=high`: exit 0, 알려진 취약점 0건.
- production health: HTTP 200, 외부 서비스가 없는 로컬 환경을 정직하게 `degraded`로 반환.
- 브라우저: 33개 페이지를 375·768·1280·1440px에서 순회해 본문 1개 이상, 이름 없는 컨트롤·깨진 이미지·빈 링크·원시 배포 설정명·Next 오류·수평 오버플로 문제 0건을 확인했다.
- 최종 SLD 화면은 네 해상도에서 별도 재검증했고, 단상 전력 계산은 `220V × 10A × 0.85 = 1,870W`와 URL 입력 반영을 확인했다. 새 브라우저 세션의 error/warn 로그는 0건이다.
- 인수인계 검증기는 문서 계약 문제 0건을 반환한다. 현재 작업이 사용자 요청에 따라 미커밋이므로 baseline 대비 신선도 판정은 의도적으로 `STALE`이다.

## 다음 첫 행동

1. 스테이징 자격증명이 준비되면 Supabase, Stripe, Weaviate, AI 공급자 순으로 write, persist, 새 세션 read-back을 검증한다.
2. 현장 도면과 독립 골든 라벨로 이미지 공급자별 정밀도·재현율·비용·timeout을 계량한다.
3. 전용 보안 스캐너를 별도로 실행하고 수동 검토 결과와 교차 확인한다.
