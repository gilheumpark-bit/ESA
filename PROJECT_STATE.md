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

# ESA 프로젝트 상태

## 목적과 현재 범위

ESA는 전기 엔지니어가 계산 입력·공식·판본·경고를 재검토할 수 있는 검색, 계산, 도면 분석, 전문팀 검토 작업대다. 현재 작업 범위는 전체 33개 페이지와 44개 Route Handler, 계산 엔진, 이미지·DXF·PDF 도면 파이프라인, 3개 전문팀과 별도 합의 단계, 인증·저장·결제·운영 경계의 전수 점검과 수리다.

## 현재 구조 요약

- `src/app`은 사용자 페이지와 서버 Route Handler의 production entry다.
- `src/engine`은 결정론적 계산, 기준서 판정, 영수증, 도면 토폴로지의 정본이다.
- `src/agent`는 계통도·평면도·기준서 전문팀, 합의 단계, Vision 분할·병합을 담당한다.
- `src/lib`은 인증, BYOK, Supabase, Stripe, Weaviate, 보고서 무결성, 운영 보호 경계를 제공한다.
- `supabase/migrations`는 Firebase UID 결박, 보고서, 구독, 감사로그 저장 계약이다.
- 상세 배선과 의사결정은 아래 문서가 정본이며, 휴면 기능은 `docs/DORMANT_MANIFEST.md`에만 남긴다.

## 완료

- 기준 근거가 없는 PASS와 단일 전문팀 결과를 합의로 포장하던 경로를 제거했다.
- 이미지 도면의 실제 물리 크롭, 공급자 VLM 호출, 영역 좌표 복원, 중복 병합을 연결했다.
- DXF와 벡터 PDF는 단위·페이지·파일 경계를 검증하며 합성 물리값을 만들지 않는다.
- 영수증·보고서의 소유권, 공개 범위, 해시 재검증과 저장 실패의 fail-closed 경계를 연결했다.
- BYOK 원문 키의 평문 저장을 제거하고 IndexedDB의 추출 불가능 키와 AES-GCM 암호문으로 전환했다.
- 알림 IDOR, 온프레미스 SSRF, 상태 변경 same-origin, 오류 본문 노출, 보고서 인쇄 XSS, CSV/XLSX 수식 주입을 차단했다.
- Stripe Checkout, Portal, 서명 웹훅, 이벤트 멱등 원장, DB 티어 반영 계약을 구현했다.
- Next.js 16 `proxy.ts`, Weaviate v3, 현재 공급자 모델 목록과 Gemini 헤더 기반 키 전달로 정리했다.
- 768px 헤더 오버플로와 주요 폼의 레이블·버튼 이름·키보드 상태를 수리했다.
- 호출처가 없는 구형 AI 서비스, YouTube 501 API, 가짜 도면 마킹, 미배선 Vision 선택지를 제거했다.
- 최종 소스에서 TypeScript, ESLint, 88개 Jest 스위트·748개 테스트, production build, PDF fixture 9/9, 중앙 enforcement, npm audit를 통과했다.
- production build를 3011 포트에서 기동해 33개 페이지를 375·768·1280·1440px로 순회하고, 단상 전력 계산의 입력→URL→1,870W 결과 왕복과 브라우저 오류 로그 0건을 확인했다.

## 부분 완료

- 이메일·푸시 알림은 수신 설정과 인앱 저장만 있으며 실제 발송자는 연결하지 않았다.
- 기준서 화면은 저장소 스냅샷을 탐색하지만 관할 기관 최신 원문을 자동 동기화하지 않는다.
- 공유 인메모리 레이트 리밋은 단일 프로세스 보호만 제공한다.
- IPFS 타임스탬프 등록은 개인정보·삭제·Pinata 운영 왕복 전까지 플래그 기본 OFF다.

## 미검증

- 대상 Supabase에 마이그레이션을 실제 적용한 뒤 새 세션에서 영수증·보고서·티어를 읽는 왕복.
- Stripe 테스트 모드의 Checkout, 서명 웹훅, 티어 반영, 새 로그인, Portal 전체 흐름.
- 실제 Weaviate 컬렉션 프로비저닝과 insert, 검색, 재연결.
- 실제 OpenAI, Gemini, Claude 키와 현장 도면 골든 라벨을 사용한 공급자별 인식률·비용·timeout.
- 전용 보안 스캐너 앱 실행 결과. 이번 작업에는 코드 기반 수동 점검과 테스트만 포함한다.

## 보류

- 운영 DB, 실결제, 외부 AI 키, Pinata 자격증명이 제공되지 않아 운영 데이터 쓰기와 유료 호출은 수행하지 않는다.
- 작업 트리는 사용자의 기존 `next-env.d.ts` 변경과 생성된 `test-results/`를 보존한 채 미커밋 상태다.

## 다음 첫 행동

1. 배포 담당자는 스테이징 전용 키로 Supabase 마이그레이션과 Stripe 테스트 모드 왕복을 수행한다.
2. 실제 Weaviate 컬렉션을 프로비저닝해 insert→검색→재연결을 검증한다.
3. 현장 대표 이미지·DXF·PDF를 독립 골든 라벨과 대조해 Vision 공급자별 오탐·누락을 계량한다.

## 상세 문서

- [기능 배선 지도](docs/project/IMPLEMENTATION_MAP.md)
- [구조 결정 기록](docs/project/DECISIONS.md)
- [최신 인수인계](docs/project/handoffs/2026-07-20-full-review-repair.md)
- [휴면 기능 대장](docs/DORMANT_MANIFEST.md)
- [현실화 게이트](docs/REALIZATION_PLAN.md)
