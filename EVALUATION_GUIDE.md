# ESVA 프로젝트 평가 가이드

## 평가 대상

**ESVA (Electrical Search Vertical AI)** — AI 기반 전기공학 버티컬 검색 및 검증 플랫폼

## 프로젝트 목적

전기 기술자(기술사, 설계 엔지니어, 감리원, 시공자, 학생)가 전기설비 기준서(KEC/NEC/IEC/JIS)를 AI로 검색하고, 52개 이상의 공학 계산기로 설계값을 산출하며, 4-Team 에이전트 시스템으로 결과를 교차 검증하고, 모든 AI 응답에 투명한 영수증(SHA-256 해시)을 첨부하는 원스톱 플랫폼.

**핵심 차별점**: AI 기반 다국가 기준서 검색 + 확정적 공학 계산기 + 에이전트 토론 검증 + 영수증 투명성을 단일 플랫폼에서 제공하는 제품은 현재 시장에 존재하지 않음.

---

## 프로젝트 규모

| 항목 | 수치 |
|------|------|
| TypeScript 파일 | 366개 |
| 코드 라인 | ~77,000줄 |
| 페이지 (Next.js App Router) | 29개 |
| API 엔드포인트 | 31개 |
| React 컴포넌트 | 27개 |
| 공학 계산기 | 58개 |
| 기준서 조문 (DSL) | 211+ (KEC 136, NEC 41, IEC 25, JIS 15) |
| 테스트 스위트 | 22개 / 323 테스트 |
| 전기공학 상수 | 170+ |
| IEC 60050 용어 | 250+ (4개국어) |
| 동의어 매핑 | 200+ |
| 전기 심볼 DB | 150+ |

---

## 기술 스택

| 레이어 | 기술 |
|--------|------|
| 프레임워크 | Next.js 16 (App Router, Turbopack) |
| 언어 | TypeScript (strict mode) |
| 스타일링 | Tailwind CSS 4 |
| 인증 | Firebase Auth |
| 데이터베이스 | Supabase (PostgreSQL + Edge Functions) |
| 결제 | Stripe |
| AI SDK | Vercel AI SDK (multi-provider) |
| 상태관리 | Zustand + React Query |
| 벡터 DB | Weaviate (+ local fallback) |
| 배포 | Vercel |

---

## 평가 기준 (10개 카테고리, 각 10점 만점)

### 1. 아키텍처 설계 (Architecture) — /10

평가 포인트:
- **4-Team Agent System**: Orchestrator → SLD/Layout/Standards/Consensus 팀 분리 및 라우팅 로직
- **Legacy 3-Tier Agent**: Main → Bridge → Sandbox (17개 샌드박스) 계층 분리
- **5-Stage DAG Pipeline**: EXTRACT→LOOKUP→CALCULATE→VERIFY→REPORT 강제 순서 상태기계
- **Debate Protocol**: 물리법칙 교차검증(V=IR, P=VI), 3라운드 토론, 2/3 합의, HITL 에스컬레이션
- **관심사 분리**: agent/ vs engine/ vs lib/ vs data/ vs components/ 명확한 계층
- **확장성**: 새 계산기/기준서/에이전트 팀 추가 시 기존 코드 수정 없이 레지스트리 등록만으로 가능한지

검토 파일:
- `src/agent/orchestrator.ts` — 4-Team 오케스트레이터
- `src/agent/pipeline.ts` — DAG 파이프라인
- `src/agent/debate/` — 토론 프로토콜
- `src/engine/calculators/plugin-registry.ts` — 계산기 레지스트리
- `src/engine/standards/registry.ts` — 기준서 레지스트리

---

### 2. 코드 품질 (Code Quality) — /10

평가 포인트:
- **TypeScript strict mode** 적용 여부 (`tsconfig.json` → `"strict": true`)
- **`any` 타입 사용**: 총 13개소 — 각각 정당한 사유가 있는지 (eslint-disable 주석 포함)
- **Pure function 원칙**: 52개 계산기가 부작용 없는 순수 함수인지
- **withApiHandler 패턴**: 모든 API 라우트가 중앙 에러 핸들러를 사용하는지
- **상수 중앙화**: 매직 넘버 없이 `engine/constants/electrical.ts`와 `safety-factors.ts`에서 참조하는지
- **메모리 관리**: in-memory Map에 MAX_ENTRIES + 주기적 cleanup이 있는지
- **에러 코드 체계**: ESA-XXXX 형식의 구조화된 에러 코드 사용 여부

검토 파일:
- `tsconfig.json`
- `src/lib/api/api-handler.ts` — withApiHandler
- `src/engine/constants/electrical.ts` — 상수 중앙화
- `src/data/error-codes.ts` — 에러 코드

---

### 3. 테스트 (Testing) — /10

평가 포인트:
- **테스트 커버리지**: 22 suites / 323 tests — 주요 모듈 커버 여부
- **계산기 정확도**: ±0.01% 오차 범위 내 reference value 검증
- **기준서 DSL 테스트**: KEC/NEC/IEC condition tree 평가 정확성
- **LLM 도구 테스트**: Intent parser, output filter, judge, source tracker
- **보안 테스트**: Rate limit, safety policies
- **E2E 테스트 유무**: Playwright 설정 존재 여부 (현재 설정 파일만 존재)
- **CI/CD**: `.github/workflows/ci.yml` — PR 시 자동 test+build 실행 여부

실행 명령:
```bash
npm test              # 전체 22 suites
npm run test:calc     # 계산기 정확도만
```

---

### 4. 기능 완성도 (Feature Completeness) — /10

평가 포인트:
- **52+ 계산기**: 전압강하, 케이블 사이징, 아크플래시(IEEE 1584), 단락전류, 접지, 태양광, 변압기, 조명, 전동기, 역률, 수요율, 전선관 — 각각 실제 계산 가능한지
- **211+ 기준서 조문**: KEC/NEC/IEC/JIS condition tree DSL — 실제 판정 가능한지
- **Excel 내보내기**: exceljs 기반 실제 .xlsx (2-sheet, 서식, 라이브 수식)
- **Receipt 시스템**: SHA-256 해시, 타임스탬프, 모델 추적
- **BYOK**: 사용자가 자기 LLM API 키를 등록하고 사용하는 흐름
- **Vision Pipeline**: DXF/PDF 벡터 파싱 + 150+ 전기 심볼 인식
- **Stub/미구현 여부**: YouTube 요약은 placeholder 수준 — 이 부분의 정직한 표시 여부

검토 파일:
- `src/engine/calculators/` — 전체 58개 계산기 파일
- `src/engine/standards/kec/`, `nec/`, `iec/`, `jis/` — 기준서 DSL
- `src/lib/export-excel.ts` — Excel 내보내기
- `src/engine/receipt/` — Receipt 생성기
- `src/lib/youtube-summary.ts` — YouTube (placeholder 확인)

---

### 5. 데이터 충실도 (Data Fidelity) — /10

평가 포인트:
- **기준서 정확성**: KEC 2021 조문이 실제 법규와 일치하는지 (저작권법 제7조 근거로 원문 사용 가능)
- **NEC/IEC 저작권 준수**: 자체 작성 한국어 설명만 사용, 영문 원문 미포함
- **전기공학 상수**: 저항률(Cu 0.017241, Al 0.028264), 온도계수, IEEE 1584 계수 등의 정확성
- **AWG 테이블**: ASTM B258 기준 41개 항목 정확성
- **Motor FLC 테이블**: NEC 430.248/250 기준 39개 항목
- **IEC 60050 용어**: 250+ 항목 4개국어(KR/EN/JP/ZH) 대응 정확성

검토 파일:
- `src/engine/constants/physical.ts` — 물리 상수
- `src/engine/constants/electrical.ts` — 전기공학 상수
- `src/engine/conversion/unit-conversion.ts` — AWG 테이블
- `src/data/motor-flc/motor-flc-tables.ts` — 전동기 FLC
- `src/data/iec-60050/electrical-terms.ts` — IEC 용어

---

### 6. 보안 (Security) — /10

평가 포인트:
- **입력 살균**: `sanitizeInput()` — 모든 사용자 입력 API에 적용 여부
- **URL 허용목록**: `assertUrlAllowedForFetch()` — 외부 URL 페치 제한
- **속도 제한**: 슬라이딩 윈도우 기반 rate limiter
- **BYOK 암호화**: AES-GCM으로 사용자 API 키 세션 내 암호화
- **메모리 DoS 방지**: in-memory Map에 MAX_ENTRIES 설정
- **Guardrails**: 11개 차단 규칙 (물리적 한계, 확신도 게이트)
- **LLM Output Filter**: 확률적 표현 차단, 출처 없는 수치 차단, INSUFFICIENT_DATA 차단
- **서버 사이드 키 미저장**: BYOK 키가 세션 외 어디에도 저장되지 않는지

검토 파일:
- `src/lib/security-hardening.ts`
- `src/lib/rate-limit.ts`
- `src/agent/guardrails.ts` — 11개 규칙
- `src/engine/llm/output-filter.ts` — LLM 필터

---

### 7. 문서화 (Documentation) — /10

평가 포인트:
- **README.md**: 프로젝트 개요, 아키텍처 다이어그램, 설치 가이드, API 레퍼런스
- **CLAUDE.md**: AI 협업 가이드 (페르소나, 판단 체계, NOA 스택)
- **CONTRIBUTING.md**: 코드 컨벤션, 브랜치 전략, PR 프로세스
- **CHANGELOG.md**: v0.1.0 릴리즈 내역
- **SECURITY.md**: 보안 정책, 취약점 리포트 절차
- **OpenAPI 3.1**: `/api/openapi` 자동 문서화 엔드포인트
- **인라인 주석**: 도메인 로직 한국어, 인프라 영어 컨벤션 준수
- **GitHub 템플릿**: Issue(버그/기능/계산기), PR 체크리스트

---

### 8. UX/디자인 (User Experience) — /10

평가 포인트:
- **반응형**: 모바일/태블릿/데스크톱 레이아웃 적응
- **다크 모드**: 시스템 설정 연동 + 수동 토글
- **접근성**: Skip links, ARIA labels, 키보드 내비게이션
- **계산 진행 표시**: CalcProgressDAG (5-stage 시각화)
- **기준서 참조 패널**: StandardRefPanel (계산 결과 옆에 참조 조문 고정)
- **SplitView**: 드래그 리사이즈, 모바일 탭 모드
- **KnowledgePanel**: 검색 결과 우측 지식 패널
- **Loading UX**: Skeleton 로딩, 스트리밍 인디케이터
- **빈 상태**: 가이드 메시지 + 예시 자동채우기
- **전문 도구로서의 신뢰감**: 불필요한 애니메이션 없이 정확한 정보 전달

검토 파일:
- `src/app/page.tsx` — 메인 페이지
- `src/app/(with-nav)/search/page.tsx` — 검색 결과
- `src/app/(with-nav)/calc/[category]/[id]/page.tsx` — 계산기
- `src/components/CalcProgressDAG.tsx`
- `src/components/StandardRefPanel.tsx`
- `src/components/SplitView.tsx`

---

### 9. 배포 준비도 (Deployment Readiness) — /10

평가 포인트:
- **프로덕션 빌드**: `npm run build` 성공 여부
- **CI/CD**: `.github/workflows/ci.yml` — TypeScript 체크 + Jest + Build
- **환경변수**: `.env.example` — 필수 변수 문서화
- **에러 핸들링**: 중앙 에러 바운더리 + 구조화된 에러 응답
- **성능 헤더**: `X-Response-Time`, `Server-Timing`
- **Health 엔드포인트**: `/api/health` — 종속성 대시보드
- **PWA**: Service Worker + IndexedDB 오프라인 지원
- **SEO**: sitemap.xml 자동 생성

실행 명령:
```bash
npm run build         # 프로덕션 빌드
npm test -- --ci      # CI 모드 테스트
```

---

### 10. 엔지니어링 전문성 (Engineering Domain Expertise) — /10

평가 포인트:
- **PE급 면책조항**: 모든 안전 관련 계산에 법적 면책 텍스트 포함
- **추정 금지 규칙**: 아크플래시/전동기 기동전류/과도현상 추정 금지 (guardrails + output filter)
- **물리법칙 검증**: V=IR, P=VI 교차 검증 (0.1% 차이 시 즉시 반려)
- **국가별 Safety Factor**: KR/US/JP/INT 4개국 안전율 프로파일 자동 적용
- **단위계 분리**: Metric↔Imperial 정의값 기반 변환 (오차 0%)
- **Imperial Adapter**: 미국 시장 지원 — ft/HP/°F 입출력 + AWG 등가 표시
- **Engineering Review Report**: 5단계 포맷 (Issue Analysis → Applicable Codes → Technical Verification → Conclusion → Pending RFI)
- **Chief Principal Engineer 페르소나**: 30년 경력 수석 전기 엔지니어 톤 (Cold & Professional)
- **INSUFFICIENT_DATA 차단**: 확신도 < 70% 시 "계산 불가" 단호 차단

검토 파일:
- `src/engine/constants/safety-factors.ts` — 국가별 Safety Factor Registry
- `src/engine/conversion/imperial-adapter.ts` — Imperial 어댑터
- `src/engine/calculators/country-defaults.ts` — 국가별 기본값
- `src/engine/llm/system-prompt.ts` — 페르소나 + 리포트 포맷
- `src/engine/constants/disclaimer.ts` — PE 면책조항

---

## 경쟁사 비교 참고

| 기능 | ESVA | Kopperfield | Ask NETA | ETAP | ELEK |
|------|------|-------------|----------|------|------|
| 다국가 기준서 (KEC+NEC+IEC+JIS) | O | NEC만 | NEC만 | X | AS/NZS |
| BYOK 멀티모델 LLM | O (6사 22모델) | X | X | X | X |
| 4-Team 에이전트 토론 검증 | O | X | X | X | X |
| 물리법칙 교차검증 | O | X | X | X | X |
| 영수증 투명성 (SHA-256) | O | X | X | X | X |
| Imperial↔Metric 자동 변환 | O | X | X | O | O |
| 국가별 Safety Factor 자동 적용 | O | X | X | 부분 | 부분 |

---

## 평가 실행 방법

```bash
# 1. 저장소 클론
git clone https://github.com/gilheumpark-bit/ESA.git
cd ESA

# 2. 의존성 설치
npm install

# 3. 테스트 실행
npm test

# 4. 프로덕션 빌드
npm run build

# 5. 개발 서버 (선택)
npm run dev
```

## 평가 결과 양식

```
## ESVA 평가 결과

| # | 카테고리 | 점수 (/10) | 근거 |
|---|----------|-----------|------|
| 1 | 아키텍처 설계 | /10 | |
| 2 | 코드 품질 | /10 | |
| 3 | 테스트 | /10 | |
| 4 | 기능 완성도 | /10 | |
| 5 | 데이터 충실도 | /10 | |
| 6 | 보안 | /10 | |
| 7 | 문서화 | /10 | |
| 8 | UX/디자인 | /10 | |
| 9 | 배포 준비도 | /10 | |
| 10 | 엔지니어링 전문성 | /10 | |
| **종합** | | **/100** | |

### 강점 (Top 3)
1.
2.
3.

### 개선 필요 (Top 3)
1.
2.
3.

### 경쟁 우위 평가
-
```
