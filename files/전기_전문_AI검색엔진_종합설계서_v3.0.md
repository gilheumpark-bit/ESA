# ⚡ 전기 전문 AI 검색엔진 종합 설계서 v3.0

> **버전**: v3.0 (최종)
> **작성일**: 2026.04.04
> **변경 이력**:
> - v1.0: 초기 설계 (전기 도메인, 기본 아키텍처)
> - v2.0: AI 도메인 추가, BYOK 구조 확정
> - v3.0: 날짜 박제 시스템, 협업 기능, 모바일 현장 모드, 에이전트 워크플로우, 지식 그래프, 커뮤니티, 블록체인 공증, 수익 모델 추가

---

## 📋 목차

1. [프로젝트 개요](#1-프로젝트-개요)
2. [핵심 철학 및 원칙](#2-핵심-철학-및-원칙)
3. [전체 시스템 아키텍처](#3-전체-시스템-아키텍처)
4. [기술 스택](#4-기술-스택)
5. [데이터베이스 스키마](#5-데이터베이스-스키마)
6. [데이터 수집 파이프라인](#6-데이터-수집-파이프라인)
7. [날짜 박제 시스템 ★ NEW](#7-날짜-박제-시스템)
8. [AI 검색 엔진](#8-ai-검색-엔진)
9. [에이전트 워크플로우 ★ NEW](#9-에이전트-워크플로우)
10. [계산기 시스템 (영수증)](#10-계산기-시스템-영수증)
11. [지식 그래프 ★ NEW](#11-지식-그래프)
12. [해외 기술 뉴스](#12-해외-기술-뉴스)
13. [자격증 + 학습 시스템 ★ NEW](#13-자격증--학습-시스템)
14. [협업 기능 ★ NEW](#14-협업-기능)
15. [모바일 현장 모드 ★ NEW](#15-모바일-현장-모드)
16. [개인화 알림 ★ NEW](#16-개인화-알림)
17. [데이터 시각화 ★ NEW](#17-데이터-시각화)
18. [OCR 명판 인식 ★ NEW](#18-ocr-명판-인식)
19. [블록체인 공증 ★ NEW](#19-블록체인-공증)
20. [커뮤니티 / 집단지성 ★ NEW](#20-커뮤니티--집단지성)
21. [AI 도메인 ★ NEW](#21-ai-도메인)
22. [BYOK 구조](#22-byok-구조)
23. [보안 및 감사 로그 ★ NEW](#23-보안-및-감사-로그)
24. [도메인 확장 전략](#24-도메인-확장-전략)
25. [수익 모델 ★ NEW](#25-수익-모델)
26. [개발 로드맵](#26-개발-로드맵)
27. [정확도 목표](#27-정확도-목표)

---

## 1. 프로젝트 개요

### 1.1 한 줄 정의

> **전기 엔지니어링 특화 AI 플랫폼** — 글로벌 논문/규격/뉴스 실시간 수집 + 할루시네이션 없는 출처 기반 답변 + 영수증 계산기 + 날짜 박제 + 협업 + 현장 모바일까지 원스톱 엔지니어링 플랫폼

### 1.2 시장 기회

```
가트너 예측 (2026):
- 전통 검색엔진 볼륨 25% 감소
- AI 버티컬 검색으로 이동 가속

버티컬 LLM 시장:
- 2025년 $2.9B → 2033년 $18.7B (CAGR 26%)

전기 특화 버티컬 검색: 전 세계 공백 상태
→ 지금이 딱 진입 타이밍
```

### 1.3 기존 서비스 대비 포지셔닝

| 구분 | 구글/네이버 | Perplexity | IEEE Xplore | 본 서비스 |
|------|-----------|-----------|------------|---------|
| 전기 특화 | ❌ | ❌ | ⭕ 일부 | ✅ |
| 할루 차단 | ❌ | △ | ❌ | ✅ 구조적 |
| 계산기 영수증 | ❌ | ❌ | ❌ | ✅ 독보적 |
| 날짜 박제 | ❌ | ❌ | △ | ✅ |
| 협업 기능 | ❌ | ❌ | ❌ | ✅ |
| 현장 모바일 | ❌ | ❌ | ❌ | ✅ |
| 에이전트 워크플로우 | ❌ | ❌ | ❌ | ✅ |
| 블록체인 공증 | ❌ | ❌ | ❌ | ✅ |
| 한국어 완전 지원 | ⭕ | △ | ❌ | ✅ |
| BYOK | ❌ | ❌ | ❌ | ✅ |

### 1.4 목표 사용자

```
1차 타겟:
├── 전기 엔지니어 (설계/시공/감리)
├── 전기기사/기술사 수험생
└── 전력 R&D 연구자

2차 타겟:
├── 전기 관련 스타트업
├── 전력공기업 (KEPCO 등)
└── 엔지니어링 컨설팅사

3차 타겟 (확장 후):
├── 기계/토목/화학 엔지니어
└── 해외 엔지니어 (글로벌화)
```

---

## 2. 핵심 철학 및 원칙

### 2.1 할루시네이션 제로 원칙
```
AI = 수집된 문서 기반 요약만
출처 없는 답변 = 시스템 레벨 차단
수치/규격 = 계산 엔진 직접 연산
```

### 2.2 날짜 박제 원칙
```
모든 데이터에 타임스탬프 필수:
- 원문 발행일
- 수집일
- 검증일
- 규격 버전
- 계산 실행 시각
- 엔진 버전

"언제 기준인지 모르면 현장에서 못 쓴다"
```

### 2.3 영수증 투명성 원칙
```
계산 과정 전체 공개
출처 논문/규격 조항까지 명시
AI가 "계산했다" X → 엔진이 직접 돌린 결과
```

### 2.4 도메인 플러그인 원칙
```
전기 → 기계 → 토목 → 화학 → 전체 공학
코어 건드리지 않고 도메인만 추가
```

### 2.5 BYOK 원칙
```
LLM 비용 = 사용자 부담
플랫폼 비용 = 크롤링 + DB + 검색만
API 키는 서버에 저장하지 않음
```

### 2.6 법적 방패 원칙
```
엔지니어의 계산서 = 법적 근거 문서
날짜 박제 + 블록체인 공증 =
"당시 현행 규격 기준으로 작성됨" 타임스탬프 증명
```

---

## 3. 전체 시스템 아키텍처

### 3.1 전체 레이어

```
┌──────────────────────────────────────────────────────────┐
│                      사용자 인터페이스                      │
│   Next.js 14 (Web) + React Native (Mobile)               │
│   검색 / 계산기 / 뉴스 / 자격증 / 협업 / 커뮤니티           │
└─────────────────────────┬────────────────────────────────┘
                          ↓
┌──────────────────────────────────────────────────────────┐
│                  API Gateway (Node.js)                    │
│      인증 / 라우팅 / BYOK 키 처리 / Rate Limit             │
└───┬──────────┬──────────┬──────────┬─────────────────────┘
    ↓          ↓          ↓          ↓
┌───────┐ ┌───────┐ ┌───────┐ ┌──────────┐
│검색   │ │계산기 │ │뉴스   │ │에이전트  │
│엔진   │ │엔진   │ │피드   │ │워크플로우│
│FastAPI│ │FastAPI│ │FastAPI│ │FastAPI   │
└───┬───┘ └───┬───┘ └───┬───┘ └────┬─────┘
    └──────────┴──────────┴─────────┘
                          ↓
┌──────────────────────────────────────────────────────────┐
│                      Data Layer                           │
│  Weaviate (벡터)  │  PostgreSQL (메타/협업/이력)           │
│  Redis (캐시)     │  TimescaleDB (뉴스/시계열)             │
│  Neo4j (지식그래프)│  IPFS (블록체인 공증)                  │
└──────────────────────────────────────────────────────────┘
                          ↑
┌──────────────────────────────────────────────────────────┐
│               데이터 수집 파이프라인                        │
│     Scrapy / Playwright / Airflow                        │
│     논문 / 뉴스 / 규격 / 법령 / 자격증 크롤러               │
└──────────────────────────────────────────────────────────┘
```

### 3.2 도메인 플러그인 구조

```python
DOMAIN_REGISTRY = {
    "electrical": {
        "name": "전기",
        "sources": {
            "tier1": ["IEEE Xplore", "IEC", "KEC", "KEPCO", "전기사업법"],
            "tier2": ["arXiv", "Elsevier", "Springer", "MDPI"],
            "tier3": ["Power Magazine", "IEEE Spectrum", "T&D World", "EE Times"]
        },
        "calculators": [
            "전압강하", "단락전류", "변압기용량", "역률보정",
            "케이블선정", "접지저항", "차단기용량", "태양광발전량",
            "배터리용량", "인버터효율", "조도계산", "UPS용량"
        ],
        "certifications": ["전기기능사", "전기산업기사", "전기기사", "전기기술사"],
        "knowledge_graph_root": "electrical_system",
        "validators": ["voltage_range", "current_range", "power_factor_range"]
    },
    "ai_ml": {  # v2.0 추가
        "name": "AI/ML",
        "sources": {
            "tier1": ["arXiv cs.AI/LG/CV/CL", "NeurIPS", "ICML", "ICLR",
                     "Anthropic Research", "OpenAI Research", "Google DeepMind"],
            "tier2": ["Hugging Face Papers", "Papers With Code", "Semantic Scholar"],
            "tier3": ["The Batch", "Import AI", "VentureBeat AI"]
        },
        "calculators": ["토큰비용", "GPU메모리", "학습비용", "추론속도", "RAG최적화"],
        "tool_tracker": True,
        "benchmark_tracker": True
    },
    "mechanical": { ... },  # Phase 2
    "civil": { ... },       # Phase 3
    "chemical": { ... }     # Phase 3
}
```

---

## 4. 기술 스택

### 4.1 Frontend

| 기술 | 용도 |
|------|------|
| Next.js 14 (App Router) | 웹 메인 프레임워크 |
| React Native | 모바일 앱 (현장 모드) |
| TypeScript | 언어 |
| Tailwind CSS | 스타일링 |
| shadcn/ui | UI 컴포넌트 |
| Zustand | 상태관리 |
| React Query | 서버 상태/캐싱 |
| D3.js / Recharts | 데이터 시각화 |
| Cytoscape.js | 지식 그래프 시각화 |

### 4.2 Backend

| 기술 | 용도 |
|------|------|
| FastAPI (Python) | 검색/계산/AI API |
| Node.js (Express) | API Gateway |
| WebSocket | 실시간 뉴스/알림 |
| Celery | 비동기 태스크 |
| Redis | 캐시/세션/큐 |

### 4.3 AI / ML

| 기술 | 용도 |
|------|------|
| LangChain | RAG 오케스트레이션 |
| LlamaIndex | 문서 인덱싱/청킹 |
| BYOK (OpenAI/Claude/Gemini) | LLM 답변 생성 |
| PaddleOCR / Tesseract | 명판/도면 OCR |
| spaCy | NLP 전처리 |

### 4.4 데이터베이스

| DB | 용도 |
|----|------|
| Weaviate | 벡터 검색 (하이브리드) |
| PostgreSQL | 메인 RDB |
| TimescaleDB | 뉴스/시계열 |
| Redis | 캐시/세션 |
| Neo4j | 지식 그래프 |
| IPFS | 블록체인 공증 저장 |

### 4.5 데이터 수집

| 기술 | 용도 |
|------|------|
| Scrapy | 대량 크롤링 |
| Playwright | JS 렌더링 페이지 |
| Apache Airflow | 스케줄러/DAG |
| BeautifulSoup | HTML 파싱 |

### 4.6 계산 엔진

| 기술 | 용도 |
|------|------|
| NumPy / SciPy | 수치 연산 |
| SymPy | 기호 수학 |
| Pint | 단위 변환 |

### 4.7 블록체인 / 보안

| 기술 | 용도 |
|------|------|
| IPFS | 공증 문서 분산 저장 |
| SHA-256 | 영수증 해시 |
| AES-256 | API 키 암호화 |
| JWT | 인증 토큰 |

### 4.8 배포/인프라

| 기술 | 용도 |
|------|------|
| AWS / GCP | 클라우드 |
| Docker + Kubernetes | 컨테이너 |
| Cloudflare | CDN / DDoS |
| GitHub Actions | CI/CD |

---

## 5. 데이터베이스 스키마

### 5.1 문서 DB (날짜 박제 완전 적용)

```sql
CREATE TABLE documents (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    domain                VARCHAR(50) NOT NULL,
    doc_type              VARCHAR(50) NOT NULL,
    title                 TEXT NOT NULL,
    title_ko              TEXT,
    source                VARCHAR(100) NOT NULL,
    tier                  SMALLINT NOT NULL CHECK (tier IN (1,2,3)),
    url                   TEXT,
    doi                   VARCHAR(200),

    -- ★ 날짜 박제 핵심 필드
    published_at          TIMESTAMP,        -- 원문 발행일
    collected_at          TIMESTAMP,        -- 수집일
    verified_at           TIMESTAMP,        -- 마지막 검증일
    standard_version      VARCHAR(100),     -- "KEC 2024년판"
    is_latest_version     BOOLEAN DEFAULT true,
    superseded_by         UUID,             -- 개정 시 새 문서 ID
    next_revision_expected DATE,            -- 차기 개정 예상일
    revision_notes        TEXT,             -- 개정 주요 내용

    language              VARCHAR(10),
    raw_text              TEXT,
    summary_ko            TEXT,
    quality_score         FLOAT,
    created_at            TIMESTAMP DEFAULT NOW(),
    updated_at            TIMESTAMP DEFAULT NOW()
);

-- 규격 개정 이력 테이블 (날짜 박제)
CREATE TABLE standard_revisions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    standard_name   VARCHAR(200),        -- "IEC 60364"
    version         VARCHAR(100),        -- "Ed.5.1"
    effective_date  DATE,                -- 발효일
    supersedes_id   UUID,                -- 이전 버전 문서 ID
    changes_summary TEXT,                -- 주요 변경사항
    affected_calculators UUID[],         -- 영향받는 계산기 ID
    detected_at     TIMESTAMP,           -- 감지 시각
    verified_by     VARCHAR(100)         -- 검증자
);

-- 문서 청크
CREATE TABLE document_chunks (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doc_id          UUID REFERENCES documents(id) ON DELETE CASCADE,
    chunk_index     INT NOT NULL,
    content         TEXT NOT NULL,
    content_ko      TEXT,
    page_number     INT,
    section         VARCHAR(200),
    weaviate_id     VARCHAR(200),
    metadata        JSONB,
    -- 청크 단위 날짜도 박제
    source_published_at TIMESTAMP,
    chunk_verified_at   TIMESTAMP
);
```

### 5.2 계산기 DB (날짜 박제 + 영수증)

```sql
CREATE TABLE calculators (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    domain          VARCHAR(50) NOT NULL,
    category        VARCHAR(100) NOT NULL,
    name            VARCHAR(200) NOT NULL,
    description     TEXT,
    formula_display TEXT,              -- LaTeX 수식
    formula_code    TEXT,              -- Python 실제 코드
    standards       VARCHAR(100)[],   -- ["KEC 232.52", "IEC 60364-5-52"]
    standard_version VARCHAR(100),    -- "KEC 2024년판"
    standard_verified_at TIMESTAMP,   -- 규격 최신 확인 시각
    params_schema   JSONB NOT NULL,
    output_schema   JSONB NOT NULL,
    engine_version  VARCHAR(20),      -- "CalcEngine v2.3.1"
    is_active       BOOLEAN DEFAULT true,
    last_updated_at TIMESTAMP DEFAULT NOW(),
    -- 규격 개정 시 경고
    has_pending_update BOOLEAN DEFAULT false,
    pending_update_notes TEXT
);

-- ★ 계산 영수증 (핵심 + 날짜 완전 박제)
CREATE TABLE calculation_receipts (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    calc_id               UUID REFERENCES calculators(id),
    user_session          VARCHAR(200),
    user_id               UUID REFERENCES users(id),
    project_id            UUID REFERENCES projects(id),

    -- 입출력
    inputs                JSONB NOT NULL,
    result                JSONB NOT NULL,

    -- 영수증 핵심
    steps                 JSONB NOT NULL,    -- 단계별 계산 과정
    formula_used          TEXT NOT NULL,
    standards_used        VARCHAR(100)[],
    warnings              TEXT[],
    recommendations       TEXT[],

    -- ★ 날짜 박제 (법적 증빙용)
    calculated_at         TIMESTAMP DEFAULT NOW(),  -- 계산 실행 시각
    standard_version      VARCHAR(100),             -- "KEC 2024년판"
    standard_verified_at  TIMESTAMP,                -- 규격 현행 확인 시각
    engine_version        VARCHAR(20),              -- "CalcEngine v2.3.1"
    is_standard_current   BOOLEAN DEFAULT true,     -- 계산 시점 현행 여부

    -- 블록체인 공증
    receipt_hash          VARCHAR(64),              -- SHA-256 해시
    ipfs_cid              VARCHAR(100),             -- IPFS 저장 CID
    blockchain_tx         VARCHAR(200),             -- 트랜잭션 ID

    -- 협업
    shared_with           UUID[],                   -- 공유된 사용자 ID
    share_token           VARCHAR(100) UNIQUE,      -- 공유 링크 토큰
    is_public             BOOLEAN DEFAULT false
);

-- steps JSONB 구조:
-- [
--   {
--     "step": 1,
--     "title": "√3 계산",
--     "formula": "√3",
--     "value": 1.7320,
--     "unit": "",
--     "standard_ref": null
--   },
--   {
--     "step": 2,
--     "title": "선간전압 × √3",
--     "formula": "22900 × 1.7320",
--     "value": 39662.8,
--     "unit": "V",
--     "standard_ref": "KEC 210.3"
--   }
-- ]
```

### 5.3 협업 DB

```sql
-- 프로젝트
CREATE TABLE projects (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id        UUID REFERENCES users(id),
    name            VARCHAR(200) NOT NULL,
    domain          VARCHAR(50),
    description     TEXT,
    is_archived     BOOLEAN DEFAULT false,
    created_at      TIMESTAMP DEFAULT NOW()
);

-- 프로젝트 멤버
CREATE TABLE project_members (
    project_id      UUID REFERENCES projects(id),
    user_id         UUID REFERENCES users(id),
    role            VARCHAR(20),  -- owner, editor, viewer
    joined_at       TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (project_id, user_id)
);

-- 계산서 코멘트
CREATE TABLE receipt_comments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    receipt_id      UUID REFERENCES calculation_receipts(id),
    user_id         UUID REFERENCES users(id),
    content         TEXT NOT NULL,
    step_ref        INT,          -- 몇 번째 step에 대한 코멘트
    parent_id       UUID,         -- 답글
    created_at      TIMESTAMP DEFAULT NOW()
);

-- 계산서 버전 이력
CREATE TABLE receipt_versions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    original_id     UUID REFERENCES calculation_receipts(id),
    version_number  INT NOT NULL,
    changed_by      UUID REFERENCES users(id),
    change_note     TEXT,
    snapshot        JSONB,        -- 해당 시점 전체 영수증 스냅샷
    created_at      TIMESTAMP DEFAULT NOW()
);
```

### 5.4 뉴스 DB

```sql
CREATE TABLE news_articles (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source          VARCHAR(100) NOT NULL,
    tier            SMALLINT NOT NULL,
    title           TEXT NOT NULL,
    title_ko        TEXT,
    url             TEXT UNIQUE NOT NULL,
    original_lang   VARCHAR(10) DEFAULT 'en',
    content_original TEXT,
    content_ko      TEXT,
    summary_ko      TEXT,          -- 3줄 요약
    categories      VARCHAR(100)[],
    keywords        VARCHAR(100)[],
    relevance_score FLOAT,

    -- 날짜 박제
    published_at    TIMESTAMP,     -- 원문 발행일
    crawled_at      TIMESTAMP DEFAULT NOW(),  -- 수집일
    translated_at   TIMESTAMP,     -- 번역 시각
    summary_generated_at TIMESTAMP -- 요약 생성 시각
) PARTITION BY RANGE (published_at);

CREATE TABLE news_trends (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    period          DATE NOT NULL,
    keyword         VARCHAR(100) NOT NULL,
    domain          VARCHAR(50) NOT NULL,
    count           INT DEFAULT 0,
    sentiment       FLOAT,
    UNIQUE(period, keyword, domain)
);
```

### 5.5 자격증 DB

```sql
CREATE TABLE certifications (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    domain          VARCHAR(50) NOT NULL,
    name            VARCHAR(100) NOT NULL,
    level           SMALLINT NOT NULL,
    issuer          VARCHAR(100),
    description     TEXT,
    requirements    JSONB,
    exam_subjects   JSONB,
    related_laws    TEXT[],
    is_active       BOOLEAN DEFAULT true,
    last_updated_at TIMESTAMP DEFAULT NOW()  -- 날짜 박제
);

CREATE TABLE exam_schedules (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cert_id               UUID REFERENCES certifications(id),
    year                  SMALLINT NOT NULL,
    round                 SMALLINT NOT NULL,
    apply_start           DATE,
    apply_end             DATE,
    written_date          DATE,
    written_result        DATE,
    practical_apply_start DATE,
    practical_apply_end   DATE,
    practical_date        DATE,
    final_result          DATE,
    is_confirmed          BOOLEAN DEFAULT false,
    source_url            TEXT,
    collected_at          TIMESTAMP DEFAULT NOW(),  -- 날짜 박제
    UNIQUE(cert_id, year, round)
);

CREATE TABLE exam_statistics (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cert_id     UUID REFERENCES certifications(id),
    year        SMALLINT NOT NULL,
    round       SMALLINT NOT NULL,
    exam_type   VARCHAR(20) NOT NULL,
    applicants  INT,
    takers      INT,
    passed      INT,
    pass_rate   FLOAT GENERATED ALWAYS AS (
                    CASE WHEN takers > 0
                    THEN ROUND((passed::numeric / takers * 100), 2)
                    ELSE 0 END
                ) STORED,
    UNIQUE(cert_id, year, round, exam_type)
);

-- AI 기출문제
CREATE TABLE exam_questions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cert_id         UUID REFERENCES certifications(id),
    year            SMALLINT,
    round           SMALLINT,
    subject         VARCHAR(100),
    question        TEXT NOT NULL,
    options         JSONB,          -- 보기 배열
    answer          INT,            -- 정답 번호
    explanation     TEXT,           -- AI 해설
    related_standard VARCHAR(200),  -- 관련 규격/조항
    related_doc_id  UUID REFERENCES documents(id),
    difficulty      SMALLINT,       -- 1~5
    source_verified_at TIMESTAMP    -- 날짜 박제
);
```

### 5.6 사용자 / BYOK DB

```sql
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           VARCHAR(255) UNIQUE,
    nickname        VARCHAR(100),
    domain_pref     VARCHAR(50)[],
    notification_pref JSONB,        -- 알림 설정
    created_at      TIMESTAMP DEFAULT NOW(),
    last_login_at   TIMESTAMP
);

CREATE TABLE user_api_keys (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID REFERENCES users(id) ON DELETE CASCADE,
    provider        VARCHAR(50) NOT NULL,
    key_encrypted   TEXT NOT NULL,
    key_hint        VARCHAR(10),
    is_active       BOOLEAN DEFAULT true,
    last_used_at    TIMESTAMP,
    created_at      TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, provider)
);

-- 사용자 알림 구독
CREATE TABLE user_subscriptions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID REFERENCES users(id),
    sub_type        VARCHAR(50),  -- standard_update, cert_schedule, keyword_news
    target          VARCHAR(200), -- "IEC 61850", "전기기사", "스마트그리드"
    channel         VARCHAR(20),  -- email, push, both
    is_active       BOOLEAN DEFAULT true,
    created_at      TIMESTAMP DEFAULT NOW()
);

-- 감사 로그
CREATE TABLE audit_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID REFERENCES users(id),
    action          VARCHAR(100),  -- search, calculate, export
    resource_type   VARCHAR(50),
    resource_id     UUID,
    metadata        JSONB,
    ip_address      INET,
    created_at      TIMESTAMP DEFAULT NOW()
) PARTITION BY RANGE (created_at);
```

### 5.7 AI 도구 비교 DB

```sql
CREATE TABLE ai_tools (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(100) NOT NULL,
    provider        VARCHAR(100) NOT NULL,
    category        VARCHAR(50) NOT NULL,
    description_ko  TEXT,
    pricing         JSONB,
    benchmarks      JSONB,
    features        JSONB,
    release_date    DATE,
    -- 날짜 박제
    last_updated    DATE,
    pricing_verified_at TIMESTAMP,
    benchmark_verified_at TIMESTAMP,
    official_url    TEXT,
    is_active       BOOLEAN DEFAULT true
);

CREATE TABLE ai_benchmarks (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tool_id         UUID REFERENCES ai_tools(id),
    benchmark_name  VARCHAR(100),
    score           FLOAT,
    rank_at_time    INT,
    measured_at     DATE,          -- 날짜 박제
    source_url      TEXT
);

CREATE TABLE ai_pricing_history (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tool_id         UUID REFERENCES ai_tools(id),
    pricing         JSONB,
    effective_from  DATE,          -- 날짜 박제
    source_url      TEXT
);
```

---

## 6. 데이터 수집 파이프라인

### 6.1 소스 계층

```
Tier 1 — 최고 신뢰
├── IEEE Xplore          (주 1회)
├── IEC 공식 문서         (월 1회)
├── KEC/전기사업법        (월 1회)
├── DOE / EPRI           (주 1회)
└── arXiv cs.AI/LG       (일 1회)

Tier 2 — 신뢰
├── Elsevier / Springer  (주 1회)
├── MDPI                 (주 1회)
├── Hugging Face Papers  (일 1회)
└── Papers With Code     (일 1회)

Tier 3 — 참고
├── IEEE Spectrum        (6시간)
├── Power Magazine       (6시간)
├── T&D World            (6시간)
├── EE Times             (6시간)
└── BloombergNEF         (12시간)
```

### 6.2 Airflow DAG

```python
# DAG 1: 논문 크롤링 (주 1회)
paper_crawl_dag:
    crawl_ieee → crawl_arxiv → crawl_elsevier
    → domain_filter → dedup_by_doi
    → quality_score → embed_and_index
    → timestamp_all_fields  # 날짜 박제

# DAG 2: 뉴스 크롤링 (6시간)
news_crawl_dag:
    crawl_news_sources → relevance_filter(threshold=0.7)
    → translate_ko → summarize_3lines
    → trend_analysis → store_timescale
    → timestamp_all_fields  # 날짜 박제

# DAG 3: 규격 개정 감시 (월 1회)
standard_watch_dag:
    crawl_iec → crawl_kec → crawl_ieee_std
    → diff_detection          # 개정 감지
    → mark_affected_calcs     # 영향 계산기 표시
    → send_user_alerts        # 구독자 알림
    → update_revision_history # 개정 이력 저장
    → timestamp_revision      # 날짜 박제

# DAG 4: 자격증 일정 (주 1회)
cert_schedule_dag:
    crawl_q-net → parse_schedules
    → update_exam_schedules
    → send_dday_alerts
    → timestamp_collected_at  # 날짜 박제
```

---

## 7. 날짜 박제 시스템

> ★ v3.0 핵심 추가 기능

### 7.1 박제 대상 전체

```
문서/논문
├── 원문 발행일          published_at
├── 수집일              collected_at
├── 마지막 검증일        verified_at
├── 규격 버전           standard_version
└── 개정 여부           is_latest_version

계산 영수증
├── 계산 실행 시각       calculated_at
├── 적용 규격 버전       standard_version
├── 규격 현행 확인 시각  standard_verified_at
└── 엔진 버전           engine_version

뉴스
├── 원문 발행일          published_at
├── 수집일              crawled_at
├── 번역 시각           translated_at
└── 요약 생성 시각       summary_generated_at

자격증
├── 시험 일정 수집일     collected_at
└── 정보 최종 확인일     last_updated_at

AI 도구
├── 출시일              release_date
├── 가격 검증 시각       pricing_verified_at
└── 벤치마크 측정일      measured_at
```

### 7.2 영수증 날짜 박제 UI

```
┌──────────────────────────────────────────┐
│            🧾 계산 영수증                  │
│         변압기 용량 계산기                  │
├──────────────────────────────────────────┤
│ 📅 계산 일시   2026.04.04  14:32:11      │
│ 📋 적용 규격   KEC 2024년판               │
│ ✅ 규격 확인   2026.04.01 (현행 확인됨)   │
│ ⚙️ 엔진 버전   CalcEngine v2.3.1         │
│ 🔐 무결성 해시  a3f2c1...8d4e (SHA-256)  │
├──────────────────────────────────────────┤
│ [계산 과정 영수증]                         │
│  ...                                     │
├──────────────────────────────────────────┤
│ ⚠️ 규격은 변경될 수 있습니다               │
│    재사용 전 현행 여부 확인 권장            │
├──────────────────────────────────────────┤
│ 📋 PDF  🔗 공유  ✏️ 재계산  🔐 공증  💾 저장│
└──────────────────────────────────────────┘
```

### 7.3 규격 개정 알림 시스템

```
월 1회 규격 크롤링
        ↓
개정 감지
        ↓
┌────────────────────────────┐
│  ⚠️ 규격 개정 알림          │
│                            │
│  KEC 232.52 개정됨         │
│  기존: 2022년판             │
│  신규: 2024년판             │
│  주요 변경: 전압강하 계산식  │
│             허용치 변경     │
│                            │
│  영향 계산기: 3개            │
│  ├── 전압강하 계산기 ⚠️     │
│  ├── 케이블선정 계산기 ⚠️   │
│  └── 전력손실 계산기 ⚠️     │
└────────────────────────────┘
        ↓
계산기에 경고 배지 부착
        ↓
구독자 알림 발송
        ↓
관리자 검토 → 수식 업데이트
        ↓
기존 영수증에 소급 알림:
"이 계산서 작성 후 KEC 232.52가
 개정됐습니다. 재검토 권장."
```

---

## 8. AI 검색 엔진

### 8.1 검색 파이프라인

```
자연어 질문 입력
        ↓
① 질문 분석 (BYOK LLM)
   도메인 분류 / 검색 의도 / 키워드 추출 / 한영 쿼리
        ↓
② 하이브리드 검색 (Weaviate)
   벡터 검색 + BM25 + Tier 가중치 + 도메인 필터
        ↓
③ 지식 그래프 연계
   연관 개념 탐색 / 학습 경로 제안
        ↓
④ 재랭킹
   Cross-encoder + 최신성 + Tier 점수
        ↓
⑤ RAG 답변 (BYOK LLM)
   "문서 기반으로만 답변" 강제
        ↓
⑥ 할루시네이션 검증
   원문 일치도 / 수치 범위 / 출처 없는 주장 감지
        ↓
⑦ 날짜 메타데이터 부착
   모든 출처에 수집일/발행일/검증일 표시
        ↓
⑧ 최종 출력
   답변 + 출처(Tier+날짜) + 관련 계산기 + 관련 규격
```

### 8.2 검색 결과 카드

```
┌──────────────────────────────────────────┐
│ 📄 변압기 병렬운전 조건                    │
│                                          │
│ 출처:  IEEE Transactions PE 2024.09      │
│ 수집:  2024.10.02                        │
│ 검증:  2026.03.15  ✅ 현행 확인           │
│ Tier:  ★★★ (최고 신뢰)                  │
│                                          │
│ "변압기 병렬운전을 위해서는 전압비,        │
│  임피던스 전압, 극성이 동일해야..."        │
│                                          │
│ [원문 보기]  [관련 계산기]  [관련 규격]    │
└──────────────────────────────────────────┘
```

---

## 9. 에이전트 워크플로우

> ★ v3.0 핵심 추가 기능

### 9.1 개념

```
기존 검색:  질문 → 답변 (끝)
에이전트:   질문 → 답변 → 다음 액션 → 다음 액션 → 결과물

목표: 엔지니어의 업무 흐름을 플랫폼 안에서 완결
```

### 9.2 워크플로우 예시

#### 시나리오: 수변전설비 설계

```
입력: "22.9kV 수변전설비 설계해줘"
      (부하: 500kW, 역률 0.9, 케이블 200m)
        ↓
Agent Step 1: 변압기 용량 계산
  → 영수증 #001 생성 (날짜 박제)
  → 결과: 667kVA → 표준 750kVA 선정
        ↓
Agent Step 2: 관련 KEC 조항 자동 확인
  → KEC 210.3, 230조 검색
  → "이 규격 2024년판 현행 ✅" 확인
        ↓
Agent Step 3: 케이블 선정 계산
  → 영수증 #002 생성
  → 결과: 240mm² CV 케이블 선정
        ↓
Agent Step 4: 전압강하 검증
  → 영수증 #003 생성
  → 결과: 2.3% (허용 3% 이내 ✅)
        ↓
Agent Step 5: 차단기 용량 계산
  → 영수증 #004 생성
        ↓
Agent Step 6: 설계 체크리스트 생성
  ✅ 변압기 용량 (KEC 210.3 적합)
  ✅ 케이블 선정 (KEC 232 적합)
  ✅ 전압강하 (3% 이내)
  ✅ 차단기 협조
  ⚠️ 접지 저항 계산 필요
        ↓
Agent Step 7: 설계 보고서 초안 생성
  → 모든 영수증 통합
  → PDF 다운로드
```

### 9.3 에이전트 구조

```python
class EngineeringAgent:
    def __init__(self, domain: str, byok_key: str):
        self.domain = domain
        self.llm = LLMAdapterFactory.create(byok_key)
        self.calculator = CalculatorEngine()
        self.searcher = RAGSearcher()
        self.receipts = []

    def run(self, task: str) -> WorkflowResult:
        # 1. 태스크 분석
        steps = self.llm.plan_steps(task)

        # 2. 단계별 실행
        for step in steps:
            if step.type == "calculate":
                receipt = self.calculator.run(step.params)
                receipt.timestamp_all()  # 날짜 박제
                self.receipts.append(receipt)

            elif step.type == "search":
                result = self.searcher.query(step.query)
                result.attach_timestamps()  # 날짜 박제

            elif step.type == "verify_standard":
                self.verify_standard_currency(step.standard)

        # 3. 결과 통합
        return WorkflowResult(
            receipts=self.receipts,
            checklist=self.generate_checklist(),
            report_draft=self.generate_report()
        )
```

---

## 10. 계산기 시스템 (영수증)

### 10.1 전체 계산기 목록

#### 전력 계산
| 계산기 | 규격 |
|--------|------|
| 단상/3상 전력 계산기 | KEC 210 |
| 역률 보정 계산기 | KEC 220 |
| 전압강하 계산기 | KEC 232.52 / IEC 60364 |
| 전력손실 계산기 | IEC 60364 |
| 수용률/부등률 계산기 | KEC 210.3 |

#### 보호 협조
| 계산기 | 규격 |
|--------|------|
| 차단기 용량 계산기 | IEC 60947 |
| 단락전류 계산기 | IEC 60909 |
| 케이블 굵기 선정 | KEC 232 |
| 접지저항 계산기 | KEC 140 |
| 보호계전기 정정 | IEEE C37 |

#### 변압기
| 계산기 | 규격 |
|--------|------|
| 변압기 용량 계산기 | KEC 210.3 / IEC 60076 |
| 임피던스 전압 계산기 | IEC 60076-1 |
| 변압기 손실 계산기 | IEC 60076-1 |
| 병렬운전 조건 계산기 | KEC |

#### 신재생/ESS
| 계산기 | 규격 |
|--------|------|
| 태양광 발전량 계산기 | IEC 61724 |
| 배터리 용량 계산기 | IEC 62619 |
| 인버터 효율 계산기 | IEC 61683 |
| 계통연계 계산기 | KEC 500 |

#### AI 특화 계산기
| 계산기 | 용도 |
|--------|------|
| 토큰 비용 계산기 | API 비용 예측 |
| GPU 메모리 계산기 | 모델 실행 가능 여부 |
| 학습 비용 계산기 | 파인튜닝 비용 |
| 추론 속도 계산기 | 처리량 예측 |
| RAG 청크 최적화 | 최적 청크 크기 |

### 10.2 영수증 구조 (최종)

```
┌──────────────────────────────────────────────┐
│              🧾 계산 영수증                    │
│           변압기 용량 계산기                    │
├──────────────────────────────────────────────┤
│ ── 메타 정보 (날짜 박제) ──────────────────── │
│ 📅 계산 일시     2026.04.04  14:32:11        │
│ 📋 적용 규격     KEC 2024년판                │
│ ✅ 규격 현행     2026.04.01 확인             │
│ ⚙️ 엔진 버전     CalcEngine v2.3.1           │
│ 🔐 무결성 해시   a3f2c1...8d4e              │
├──────────────────────────────────────────────┤
│ ── 적용 공식 ──────────────────────────────── │
│  P = √3 × V × I × cosθ                     │
│  근거: KEC 210.3 / IEC 60076-1             │
├──────────────────────────────────────────────┤
│ ── 입력값 ─────────────────────────────────── │
│  결선 방식   3상                             │
│  선간전압 V  22,900 V                       │
│  전류 I      100 A                          │
│  역률 cosθ   0.95                           │
├──────────────────────────────────────────────┤
│ ── 계산 과정 ──────────────────────────────── │
│  Step 1: √3 = 1.7320                       │
│  Step 2: 22,900 × 1.7320 = 39,663 V       │
│  Step 3: 39,663 × 100 = 3,966,280          │
│  Step 4: 3,966,280 × 0.95 = 3,767,966     │
│  Step 5: ÷ 1,000 = 3,767.97 kVA           │
├──────────────────────────────────────────────┤
│ ── 결과 ───────────────────────────────────── │
│  ✅ 계산값: 3,767.97 kVA                   │
│  📌 권장 선정: 4,000 kVA (표준 용량)        │
│  ⚠️ 수용률/부등률 적용 검토 필요             │
│  ⚠️ 장래 부하 증설 여유분 고려              │
├──────────────────────────────────────────────┤
│ 📋PDF  🔗공유  ✏️재계산  🔐공증  💾저장  💬코멘트│
└──────────────────────────────────────────────┘
```

---

## 11. 지식 그래프

> ★ v3.0 추가 기능

### 11.1 개념

```
키워드 검색의 한계:
"변압기" 검색 → 변압기 문서만

지식 그래프:
"변압기" 검색 →
     변압기
    /  |  \
임피던스 용량 병렬운전
   |         |
단락전류   조건식
   |
차단기 용량
   |
보호 협조

→ 연관 개념 자동 탐색
→ "이것도 알아야 해" 학습 경로 제안
```

### 11.2 Neo4j 그래프 스키마

```cypher
// 노드 타입
(:Concept {name, domain, description_ko})
(:Standard {name, version, issued_at})
(:Calculator {id, name, domain})
(:Document {id, title, published_at})

// 관계 타입
(:Concept)-[:RELATED_TO]->(:Concept)
(:Concept)-[:GOVERNED_BY]->(:Standard)
(:Concept)-[:CALCULATED_BY]->(:Calculator)
(:Concept)-[:REFERENCED_IN]->(:Document)
(:Standard)-[:SUPERSEDES]->(:Standard)

// 예시 데이터
CREATE (transformer:Concept {name:"변압기", domain:"electrical"})
CREATE (impedance:Concept {name:"임피던스전압"})
CREATE (short_circuit:Concept {name:"단락전류"})
CREATE (breaker:Concept {name:"차단기"})

CREATE (transformer)-[:RELATED_TO {weight:0.9}]->(impedance)
CREATE (impedance)-[:RELATED_TO {weight:0.85}]->(short_circuit)
CREATE (short_circuit)-[:RELATED_TO {weight:0.9}]->(breaker)
```

### 11.3 UI 시각화

```
[변압기] 검색 시 우측에 그래프 패널:

     [변압기]
    /    |    \
[임피] [용량] [병렬운전]
  |              |
[단락]        [조건식]
  |
[차단기]

클릭하면 해당 개념으로 검색 이동
"이 개념들 순서대로 학습하기" 버튼
```

---

## 12. 해외 기술 뉴스

### 12.1 소스 계층

```
전기 분야 Tier 1:
IEEE Spectrum / Power Magazine / T&D World
EE Times / Renewable Energy World / EPRI

전기 분야 Tier 2:
BloombergNEF / S&P Global / Electrek / NREL

AI 분야 Tier 1:
arXiv daily / Anthropic Blog / OpenAI Blog
Google DeepMind / Hugging Face Blog

AI 분야 Tier 2:
The Batch / Import AI / VentureBeat AI
```

### 12.2 카테고리

```
전기:
├── 스마트그리드 / 디지털 변전소
├── HVDC / FACTS
├── 신재생 (태양광/풍력/수소)
├── ESS / 배터리
├── 전력 반도체 (SiC/GaN)
├── EV / 충전 인프라
└── 전력 정책 / 규제

AI:
├── 모델 출시 / 업데이트
├── 벤치마크 기록 갱신
├── 전기×AI 교차 적용
├── AI 인프라 / 전력 이슈
└── 가격 변동
```

### 12.3 AI 일일 브리핑

```
매일 06:00 자동 생성
        ↓
카테고리별 TOP 3 선정
        ↓
AI 한국어 3줄 요약
        ↓
원문 발행일 + 번역 시각 표시 (날짜 박제)
        ↓
관련 논문/규격/계산기 자동 연결
        ↓
"오늘의 전기+AI 핵심 브리핑" 메인 노출
```

---

## 13. 자격증 + 학습 시스템

> ★ v3.0 학습 기능 대폭 강화

### 13.1 자격증 로드맵

```
전기기능사 (Level 1)
    ↓
전기산업기사 (Level 2)
    ↓
전기기사 (Level 3) ← 실무 필수
    ↓
전기기술사 (Level 4) ← 최고 권위

관련: 소방설비기사(전기) / 에너지관리기사 / 신재생에너지발전설비기사
```

### 13.2 AI 기출문제 시스템

```
10년치 기출문제 DB
        ↓
AI 해설 자동 생성
        ↓
틀린 문제 → 관련 규격 자동 링크
        ↓
오답 노트 자동화
        ↓
약점 개념 → 플랫폼 내 논문/규격 연결
        ↓
합격 예측 모델
"현재 패턴 기준 합격 확률 73%"
        ↓
맞춤 학습 경로 제안
"이 3개 단원 집중 공략 필요"
```

### 13.3 시험 D-DAY 알림

```
전기기사 필기 접수 D-14  → 푸시 알림
전기기사 필기 접수 D-7   → 푸시 + 이메일
전기기사 필기 시험 D-3   → 강조 알림
전기기사 합격자 발표일    → 축하 알림
```

---

## 14. 협업 기능

> ★ v3.0 추가 기능

### 14.1 프로젝트 단위 관리

```
프로젝트: "○○변전소 설계"
├── 계산서 묶음
│   ├── 영수증 #001 변압기 용량 v1
│   ├── 영수증 #001 변압기 용량 v2 (수정본)
│   └── 영수증 #002 케이블 선정
├── 검색 이력
├── 참고 규격
└── 팀 코멘트
```

### 14.2 계산서 협업 워크플로우

```
설계자: 계산서 작성 → 팀장에게 공유
        ↓
팀장:   특정 Step에 코멘트
        "역률을 0.9로 변경해봐"
        ↓
설계자: 수치 수정 → 재계산 → v2 생성
        v1과 v2 변경 이력 자동 저장
        ↓
팀장:   최종 승인 → 감리관에게 제출
```

### 14.3 공유 링크

```
계산서 고유 공유 URL:
https://platform.com/receipt/share/abc123

접속하면:
- 계산 과정 전체 열람
- 날짜 박제 정보 확인
- 블록체인 공증 검증
- (권한 없으면) 수정 불가
```

---

## 15. 모바일 현장 모드

> ★ v3.0 추가 기능

### 15.1 오프라인 캐시

```
앱 설치 시 다운로드:
├── 자주 쓰는 계산기 10종
├── KEC 주요 조항 요약
├── 최근 검색 이력
└── 저장한 영수증

→ 지하 현장, 통신 불량 지역도 사용 가능
→ 온라인 복귀 시 자동 동기화
```

### 15.2 현장 특화 UX

```
├── 장갑 끼고도 쓸 수 있는 큰 버튼
├── 밝은 햇빛 아래 고대비 모드
├── 한 손 조작 최적화
├── 음성 입력 지원
│   "변압기 용량 계산, 전압 22.9kV, 전류 100A"
└── 빠른 계산기 즐겨찾기
```

### 15.3 OCR 명판 인식 연동

```
현장 변압기 명판 촬영
        ↓
OCR 자동 인식
(용량, 전압, 전류, 임피던스)
        ↓
관련 계산기 자동 실행
        ↓
영수증 생성
```

---

## 16. 개인화 알림

> ★ v3.0 추가 기능

### 16.1 알림 타입

```
규격 개정 알림 (구독형)
  "IEC 61850 개정됨 → 즉시 알림"

키워드 뉴스 알림
  "스마트그리드, SiC" 키워드 뉴스 → 일 1회

자격증 D-DAY 알림
  "전기기사 필기 접수 D-7"

AI 모델 출시 알림
  "새 모델 출시: XXX"

가격 변동 알림
  "GPT-4o 가격 인하"

주간 브리핑
  "이번 주 내 분야 핵심 5가지"
```

### 16.2 알림 채널

```
├── 이메일
├── 앱 푸시 (모바일)
├── 브라우저 알림 (웹)
└── Slack/Teams 연동 (기업용)
```

---

## 17. 데이터 시각화

> ★ v3.0 추가 기능

### 17.1 시각화 타입

```
계산 결과 시각화:
├── 전압강하 거리별 변화 라인 차트
├── 부하 분포 파이 차트
└── 케이블 용량 비교 바 차트

논문/뉴스 트렌드:
├── SiC 논문 연도별 증가 추이
├── 키워드 버블 차트
└── 분야별 논문 수 히트맵

규격 비교:
├── KEC vs IEC vs NEC 비교 테이블
└── 규격 개정 타임라인

AI 도구 비교:
├── 벤치마크 레이더 차트
├── 가격 추이 라인 차트
└── 기능 비교 매트릭스
```

---

## 18. OCR 명판 인식

> ★ v3.0 추가 기능

### 18.1 인식 대상

```
├── 변압기 명판 (용량/전압/전류/임피던스/제조일)
├── 차단기 명판 (정격전류/정격전압/차단용량)
├── 케이블 레이블 (규격/단면적/제조사)
├── 전기 도면 상 수치
└── 규격서 페이지 스캔
```

### 18.2 처리 흐름

```
카메라 촬영 / 이미지 업로드
        ↓
PaddleOCR 텍스트 추출
        ↓
전기 도메인 파라미터 파싱
(전압, 전류, 용량, 임피던스...)
        ↓
파라미터 → 계산기 자동 매핑
        ↓
"이 데이터로 변압기 용량 계산할까요?" 제안
        ↓
사용자 확인 → 계산 실행 → 영수증 생성
```

---

## 19. 블록체인 공증

> ★ v3.0 추가 기능

### 19.1 개념

```
전기 설계 계산서 = 법적 근거 문서
법적 보존 기간: 준공 후 10년 이상

문제: "이 계산서가 당시 현행 규격 기준이었나?"
      "위변조 됐나?"

해결: 블록체인 타임스탬프 공증
      → 위변조 불가
      → "2026.04.04 14:32에
         KEC 2024년판 기준으로 작성됨" 영구 증명
```

### 19.2 공증 프로세스

```
계산 영수증 완성
        ↓
SHA-256 해시 생성
(영수증 내용 전체)
        ↓
IPFS 분산 저장
(CID: Qm...)
        ↓
타임스탬프 트랜잭션
(블록체인에 해시 + 시각 기록)
        ↓
공증 완료 배지 부착
🔐 검증됨: 블록 #12345678
        ↓
누구나 해시로 검증 가능
"이 계산서는 변조되지 않았음"
```

### 19.3 검증 UI

```
[계산서 공증 검증]

영수증 ID: receipt_abc123
해시값:    a3f2c1...8d4e
블록:      #12345678
시각:      2026.04.04 14:32:11 KST
규격:      KEC 2024년판

✅ 검증 완료: 원본과 일치
   이 계산서는 위변조되지 않았습니다
```

---

## 20. 커뮤니티 / 집단지성

> ★ v3.0 추가 기능

### 20.1 전문가 Q&A

```
질문: "IEC 60364 4-42조 해석 맞나요?"
        ↓
검증된 전문가(기술사 인증) 답변
        ↓
답변에 근거 규격 자동 링크
        ↓
커뮤니티 투표로 베스트 답변 선정
        ↓
DB에 저장 → 이후 검색에 활용
```

### 20.2 계산서 공유 라이브러리

```
커뮤니티가 검증한 표준 계산서 템플릿:
├── 수변전설비 설계 계산서 (KEC 2024년판)
├── 태양광 계통연계 계산서
├── ESS 용량 계산서
└── 비상발전기 용량 계산서

각 템플릿:
- 날짜 박제 (언제 작성된 기준인지)
- 커뮤니티 검증 배지
- 다운로드 수 / 평점
```

### 20.3 버그 리포트 → DB 개선

```
사용자: "이 계산기 결과 이상해요"
        ↓
커뮤니티 검증
        ↓
오류 확인 → 관리자 수정
        ↓
수정 이력 공개
"v2.3.2: 전압강하 공식 오류 수정"
        ↓
기여자 뱃지 부여
```

---

## 21. AI 도메인

> ★ v2.0 추가 / v3.0 강화

### 21.1 AI 논문 검색 특화

```
일반 검색과 다른 점:

① 벤치마크 연동
  "ImageNet SOTA" → Papers With Code 자동 연결
  정확도/속도/파라미터 비교 테이블

② 코드 연동
  논문 검색 결과에 GitHub 링크 자동 첨부

③ 인용 네트워크
  "이 논문 인용한 최신 연구" 탐색

④ 날짜 가중치 강화
  AI는 6개월만 지나도 구식
  → 최신 논문 가중치 대폭 상향

⑤ 전기 × AI 교차 검색
  "전력계통 AI 적용 최신 연구"
  → 전기 DB + AI DB 동시 검색
```

### 21.2 AI 도구 비교 DB

```
LLM 모델 비교:
├── 가격 (입력/출력 토큰당)
├── 컨텍스트 윈도우
├── 벤치마크 점수
├── 기능 (비전/함수호출/스트리밍)
└── 전기 엔지니어링 특화 평가

모든 정보에 날짜 박제:
"이 가격은 2026.03.15 기준"
"이 벤치마크는 2026.01 측정"
```

### 21.3 전기 × AI 킬러 기능

```
"스마트그리드에 어떤 AI 모델 써?"
        ↓
⚡ 전기 DB: 스마트그리드 논문/규격
🤖 AI DB:  시계열 예측 모델 비교
교차:      전력계통 AI 적용 실제 사례
비용:      GPU/API 비용 계산기
        ↓
통합 답변:
- 전력 수요 예측 → Transformer 추천
- 고장 진단 → CNN 계열 추천
- 관련 논문 5건 + 오픈소스 링크
- 구현 비용 계산기 바로가기
```

---

## 22. BYOK 구조

### 22.1 키 관리 흐름

```
사용자 API 키 입력
        ↓
클라이언트 AES-256 암호화
        ↓
암호화 키만 서버 전송
        ↓
DB 저장 (복호화 불가 구조)
        ↓
API 호출 시: 복호화 → 헤더 삽입 → LLM 호출
        ↓
응답 후 메모리 즉시 삭제
```

### 22.2 LLM 어댑터

```python
class LLMAdapterFactory:
    @staticmethod
    def create(provider: str, api_key: str) -> BaseLLMAdapter:
        return {
            "openai":    OpenAIAdapter,    # GPT-4o
            "anthropic": AnthropicAdapter, # Claude
            "gemini":    GeminiAdapter,    # Gemini
            "ollama":    OllamaAdapter,    # 로컬 LLM
        }[provider](api_key)
```

### 22.3 비용 분담

| 항목 | 담당 |
|------|------|
| 크롤링 + DB + 검색 | 플랫폼 |
| LLM 답변 생성 | **사용자 BYOK** |
| 뉴스 번역/요약 | **사용자 BYOK** |
| 파라미터 추출 | **사용자 BYOK** |
| 수치 계산 | 플랫폼 (무료) |
| OCR 처리 | 플랫폼 |

---

## 23. 보안 및 감사 로그

> ★ v3.0 추가 기능 (기업/공기업 대상)

### 23.1 감사 로그

```
모든 액션 기록:
├── 누가 (user_id)
├── 언제 (timestamp)
├── 무엇을 (action: search/calculate/export)
├── 어떤 결과를 (resource_id)
└── 어디서 (ip_address)

보존 기간: 10년
(전기 설비 설계 법적 보존 기간 준수)
```

### 23.2 접근 권한 관리

```
팀/프로젝트별 접근 제어:
├── Owner: 모든 권한
├── Editor: 계산/편집 가능
└── Viewer: 열람만

기업 온프레미스 옵션:
├── 내부망 설치형
├── 외부 인터넷 차단 운영
└── SLA 보장
```

---

## 24. 도메인 확장 전략

### 24.1 확장 로드맵

```
Phase 1 (현재): ⚡ 전기 + 🤖 AI
Phase 2:        ⚙️ 기계 (ASME/ISO)
Phase 3:        🏗️ 토목/건축 + ⚗️ 화학
Phase 4:        전체 공학 플랫폼 + 글로벌
```

### 24.2 새 도메인 추가 시 변경 범위

```
✅ 추가만 하면 되는 것:
  DOMAIN_REGISTRY 설정
  도메인 크롤러
  도메인 계산기 Python 함수
  도메인 자격증 데이터
  지식 그래프 노드/엣지

❌ 건드리지 않아도 되는 것:
  RAG 파이프라인 코어
  영수증 시스템
  날짜 박제 시스템
  BYOK 구조
  블록체인 공증
  협업 기능
  DB 스키마 (domain 컬럼으로 분리됨)
```

---

## 25. 수익 모델

> ★ v3.0 추가 (나중 실행, 지금 설계에 영향 주는 것만)

### 25.1 티어 구조

```
Free
├── 계산기 월 20회
├── 검색 결과 3개
├── 뉴스 1주일 지연
├── 공증 미지원
└── 협업 1인

Pro ($XX/월)
├── 계산기 무제한
├── 검색 결과 전체
├── 실시간 뉴스
├── 공증 월 10회
├── 협업 5인
└── 개인화 알림

Team ($XX/월/인)
├── Pro 전체
├── 협업 무제한
├── 감사 로그
├── 공증 무제한
└── API 접근

Enterprise (협의)
├── Team 전체
├── 온프레미스 설치
├── 커스텀 DB 연동
├── SLA 보장
└── 전담 지원
```

### 25.2 Free 설계 시 고려사항

```
계산기 영수증: Free도 생성 가능 (바이럴 효과)
공증: Pro 이상 (핵심 전환 유인)
협업: Free 1인 → 팀 초대 시 Pro 유도
날짜 박제: 전 티어 (신뢰 기반이므로)
```

---

## 26. 개발 로드맵

### Phase 1 — MVP (3개월)

```
인프라:
  DB 스키마 + Docker + CI/CD

데이터:
  IEEE/arXiv 크롤러
  KEC/전기사업법 파서
  날짜 박제 파이프라인

검색:
  Weaviate 하이브리드 검색
  RAG 답변 + BYOK
  날짜 메타데이터 부착

계산기 (10종) + 영수증:
  전압강하 / 변압기 / 단락전류
  케이블선정 / 역률보정
  + 날짜 박제 완전 적용

Frontend MVP:
  검색 UI + 계산기 UI
  영수증 뷰 + BYOK 입력
```

### Phase 2 — 기능 확장 (2개월)

```
뉴스 파이프라인 + AI 브리핑
자격증 + 기출문제 AI 해설
계산기 전체 확장 (20종)
모바일 앱 (현장 모드)
협업 기능 (공유/코멘트)
OCR 명판 인식
개인화 알림
지식 그래프 (Neo4j)
```

### Phase 3 — 고도화 (이후)

```
에이전트 워크플로우
블록체인 공증
커뮤니티 Q&A
AI 도메인 추가
데이터 시각화 강화
기계 도메인 확장
감사 로그 (기업용)
온프레미스 옵션
```

---

## 27. 정확도 목표

| 영역 | 목표 정확도 | 근거 |
|------|------------|------|
| 계산기 (영수증) | 99.5%+ | Python 엔진 직접 연산 |
| AI 검색 (RAG) | 85~92% | 도메인 특화 RAG |
| 뉴스 번역/요약 | 88~93% | 원문 출처 병기 |
| 자격증/일정 | 95%+ | 큐넷 공식 데이터 |
| OCR 명판 인식 | 90%+ | 정형 데이터 특성 |

### 정확도 향상 전략

```
단기:
├── 청크 크기 A/B 테스트
├── 전기 도메인 임베딩 파인튜닝
└── 수치 범위 자동 검증

중기:
├── 사용자 피드백 루프
├── 커뮤니티 버그 리포트 반영
└── 전문가 검수 레이어

장기:
├── 전기 특화 LLM 파인튜닝
└── 지식 그래프 기반 정확도 향상
```

---

## 📌 핵심 차별점 요약

```
경쟁사 대비 우리만 가진 것:

1. 영수증 시스템 (독보적)
   계산 과정 전체 공개 → 특허 출원 검토

2. 날짜 박제 (법적 방패)
   "언제, 어떤 규격 기준" 타임스탬프 증명

3. 에이전트 워크플로우
   검색 → 답변 → 계산 → 보고서 원스톱

4. 전기 × AI 교차
   두 도메인 동시 검색 → 전 세계 없음

5. 블록체인 공증
   계산서 위변조 불가 영구 증명

6. 현장 모바일 + OCR
   명판 찍으면 계산기 자동 실행

7. 한국어 + 글로벌 동시
   KEC ↔ IEC 대조 한국어 브리핑
```

---

*v3.0 최종본 — 이후 변경사항은 v4.0으로 관리*
