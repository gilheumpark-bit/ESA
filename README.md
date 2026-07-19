<p align="center">
  <img src="public/logo.svg" alt="ESVA 로고" width="80" />
</p>

<h1 align="center">ESVA — Electrical Search Vertical AI</h1>

<p align="center">
  <strong>엔지니어를 위한 검색 엔진</strong> — AI 기반 전기 엔지니어링 특화 검색·검증 플랫폼
</p>

<p align="center">
  <a href="https://github.com/gilheumpark-bit/ESA/actions"><img alt="CI" src="https://github.com/gilheumpark-bit/ESA/actions/workflows/ci.yml/badge.svg" /></a>
  <a href="https://github.com/gilheumpark-bit/ESA/blob/main/LICENSE"><img alt="License: CC BY-NC 4.0" src="https://img.shields.io/badge/License-CC%20BY--NC%204.0-lightgrey.svg" /></a>
  <img alt="Node" src="https://img.shields.io/badge/Node-20+-green.svg" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-strict-blue.svg" />
  <img alt="Tests" src="https://img.shields.io/badge/Tests-27_suites_/_441_pass-brightgreen.svg" />
  <img alt="Calculators" src="https://img.shields.io/badge/Calculators-57-orange.svg" />
  <img alt="Standards" src="https://img.shields.io/badge/Standards-210_articles-blueviolet.svg" />
</p>

<p align="center">
  <a href="#주요-기능">주요 기능</a> •
  <a href="#아키텍처">아키텍처</a> •
  <a href="#시작하기">시작하기</a> •
  <a href="#기술-스택">기술 스택</a> •
  <a href="#테스트">테스트</a> •
  <a href="#api">API</a> •
  <a href="#로드맵">로드맵</a> •
  <a href="#기여">기여</a> •
  <a href="#라이선스">라이선스</a>
</p>

---

## 개요

ESVA는 멀티 모델 LLM 검색과 결정론적 엔지니어링 계산기, 4팀 에이전트 검증, 투명한 영수증 시스템을 결합한 전문 전기 엔지니어링 플랫폼입니다. 면허 소지 전기 엔지니어·설계자·학생을 위해 설계되었습니다.

> **상태:** 오픈 베타 (v0.2.0) — BYOK(자체 API 키) 방식으로 무료 사용

### 핵심 가치

- **다중 기준서 검색** — KEC(109), NEC(41), IEC(25), JIS(19), NER(9), ESA(7) = 210개 조항, 조건 트리 DSL 기반
- **57개 검증 계산기** — 전압강하·케이블 선정·아크플래시·단락전류·접지·태양광 등 (±0.01% 정확도)
- **4팀 에이전트 시스템** — SLD/평면도/기준서/합의 팀 + 토론 프로토콜 + 8개 물리법칙 검증
- **영수증 투명성** — 모든 AI 답변에 검증 가능한 영수증 동반 (SHA-256 해시·일시 기록·모델 추적)
- **BYOK(자체 키)** — 사용자가 자신의 LLM API 키를 사용, ESVA는 키를 서버에 저장하지 않음

---

## 주요 기능

### AI 검색
- 멀티 모델 LLM 지원: Google Gemini 2.5, OpenAI GPT-4.1, Anthropic Claude 4, Groq Llama 4, Mistral, Ollama
- 7개 언어 키워드 추출 (KR/EN/JP/ZH/DE/FR/ES)
- EngRank 스코어링 알고리즘 + 투명한 랭킹 근거
- Weaviate 벡터 검색 + 로컬 폴백

### 엔지니어링 계산기 (57개)

| 분야 | 예시 |
|------|------|
| 전력 | 전압강하(1φ/3φ), 역률 보정, 수용률/부등률, 전력 손실 |
| 보호 | 단락전류(IEC 60909), 아크플래시(IEEE 1584), 차단기 선정, 누전차단기, 계전기 |
| 배선 | 케이블 선정(KEC/NEC/IEC), 전선관 충전율, 허용전류 보정, AWG 변환 |
| 접지 | 접지저항(Dwight), 등전위 본딩, 피뢰 시스템 |
| 태양광/ESS | 발전량, 배터리 용량, 계통연계, PCS 용량, DC 케이블 |
| 변압기 | 용량, 손실, 효율, 임피던스, 돌입전류, 병렬운전 |
| 조명 | 조도(KS C 7612), 에너지 절감, 비상발전기, UPS |
| 전동기 | 용량, 기동전류, 효율(IE1-4), 제동저항, 인버터 |
| 수변전 | CT/VT 선정, 피뢰기, MV 스위치기어 |

모든 계산기: 순수 함수, 샌드박스 실행, 부작용 없음, 불확실성 범위 추적.

### 기준서 준수 (210개 조항 · 194개 판정 가능)

| 기준서 | 조항 | 범위 |
|--------|------|------|
| **KEC 2021** | 109 | 핵심 + 확장, 전용 + 범용 평가기 |
| **NEC 2023** | 41 | KEC/IEC/JIS 등가 조항 전체 교차참조 |
| **IEC 60364** | 25 | 6판 + 개정, 교차참조 |
| **JIS C 0364** | 19 | A/B/C/D 접지, 내진, 의료, EV |
| **NER (내선규정)** | 9 | 한국 내선 배선 규정 |
| **ESA (전기사업법)** | 7 | 한국 전기사업법 |

> **210개 정의**, **194개 판정 체인 등록** — NER/ESA(16개)는 검색되지만 아직 `evaluateStandard`에 배선되지 않아 판정 체인에서 HOLD를 반환합니다.

- AND/OR 복합 조건 트리 DSL
- 범용 평가기 + 전용 평가기(차단기 선정·허용전류·차단용량)
- **자리표시자 안전 판정** — 임계값이 미기입 자리표시자(`value: 0`)인 조항은 조작된 pass/fail 대신 **HOLD**를 반환합니다. 임계값은 공인 표 또는 측정 입력에서만 오며, 절대 추측하지 않습니다.
- 허용전류 표: KEC, NEC(Table 310.16), IEC 60364-5-52 — 각 결과에 `SourceTag`(출처 태그) 부착

### 4팀 에이전트 아키텍처

```
Input → Orchestrator → ┬─ TEAM-SLD (계통도 분석)
         (retry 2x)    ├─ TEAM-LAYOUT (평면도 분석)
                        ├─ TEAM-STD (규정 질의)
                        └─ TEAM-CONSENSUS (합의 + 보고서)
```

- 8개 물리법칙 검증 (V=IR, P=VI, I²R, Z=√R²+X², VD%, Q=Ptanφ, S=P/cosφ, E=Pt)
- 최대 3라운드 토론 + 2/3 합의 또는 보수적 채택
- 합의 실패 시 사람(HITL) 에스컬레이션 — 리포트에 "사람 검토 필요"로 노출
- 팀 디스패치 실패 시 지수 백오프 재시도

### 비전 파이프라인
- 전기 도면용 DXF/PDF 벡터 파싱
- VRAM 분할 병렬 비전 (N×N 그리드, PNG/JPEG 헤더 파싱)
- 150+ 전기 심볼 DB (CAD 블록명 → 표준 타입)
- VLM 통합: Gemini 2.5 Flash / GPT-4.1 Vision, 재시도 + 키 검증

### 보안 & 검증
- 9개 가드레일 차단 규칙 + 11개 시스템 프롬프트 규칙
- 17개 프롬프트 인젝션 탐지 패턴 (EN + KO)
- 모든 사용자 대면 API 입력에 `sanitizeInput()`
- BYOK 키 AES-GCM 암호화 (세션 범위)
- 9개 프로파일 레이트 리밋 (슬라이딩 윈도우)
- 안전 필수 계산 전반에 PE급 면책 고지

### 전문가용 출력
- ESVA Verified 배지 + IDE 스타일 빨강/노랑/초록 마킹
- 엔지니어링 검토 보고서 (이슈 분석 → 적용 법규 → 기술 검증 → 결론 → 보류 RFI)
- SHA-256 해시 영수증 + 선택적 IPFS 핀
- Excel 내보내기 (ExcelJS, 서식 + 수식 포함 2시트)

---

## 아키텍처

```
┌──────────────────────────────────────────────────────┐
│                    Next.js 16 App                    │
│               (19 pages, 31 API routes)              │
├──────────────────────────────────────────────────────┤
│  Agent Layer                                         │
│  ┌───────────┐  ┌───────────┐  ┌──────────────────┐ │
│  │Orchestr.  │  │ Legacy    │  │ Vision Pipeline  │ │
│  │(4-Team)   │  │(Main/     │  │ (DXF/PDF/VLM)    │ │
│  │+ Retry    │  │Bridge/    │  │ + PNG/JPEG parse  │ │
│  │SLD/LAY/   │  │Sandbox)   │  │ 150+ symbols     │ │
│  │STD/CON    │  │17 sbox    │  │ Gemini/GPT-4V    │ │
│  └───────────┘  └───────────┘  └──────────────────┘ │
├──────────────────────────────────────────────────────┤
│  Engine Layer                                        │
│  ┌────────┐ ┌──────────┐ ┌────────┐ ┌────────────┐ │
│  │Calc(57)│ │Std(210)  │ │Topology│ │Receipt     │ │
│  │±0.01%  │ │KEC/NEC/  │ │BFS     │ │SHA-256     │ │
│  │uncert. │ │IEC/JIS   │ │Graph   │ │IPFS        │ │
│  │range   │ │AND/OR DSL│ │Cache   │ │            │ │
│  └────────┘ └──────────┘ └────────┘ └────────────┘ │
├──────────────────────────────────────────────────────┤
│  Data Layer                                          │
│  250+ IEC terms │ 200+ synonyms │ 170+ constants    │
│  KEC/NEC/IEC    │ 56 material   │ 11 drawing        │
│  ampacity tables│ prices        │ templates          │
└──────────────────────────────────────────────────────┘
```

> 상세 시스템 설계는 [ARCHITECTURE.md](ARCHITECTURE.md) 참조.

---

## 시작하기

### 사전 요구사항

- Node.js 20+ (`.nvmrc` 참조)
- npm 10+

### 설치

```bash
git clone https://github.com/gilheumpark-bit/ESA.git
cd ESA
npm install
```

### 환경 변수

`.env.local` 파일을 생성하세요:

```env
# Firebase 인증
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=

# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=

# Stripe (선택)
STRIPE_SECRET_KEY=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=

# AI 제공자 (선택 — 사용자가 BYOK로 자체 키 제공 가능)
GOOGLE_AI_API_KEY=
OPENAI_API_KEY=
ANTHROPIC_API_KEY=

# Weaviate 벡터 DB (선택 — 로컬 폴백 있음)
WEAVIATE_URL=
WEAVIATE_API_KEY=

# 서버 간 내부 호출 인증 시크릿 (선택 — 미설정 시 내부 우회 비활성)
INTERNAL_API_SECRET=
```

> 모든 AI 제공자 키는 선택 사항입니다. ESVA는 BYOK로 동작하며, 사용자가 설정에서 자체 키를 등록할 수 있습니다.

### 개발

```bash
npm run dev          # 개발 서버 (Turbopack)
npm run build        # 프로덕션 빌드
npm run lint         # ESLint
npm test             # 전체 테스트 (27 suites, 441 tests)
npm run test:calc    # 계산기 정확도 테스트만
npm run test:watch   # 워치 모드
```

---

## 기술 스택

| 계층 | 기술 |
|------|------|
| 프레임워크 | Next.js 16 (App Router, Turbopack) |
| 언어 | TypeScript (strict 모드) |
| 스타일 | Tailwind CSS 4 |
| 인증 | Firebase Auth |
| 데이터베이스 | Supabase (PostgreSQL + Edge Functions) |
| 결제 | Stripe |
| AI SDK | Vercel AI SDK (멀티 프로바이더) |
| 상태 관리 | Zustand + React Query |
| 벡터 DB | Weaviate (+ 로컬 폴백) |
| 테스트 | Jest 30 + Playwright |
| 배포 | Vercel |

### 지원 AI 모델 (2026-Q2)

| 제공자 | 모델 |
|--------|------|
| Google | Gemini 2.5 Pro, 2.5 Flash, 2.5 Flash Lite |
| OpenAI | GPT-4.1, 4.1 Mini, 4.1 Nano, o4-mini |
| Anthropic | Claude Opus 4, Sonnet 4, Haiku 4.5 |
| Groq | Llama 4 Maverick/Scout, Llama 3.3 70B |
| Mistral | Large, Small, Codestral |
| Ollama | Llama 4, Gemma 3, Qwen 3, Mistral Small 3.1 |

---

## 테스트

27개 테스트 스위트 / 441개 테스트. 계산기 테스트는 기준값 대비 **±0.01% 정확도**를 강제하며, 파라미터 계약(param-contract) 스위트가 57개 계산기 전부를 실제 폼 제출 경로로 실행 검증합니다.

| 분류 | 스위트 | 테스트 | 범위 |
|------|--------|--------|------|
| 계산기 | 9 | ~120 | 전압강하, 케이블, 단락전류, 변압기, 접지, 태양광, 전력, 아크플래시, 단위 변환 |
| 기준서 | 4 | ~40 | KEC DSL 경계, NEC 조항, IEC 조항, 토론 프로토콜 |
| LLM | 4 | ~50 | 의도 파서, 출력 필터, 판정기, 출처 추적 |
| Lib/검색 | 4 | ~60 | 레이트 리밋, 보안 정책(16개 인젝션 테스트), API 헬퍼, 쿼리 파서 |
| 에이전트 | 1 | ~10 | 오케스트레이터, 분류, 라우팅 |
| E2E | 1 | 28 | 페이지, API, 반응형, 접근성 (Playwright) |

---

## API

### 자체 문서화

```
GET /api/openapi     # OpenAPI 3.1 스키마 (자동 생성)
GET /api/health      # 의존성 헬스 대시보드
```

### 응답 형태 (모든 라우트)

```json
{ "success": true, "data": { ... } }
```
```json
{ "success": false, "error": { "code": "ESA-3001", "message": "..." } }
```

### 에러 코드 범위

| 범위 | 분류 |
|------|------|
| ESA-1xxx | 인증/권한 |
| ESA-2xxx | 요금제/한도 |
| ESA-3xxx | 검색 |
| ESA-4xxx | 계산 |
| ESA-5xxx | 내보내기 |
| ESA-6xxx | 외부 서비스 |
| ESA-7xxx | 기준서 변환 |
| ESA-9xxx | 시스템 |

### 성능 헤더
- 모든 응답에 `X-Response-Time`, `Server-Timing`

---

## 로드맵

| 단계 | 목표 | 상태 |
|------|------|------|
| v0.1.0 | 코어 플랫폼 (계산기 56, 조항 211, 4팀 에이전트) | ✅ 완료 |
| v0.2.0 | 품질 업그레이드 (IEC 표, DSL AND/OR, 재시도, 접근성) | ✅ 완료 |
| v0.3.0 | 파인튜닝 모델 (Qwen 3 32B + KEC LoRA) | 계획 |
| v0.4.0 | 동적 시뮬레이션 (과도현상, 고조파) | 계획 |
| v0.5.0 | 보호 협조 TCC 오버레이 | 계획 |
| v1.0.0 | 정식 출시 + SaaS 과금 | 계획 |

---

## 프로젝트 구조

```
src/
├── app/                    # Next.js App Router (19 pages, 31 API routes)
├── agent/                  # 4팀 에이전트 + 토론 + 비전 + 17 샌드박스
├── engine/
│   ├── calculators/        # 57개 순수함수 계산기
│   ├── standards/          # KEC/NEC/IEC/JIS/NER/ESA 조건 트리 DSL (210개 조항)
│   ├── constants/          # 170+ 전기 상수 + 계산 임계값
│   ├── conversion/         # 미터↔야드파운드 어댑터 + 단위 변환
│   ├── verification/       # 감사 엔진 + 품질 체크리스트 + 민감도
│   ├── topology/           # BFS 그래프 + DXF/PDF 파서
│   ├── receipt/            # 영수증 생성기 + SHA-256
│   └── llm/                # 22개 LLM 도구 + 시스템 프롬프트
├── data/                   # 250+ IEC 용어, 200+ 동의어, 허용전류 표, 단가
├── components/             # React 컴포넌트 (30+)
├── lib/                    # 보안, 레이트 리밋, 캐시, 임베딩, AI 프로바이더
└── services/               # 서버측 AI 스트리밍 프로바이더
```

---

## 문서

| 문서 | 설명 |
|------|------|
| [README.md](README.md) | 본 문서 — 개요 및 설정 |
| [ARCHITECTURE.md](ARCHITECTURE.md) | 상세 시스템 아키텍처 |
| [CONTRIBUTING.md](CONTRIBUTING.md) | 개발 지침 및 컨벤션 |
| [CHANGELOG.md](CHANGELOG.md) | 버전 이력 |
| [EVALUATION_GUIDE.md](EVALUATION_GUIDE.md) | 외부 검토용 10개 항목 평가 루브릭 |
| [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) | Contributor Covenant 2.1 |
| [SECURITY.md](.github/SECURITY.md) | 취약점 신고 + 보안 조치 |
| [LICENSE](LICENSE) | CC BY-NC 4.0 |

---

## 기여

개발 지침, 브랜치 전략, 코드 컨벤션, PR 절차는 [CONTRIBUTING.md](CONTRIBUTING.md)를 참조하세요.

---

## 라이선스

본 프로젝트는 [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/) 라이선스입니다 — 비상업적 사용만 허용됩니다. 상업적 이용은 별도 문의 바랍니다.

---

<p align="center">
  전기 엔지니어를 위해, 엔지니어가 만듭니다.<br/>
  <strong>ESVA</strong> — 엔지니어를 위한 검색 엔진
</p>
