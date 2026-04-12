# ⚡ 전기 전문 AI 검색엔진 종합 설계서

> **버전**: v1.0  
> **작성일**: 2026-04-04  
> **목적**: 전기 엔지니어링 특화 AI 검색 플랫폼 설계 (분야 확장 고려한 멀티도메인 아키텍처)

---

## 📋 목차

1. [프로젝트 개요](#1-프로젝트-개요)
2. [핵심 철학 및 원칙](#2-핵심-철학-및-원칙)
3. [전체 시스템 아키텍처](#3-전체-시스템-아키텍처)
4. [기술 스택](#4-기술-스택)
5. [데이터베이스 스키마](#5-데이터베이스-스키마)
6. [데이터 수집 파이프라인](#6-데이터-수집-파이프라인)
7. [AI 검색 엔진 설계](#7-ai-검색-엔진-설계)
8. [계산기 시스템 (영수증 구조)](#8-계산기-시스템-영수증-구조)
9. [해외 기술 뉴스 시스템](#9-해외-기술-뉴스-시스템)
10. [자격증 정보 시스템](#10-자격증-정보-시스템)
11. [BYOK 구조 설계](#11-byok-구조-설계)
12. [도메인 확장 전략](#12-도메인-확장-전략)
13. [개발 로드맵](#13-개발-로드맵)

---

## 1. 프로젝트 개요

### 1.1 한 줄 정의

> **전기 엔지니어링 특화 AI 검색 플랫폼** — 글로벌 논문/규격/뉴스를 실시간 수집하고, 할루시네이션 없이 출처 기반 답변을 제공하는 전문 검색엔진

### 1.2 기존 서비스와의 차이

| 구분 | 구글/네이버 | Perplexity | IEEE Xplore | **본 서비스** |
|------|-----------|-----------|------------|------------|
| 도메인 특화 | ❌ 전체 | ❌ 전체 | ⭕ 전기/전자 | ✅ 전기 특화 |
| 할루 차단 | ❌ | △ 일부 | ❌ | ✅ 구조적 차단 |
| 계산기 통합 | ❌ | ❌ | ❌ | ✅ 영수증 포함 |
| 한국어 지원 | ⭕ | △ | ❌ | ✅ 완전 지원 |
| 자격증 정보 | △ | ❌ | ❌ | ✅ |
| 최신 뉴스 | △ | ⭕ | △ | ✅ 전기 특화 |
| BYOK | ❌ | ❌ | ❌ | ✅ |

### 1.3 목표 사용자

- 전기 엔지니어 (설계/시공/감리)
- 전기기사/기술사 수험생
- 전력 관련 연구자
- 전기 관련 스타트업/기업 R&D

---

## 2. 핵심 철학 및 원칙

### 2.1 할루시네이션 제로 원칙

```
AI는 요약/정리 역할만 수행
모든 답변은 반드시 수집된 문서 기반
출처 없는 답변 = 시스템 레벨에서 차단
수치/규격은 계산 엔진이 직접 연산
```

### 2.2 영수증 투명성 원칙

```
계산기: AI가 "계산했다" X → 실제 엔진이 돌린 결과 공개
검색: "이 논문 X페이지 기준" 출처 명시 필수
뉴스: 원문 링크 + 번역 출처 동시 제공
```

### 2.3 도메인 플러그인 원칙

```
전기(1단계) → 기계 → 토목 → 화학 → 전체 공학
처음부터 도메인을 플러그인 구조로 설계
코어는 건드리지 않고 도메인만 추가
```

### 2.4 BYOK 원칙

```
LLM 비용 = 사용자 부담 (본인 API 키 사용)
플랫폼 비용 = 크롤링 + DB + 검색만
API 키는 서버에 저장하지 않음
```

---

## 3. 전체 시스템 아키텍처

### 3.1 레이어 구조

```
┌─────────────────────────────────────────────────────┐
│                  사용자 인터페이스                     │
│              Next.js 14 (App Router)                 │
│       검색창 / 답변뷰 / 계산기 / 뉴스 / 자격증         │
└──────────────────────┬──────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────┐
│               API Gateway (Node.js)                  │
│          인증 / 라우팅 / BYOK 키 처리 / Rate Limit    │
└──────┬────────────┬────────────┬────────────────────┘
       ↓            ↓            ↓
┌──────────┐ ┌──────────┐ ┌──────────┐
│  검색    │ │  계산기  │ │  뉴스    │
│  엔진    │ │  엔진    │ │  피드    │
│ FastAPI  │ │ FastAPI  │ │ FastAPI  │
└────┬─────┘ └────┬─────┘ └────┬─────┘
     ↓            ↓            ↓
┌─────────────────────────────────────────────────────┐
│                   Data Layer                         │
│   Weaviate (벡터)  │  PostgreSQL (메타)              │
│   Redis (캐시)     │  TimescaleDB (시계열/뉴스)       │
└─────────────────────────────────────────────────────┘
                       ↑
┌─────────────────────────────────────────────────────┐
│               데이터 수집 파이프라인                   │
│   Scrapy / Playwright / Apache Airflow               │
│   논문크롤러 / 뉴스크롤러 / 규격파서 / 법령파서         │
└─────────────────────────────────────────────────────┘
```

### 3.2 도메인 플러그인 구조

```python
# 도메인 레지스트리 - 핵심 확장 구조
DOMAIN_REGISTRY = {
    "electrical": {
        "name": "전기",
        "sources": {
            "tier1": ["IEEE Xplore", "IEC", "KEC", "KEPCO"],
            "tier2": ["arXiv", "Elsevier", "Springer"],
            "tier3": ["Power Magazine", "IEEE Spectrum", "T&D World"]
        },
        "calculators": ["전압강하", "단락전류", "변압기용량", "역률보정", ...],
        "certifications": ["전기기능사", "전기산업기사", "전기기사", "전기기술사"],
        "standards": ["KEC", "IEC 60364", "IEEE Std", "KS C"],
        "validators": ["voltage_range", "current_range", "power_factor_range"]
    },
    "mechanical": {   # Phase 2 확장
        "name": "기계",
        "sources": {...},
        "calculators": [...],
        ...
    }
}
```

---

## 4. 기술 스택

### 4.1 Frontend

| 기술 | 용도 | 선택 이유 |
|------|------|---------|
| Next.js 14 (App Router) | 메인 프레임워크 | SSR/SSG 지원, SEO |
| TypeScript | 언어 | 타입 안정성 |
| Tailwind CSS | 스타일링 | 빠른 개발 |
| shadcn/ui | UI 컴포넌트 | 커스터마이즈 용이 |
| Zustand | 상태관리 | 경량 |
| React Query | 서버 상태 | 캐싱/동기화 |

### 4.2 Backend

| 기술 | 용도 | 선택 이유 |
|------|------|---------|
| FastAPI (Python) | 검색/계산 API | AI 라이브러리 호환 |
| Node.js (Express) | API Gateway | 비동기 처리 |
| WebSocket | 실시간 뉴스 피드 | 실시간성 |
| Redis | 캐시/세션 | 고속 조회 |

### 4.3 AI / ML

| 기술 | 용도 |
|------|------|
| LangChain | RAG 오케스트레이션 |
| LlamaIndex | 문서 인덱싱/청킹 |
| BYOK (OpenAI/Claude/Gemini) | LLM 답변 생성 |
| text-embedding-3-small | 임베딩 (기본) |

### 4.4 데이터베이스

| DB | 용도 | 선택 이유 |
|----|------|---------|
| Weaviate | 벡터 검색 | 하이브리드 검색 지원 |
| PostgreSQL | 메인 RDB | 안정성, JSONB 지원 |
| TimescaleDB | 뉴스/시계열 | 시간 기반 쿼리 최적화 |
| Redis | 캐시/세션 | 인메모리 고속 처리 |

### 4.5 데이터 수집

| 기술 | 용도 |
|------|------|
| Scrapy | 대량 크롤링 |
| Playwright | JS 렌더링 페이지 |
| Apache Airflow | 크롤링 스케줄러/DAG |
| BeautifulSoup | HTML 파싱 |

### 4.6 계산 엔진

| 기술 | 용도 |
|------|------|
| NumPy / SciPy | 수치 연산 |
| SymPy | 기호 수학 / 수식 표현 |
| Pint | 단위 변환 |

### 4.7 배포/인프라

| 기술 | 용도 |
|------|------|
| AWS / GCP | 클라우드 인프라 |
| Docker | 컨테이너화 |
| Kubernetes | 오케스트레이션 |
| Cloudflare | CDN / DDoS 방어 |
| GitHub Actions | CI/CD |

---

## 5. 데이터베이스 스키마

### 5.1 문서 DB (논문/규격/법령)

```sql
-- 문서 마스터 테이블
CREATE TABLE documents (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    domain          VARCHAR(50) NOT NULL,        -- electrical, mechanical, civil...
    doc_type        VARCHAR(50) NOT NULL,         -- paper, standard, law, news, datasheet
    title           TEXT NOT NULL,
    title_ko        TEXT,                         -- 한국어 제목 (AI 번역)
    source          VARCHAR(100) NOT NULL,        -- IEEE, IEC, KS, DOE, KEPCO...
    tier            SMALLINT NOT NULL CHECK (tier IN (1,2,3)),
    url             TEXT,
    doi             VARCHAR(200),
    published_at    TIMESTAMP,
    language        VARCHAR(10),                  -- en, ko, de, ja
    raw_text        TEXT,
    summary_ko      TEXT,                         -- AI 한국어 요약
    quality_score   FLOAT,                        -- 품질 점수 (0~1)
    created_at      TIMESTAMP DEFAULT NOW(),
    updated_at      TIMESTAMP DEFAULT NOW()
);

-- 벡터 청크 테이블 (Weaviate와 연동)
CREATE TABLE document_chunks (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doc_id          UUID REFERENCES documents(id) ON DELETE CASCADE,
    chunk_index     INT NOT NULL,
    content         TEXT NOT NULL,
    content_ko      TEXT,                         -- 한국어 번역
    page_number     INT,
    section         VARCHAR(200),
    weaviate_id     VARCHAR(200),                 -- Weaviate 오브젝트 ID
    metadata        JSONB
);

-- 소스 신뢰도 테이블
CREATE TABLE sources (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(100) UNIQUE NOT NULL, -- "IEEE Xplore"
    tier            SMALLINT NOT NULL,
    domain          VARCHAR(50)[],
    base_url        TEXT NOT NULL,
    api_available   BOOLEAN DEFAULT false,
    api_config      JSONB,                        -- API 키/엔드포인트 설정
    crawl_config    JSONB,                        -- 크롤링 설정
    crawl_interval  INT DEFAULT 168,              -- 시간 단위 (168 = 주 1회)
    last_crawled_at TIMESTAMP,
    is_active       BOOLEAN DEFAULT true
);
```

### 5.2 계산기 DB

```sql
-- 계산기 정의 테이블
CREATE TABLE calculators (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    domain          VARCHAR(50) NOT NULL,         -- electrical
    category        VARCHAR(100) NOT NULL,        -- power, protection, cable, transformer
    name            VARCHAR(200) NOT NULL,        -- "전압강하 계산기"
    name_en         VARCHAR(200),
    description     TEXT,
    formula_display TEXT,                         -- 화면 표시용 수식 (LaTeX)
    formula_code    TEXT,                         -- 실제 Python 코드
    standards       VARCHAR(100)[],               -- ["KEC 232.52", "IEC 60364-5-52"]
    params_schema   JSONB NOT NULL,               -- 입력 파라미터 JSON Schema
    output_schema   JSONB NOT NULL,               -- 출력 파라미터 JSON Schema
    tags            VARCHAR(50)[],
    is_active       BOOLEAN DEFAULT true,
    created_at      TIMESTAMP DEFAULT NOW()
);

-- 계산 영수증 테이블 (핵심!)
CREATE TABLE calculation_receipts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    calc_id         UUID REFERENCES calculators(id),
    user_session    VARCHAR(200),
    user_id         UUID REFERENCES users(id),

    -- 입력/출력
    inputs          JSONB NOT NULL,               -- 사용자 입력값
    result          JSONB NOT NULL,               -- 최종 결과

    -- 영수증 핵심 데이터
    steps           JSONB NOT NULL,               -- 단계별 계산 과정
    formula_used    TEXT NOT NULL,                -- 실제 사용된 공식
    standards_used  VARCHAR(100)[],               -- 적용된 규격
    warnings        TEXT[],                       -- 주의사항
    recommendations TEXT[],                       -- 권장사항 (표준 용량 등)

    -- 메타
    calc_engine_ver VARCHAR(20),                  -- 계산 엔진 버전
    created_at      TIMESTAMP DEFAULT NOW()
);

-- steps JSONB 구조 예시:
-- [
--   {"step": 1, "desc": "√3 계산", "formula": "√3", "value": 1.7320, "unit": ""},
--   {"step": 2, "desc": "선간전압 × √3", "formula": "22900 × 1.7320", "value": 39662.8, "unit": "V"},
--   {"step": 3, "desc": "× 전류", "formula": "39662.8 × 100", "value": 3966280, "unit": "VA"},
--   {"step": 4, "desc": "× 역률", "formula": "3966280 × 0.95", "value": 3767966, "unit": "VA"},
--   {"step": 5, "desc": "kVA 변환", "formula": "3767966 / 1000", "value": 3767.97, "unit": "kVA"}
-- ]

-- 계산 이력 (프로젝트 관리)
CREATE TABLE calculation_history (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    receipt_id      UUID REFERENCES calculation_receipts(id),
    user_id         UUID REFERENCES users(id),
    project_id      UUID REFERENCES projects(id),
    memo            TEXT,
    tags            VARCHAR(50)[],
    created_at      TIMESTAMP DEFAULT NOW()
);
```

### 5.3 뉴스 DB

```sql
-- 뉴스 원문 테이블
CREATE TABLE news_articles (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source          VARCHAR(100) NOT NULL,        -- "IEEE Spectrum"
    tier            SMALLINT NOT NULL,
    title           TEXT NOT NULL,
    title_ko        TEXT,                         -- AI 번역
    url             TEXT UNIQUE NOT NULL,
    original_lang   VARCHAR(10) DEFAULT 'en',
    content_original TEXT,
    content_ko      TEXT,                         -- AI 번역/요약
    summary_ko      TEXT,                         -- 3줄 요약
    categories      VARCHAR(100)[],               -- ["스마트그리드", "신재생", "반도체"]
    keywords        VARCHAR(100)[],
    relevance_score FLOAT,                        -- 전기 도메인 관련성 (0~1)
    published_at    TIMESTAMP,
    crawled_at      TIMESTAMP DEFAULT NOW()
) PARTITION BY RANGE (published_at);             -- 시계열 파티셔닝

-- 트렌드 분석 테이블
CREATE TABLE news_trends (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    period          DATE NOT NULL,
    keyword         VARCHAR(100) NOT NULL,
    domain          VARCHAR(50) NOT NULL,
    count           INT DEFAULT 0,
    sentiment       FLOAT,                        -- 긍정/부정 점수
    UNIQUE(period, keyword, domain)
);
```

### 5.4 자격증 DB

```sql
-- 자격증 마스터
CREATE TABLE certifications (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    domain          VARCHAR(50) NOT NULL,         -- electrical
    name            VARCHAR(100) NOT NULL,        -- "전기기사"
    name_en         VARCHAR(100),
    level           SMALLINT NOT NULL,            -- 1:기능사 2:산업기사 3:기사 4:기술사
    issuer          VARCHAR(100),                 -- "한국산업인력공단"
    description     TEXT,
    requirements    JSONB,                        -- 응시자격 조건
    exam_subjects   JSONB,                        -- 시험 과목
    related_jobs    TEXT[],                       -- 관련 직종
    related_laws    TEXT[],                       -- 관련 법령
    is_active       BOOLEAN DEFAULT true
);

-- 시험 일정
CREATE TABLE exam_schedules (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cert_id         UUID REFERENCES certifications(id),
    year            SMALLINT NOT NULL,
    round           SMALLINT NOT NULL,            -- 1회, 2회, 3회
    apply_start     DATE,
    apply_end       DATE,
    written_date    DATE,                         -- 필기 시험일
    written_result  DATE,                         -- 필기 합격발표
    practical_apply_start DATE,                   -- 실기 접수 시작
    practical_apply_end   DATE,
    practical_date  DATE,                         -- 실기 시험일
    final_result    DATE,                         -- 최종 발표
    is_confirmed    BOOLEAN DEFAULT false,        -- 공식 확정 여부
    source_url      TEXT,                         -- 큐넷 공고 링크
    UNIQUE(cert_id, year, round)
);

-- 합격률 통계
CREATE TABLE exam_statistics (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cert_id         UUID REFERENCES certifications(id),
    year            SMALLINT NOT NULL,
    round           SMALLINT NOT NULL,
    exam_type       VARCHAR(20) NOT NULL,         -- written, practical
    applicants      INT,
    takers          INT,
    passed          INT,
    pass_rate       FLOAT GENERATED ALWAYS AS (
                        CASE WHEN takers > 0
                        THEN ROUND((passed::numeric / takers * 100), 2)
                        ELSE 0 END
                    ) STORED,
    UNIQUE(cert_id, year, round, exam_type)
);
```

### 5.5 사용자/BYOK DB

```sql
-- 사용자 테이블
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           VARCHAR(255) UNIQUE,
    nickname        VARCHAR(100),
    domain_pref     VARCHAR(50)[],               -- 관심 도메인
    created_at      TIMESTAMP DEFAULT NOW(),
    last_login_at   TIMESTAMP
);

-- BYOK API 키 관리 (암호화 저장)
CREATE TABLE user_api_keys (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID REFERENCES users(id) ON DELETE CASCADE,
    provider        VARCHAR(50) NOT NULL,         -- openai, anthropic, gemini
    key_encrypted   TEXT NOT NULL,               -- AES-256 암호화
    key_hint        VARCHAR(10),                  -- 마지막 4자리만 표시
    is_active       BOOLEAN DEFAULT true,
    last_used_at    TIMESTAMP,
    created_at      TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, provider)
);

-- 프로젝트 (계산 이력 묶음)
CREATE TABLE projects (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID REFERENCES users(id) ON DELETE CASCADE,
    name            VARCHAR(200) NOT NULL,
    domain          VARCHAR(50),
    description     TEXT,
    created_at      TIMESTAMP DEFAULT NOW()
);

-- 검색 히스토리
CREATE TABLE search_history (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID REFERENCES users(id),
    query           TEXT NOT NULL,
    domain          VARCHAR(50),
    result_count    INT,
    llm_provider    VARCHAR(50),
    created_at      TIMESTAMP DEFAULT NOW()
);
```

---

## 6. 데이터 수집 파이프라인

### 6.1 소스 계층 (Tier 시스템)

```
Tier 1 — 최고 신뢰 (공식 기관/학술 DB)
├── IEEE Xplore          전기/전자 논문 최대 DB
├── IEC 공식 문서         국제전기기술위원회
├── KEC (한국전기설비규정) 국내 전기설비 기준
├── 전기사업법/기술기준    국내 법령
├── DOE                  미 에너지부
└── EPRI                 전력연구원

Tier 2 — 신뢰 (학술 출판사)
├── arXiv               프리프린트 (최신)
├── Elsevier / ScienceDirect
├── Springer
└── MDPI (오픈액세스)

Tier 3 — 참고 (전문 미디어)
├── IEEE Spectrum
├── Power Magazine
├── T&D World
├── EE Times
├── Electrek
└── NREL / BloombergNEF
```

### 6.2 Airflow DAG 구조

```python
# DAG 1: 논문 크롤링 (주 1회)
paper_crawl_dag:
    task_1: crawl_ieee_xplore
    task_2: crawl_arxiv
    task_3: crawl_elsevier
    task_4: preprocess_filter    # 전기 도메인 필터
    task_5: dedup_check          # 중복 제거 (DOI 기준)
    task_6: quality_scoring      # 품질 점수 계산
    task_7: embed_and_index      # 임베딩 → Weaviate

# DAG 2: 뉴스 크롤링 (6시간마다)
news_crawl_dag:
    task_1: crawl_news_sources   # 전체 뉴스 소스
    task_2: relevance_filter     # 전기 관련성 필터 (0.7 이상만)
    task_3: translate_summarize  # AI 번역/요약 (BYOK 또는 자체 소형모델)
    task_4: trend_analysis       # 트렌드 키워드 추출
    task_5: store_timescaledb    # TimescaleDB 저장

# DAG 3: 규격/법령 크롤링 (월 1회)
standard_crawl_dag:
    task_1: crawl_iec_standards
    task_2: crawl_kec_updates
    task_3: crawl_law_changes    # 국가법령정보센터
    task_4: diff_detection       # 개정사항 감지
    task_5: alert_generation     # 중요 개정 알림
```

### 6.3 전처리 파이프라인

```
원문 수집
    ↓
언어 감지 (langdetect)
    ↓
전기 도메인 관련성 스코어링
  - 키워드 매칭 (전기, electrical, power, voltage...)
  - 임베딩 유사도 (전기 도메인 기준 벡터 대비)
  - 임계값 0.6 이상만 통과
    ↓
중복 제거
  - DOI 기준 (논문)
  - URL + 제목 해시 (뉴스)
    ↓
텍스트 청킹
  - 청크 크기: 512 토큰
  - 오버랩: 50 토큰
  - 섹션/페이지 경계 존중
    ↓
임베딩 생성
  - text-embedding-3-small (기본)
  - 사용자 BYOK 키 사용 시 해당 provider
    ↓
Weaviate 저장 + PostgreSQL 메타데이터
```

---

## 7. AI 검색 엔진 설계

### 7.1 검색 파이프라인

```
사용자 자연어 질문
        ↓
① 질문 분석 (LLM)
   - 도메인 분류 (전기/기계/...)
   - 검색 의도 파악 (논문/규격/법령/Q&A)
   - 키워드 추출
   - 한/영 쿼리 생성
        ↓
② 하이브리드 검색 (Weaviate)
   - 벡터 검색 (의미적 유사도)
   - 키워드 검색 (BM25)
   - Tier 가중치 적용
   - 도메인 필터 적용
        ↓
③ 컨텍스트 재랭킹
   - Cross-encoder 재랭킹
   - 최신성 점수 반영
   - Tier 점수 반영
        ↓
④ RAG 답변 생성 (BYOK LLM)
   - 시스템 프롬프트: "문서 기반으로만 답변"
   - 컨텍스트 청크 삽입
   - 출처 인용 강제
        ↓
⑤ 할루시네이션 검증
   - 답변 vs 원문 일치도 체크
   - 수치 범위 검증
   - 출처 없는 주장 감지
        ↓
⑥ 최종 출력
   - 답변 텍스트
   - 인용 문서 목록 (Tier 표시)
   - 원문 링크
   - 관련 계산기 바로가기
   - 관련 규격 바로가기
```

### 7.2 검색 타입별 처리

```
검색 타입 1: 논문 검색
  예) "SiC MOSFET 고온 특성 최신 연구"
  → IEEE + arXiv 우선 검색
  → 2년 이내 논문 가중치 상향
  → 핵심 수치/결론 추출
  → 논문 비교 테이블 생성

검색 타입 2: 규격 검색
  예) "IEC 61850 최신 개정 내용"
  → Tier 1 소스 우선
  → 개정 이력 함께 표시
  → 국내 대응 규격 연결

검색 타입 3: 법령 검색
  예) "전기안전관리자 선임 기준"
  → 전기사업법/기술기준 우선
  → 조항 번호 명시
  → 최근 개정 여부 표시

검색 타입 4: 기술 Q&A
  예) "변압기 임피던스가 왜 중요해?"
  → 복합 소스 검색
  → 개념 설명 + 근거 논문 제시
  → 관련 계산기 추천
```

### 7.3 출력 구조

```json
{
  "answer": "답변 텍스트...",
  "confidence": 0.92,
  "sources": [
    {
      "title": "논문/문서 제목",
      "source": "IEEE Xplore",
      "tier": 1,
      "url": "https://...",
      "page": 42,
      "relevance": 0.95
    }
  ],
  "related_calculators": ["전압강하 계산기", "케이블 선정"],
  "related_standards": ["KEC 232.52", "IEC 60364-5-52"],
  "search_type": "technical_qa",
  "domain": "electrical"
}
```

---

## 8. 계산기 시스템 (영수증 구조)

### 8.1 계산 흐름

```
사용자 자연어 입력
"3상 22.9kV, 전류 100A, 역률 0.95일 때 변압기 용량?"
        ↓
AI 파라미터 추출 (BYOK LLM)
{voltage: 22900, current: 100, power_factor: 0.95, phase: 3}
        ↓
계산기 자동 매핑
→ calculators 테이블에서 "변압기 용량 계산기" 선택
        ↓
Python 계산 엔진 실행 (실제 수치 연산)
calculate_transformer_capacity(V=22900, I=100, pf=0.95)
        ↓
단계별 로그 자동 생성
        ↓
영수증 생성 + DB 저장
        ↓
결과 + 영수증 출력
```

### 8.2 영수증 출력 구조

```
┌─────────────────────────────────────────┐
│            🧾 계산 영수증                │
│         변압기 용량 계산기               │
├─────────────────────────────────────────┤
│ 적용 공식                                │
│   P = √3 × V × I × cosθ               │
│                                         │
│ 근거 규격                                │
│   KEC 210.3 / IEC 60076-1              │
│                                         │
│ 입력값                                   │
│   결선 방식   = 3상                     │
│   선간전압 V  = 22,900 V               │
│   전류 I      = 100 A                  │
│   역률 cosθ   = 0.95                   │
│                                         │
│ 계산 과정                                │
│   Step 1: √3        = 1.7320           │
│   Step 2: 22,900 × 1.7320 = 39,663 V  │
│   Step 3: 39,663 × 100   = 3,966,280  │
│   Step 4: 3,966,280 × 0.95 = 3,767,966│
│   Step 5: ÷ 1000         = 3,767.97   │
│                                         │
│ 결과                                     │
│   ✅ 계산값: 3,767.97 kVA              │
│   📌 권장 선정: 4,000 kVA (표준 용량)  │
│                                         │
│ 주의사항                                 │
│   ⚠️ 수용률/부등률 적용 검토 필요       │
│   ⚠️ 장래 부하 증설 여유분 고려         │
├─────────────────────────────────────────┤
│  📋 PDF저장  🔗 공유  ✏️ 재계산  💾 저장│
└─────────────────────────────────────────┘
```

### 8.3 전기 계산기 전체 목록

#### 전력 계산
| 계산기 | 적용 규격 |
|--------|---------|
| 단상/3상 전력 계산기 | KEC 210 |
| 역률 보정 계산기 | KEC 220 |
| 전압강하 계산기 | KEC 232.52 |
| 전력손실 계산기 | IEC 60364 |
| 수용률/부등률 계산기 | KEC 210.3 |

#### 보호 협조
| 계산기 | 적용 규격 |
|--------|---------|
| 차단기 용량 계산기 | IEC 60947 |
| 단락전류 계산기 | IEC 60909 |
| 케이블 굵기 선정 | KEC 232 |
| 접지저항 계산기 | KEC 140 |
| 보호계전기 정정 계산기 | IEEE C37 |

#### 변압기
| 계산기 | 적용 규격 |
|--------|---------|
| 변압기 용량 계산기 | KEC 210.3 / IEC 60076 |
| 임피던스 전압 계산기 | IEC 60076-1 |
| 변압기 손실 계산기 | IEC 60076-1 |
| 병렬운전 조건 계산기 | KEC |

#### 신재생/ESS
| 계산기 | 적용 규격 |
|--------|---------|
| 태양광 발전량 계산기 | IEC 61724 |
| 배터리 용량 계산기 | IEC 62619 |
| 인버터 효율 계산기 | IEC 61683 |
| 계통연계 계산기 | KEC 500 |

#### 조명/설비
| 계산기 | 적용 규격 |
|--------|---------|
| 조도 계산기 | KS C 3703 |
| 비상발전기 용량 계산기 | KEC |
| 무정전전원장치(UPS) 용량 | IEC 62040 |

---

## 9. 해외 기술 뉴스 시스템

### 9.1 뉴스 소스 목록

#### Tier 1 — 전문 기술 미디어
| 소스 | 특화 분야 | 크롤 주기 |
|------|---------|---------|
| IEEE Spectrum | 전기/전자 전반 | 6시간 |
| Power Magazine | 전력 산업 | 6시간 |
| T&D World | 송배전 | 6시간 |
| EE Times | 반도체/전자 | 6시간 |
| Renewable Energy World | 신재생 | 6시간 |
| Power Electronics News | 전력전자 | 12시간 |

#### Tier 2 — 산업/비즈니스
| 소스 | 특화 분야 | 크롤 주기 |
|------|---------|---------|
| BloombergNEF | 에너지 시장 | 12시간 |
| S&P Global Energy | 전력 시장 | 12시간 |
| Electrek | EV/신재생 | 6시간 |
| Wood Mackenzie | 에너지 분석 | 24시간 |

#### Tier 3 — 기관/정부
| 소스 | 특화 분야 | 크롤 주기 |
|------|---------|---------|
| DOE (미 에너지부) | 정책/R&D | 24시간 |
| NREL | 신재생 연구 | 24시간 |
| IEA | 국제 에너지 | 24시간 |
| EPRI | 전력 연구 | 24시간 |
| 한국전력연구원 KEPRI | 국내 연구 | 24시간 |

### 9.2 뉴스 카테고리 분류

```
전력 시스템
├── 스마트그리드 / AMI
├── HVDC / FACTS
├── 디지털 변전소
└── 전력계통 안정화

신재생 에너지
├── 태양광 (효율/모듈/인버터)
├── 해상/육상 풍력
├── 그린수소 / 연료전지
└── ESS (배터리/플라이휠)

전력 반도체
├── SiC MOSFET
├── GaN 소자
├── 차세대 소재 (Ga2O3 등)
└── 전력 패키징

EV / 모빌리티
├── 배터리 기술
├── 충전 인프라 (V2G)
├── 전기 추진 선박/항공
└── 전기철도

정책 / 규제
├── 각국 전력 정책
├── 탄소중립 규제
└── 국제 규격 개정
```

### 9.3 AI 뉴스 브리핑 기능

```
매일 06:00 자동 생성
        ↓
전날 수집 뉴스 전체 분석
        ↓
카테고리별 TOP 3 선정
        ↓
AI 한국어 요약 (3줄 이내)
        ↓
중요도 랭킹 (조회수 + 관련성)
        ↓
"오늘의 전기 기술 브리핑" 메인 노출
        ↓
관련 논문/규격 자동 연결
```

### 9.4 검색 × 뉴스 통합

```
"GaN 인버터 최신 동향" 검색 시

┌─────────────────────────────────────┐
│ 🔍 검색 결과                         │
│                                     │
│ 📰 이번 주 뉴스 (3건)                │
│   · EE Times: GaN 효율 99% 달성     │
│   · IEEE Spectrum: GaN vs SiC 비교  │
│                                     │
│ 📄 관련 논문 (5건)                   │
│   · IEEE Trans. PE 2024             │
│   · arXiv 2025.03                   │
│                                     │
│ 📏 관련 규격                          │
│   · IEC 62684 (GaN 소자 시험)       │
│                                     │
│ 🧮 관련 계산기                        │
│   → 인버터 효율 계산기 바로가기       │
└─────────────────────────────────────┘
```

---

## 10. 자격증 정보 시스템

### 10.1 자격증 체계

```
전기 분야 자격증 로드맵

전기기능사 (Level 1)
    ↓ (실무경력 + 학력 조건)
전기산업기사 (Level 2)
    ↓ (실무경력 + 학력 조건)
전기기사 (Level 3)        ← 실무 필수 라인
    ↓ (실무경력 4년 이상)
전기기술사 (Level 4)      ← 최고 권위

관련 자격
├── 소방설비기사 (전기분야)
├── 에너지관리기사
├── 신재생에너지발전설비기사
└── 전기안전관리자 선임 자격
```

### 10.2 자격증별 정보 구조

```
각 자격증 페이지 구성

① 기본 정보
  - 개요 / 취득 목적
  - 응시 자격 조건
  - 시험 과목 및 배점

② 시험 일정 (자동 업데이트)
  - 현재 연도 일정 (큐넷 연동)
  - 접수 → 필기 → 실기 → 발표 타임라인

③ 합격률 통계 (차트)
  - 연도별 합격률 추이
  - 필기/실기 별도 통계

④ 수험 가이드
  - 출제 기준 (최신)
  - 핵심 학습 분야
  - 관련 규격/법령 링크 (본 플랫폼 검색 연동)

⑤ 관련 법령
  - 기술사법 / 국가기술자격법
  - 전기안전관리자 선임 기준
  - 전기공사업법
```

### 10.3 자격증 × 검색 연동

```
"전기기사 시험에 나오는 변압기 병렬운전 조건" 검색

→ 자격증 DB: 전기기사 출제기준 확인
→ 논문/교재 DB: 관련 기술 자료
→ 규격 DB: KEC 관련 조항
→ 계산기: 변압기 계산기 추천
```

---

## 11. BYOK 구조 설계

### 11.1 키 관리 흐름

```
사용자 API 키 입력
        ↓
클라이언트에서 AES-256 암호화
        ↓
암호화된 키만 서버 전송
        ↓
DB 저장 (복호화 불가 구조)
        ↓
API 호출 시: 복호화 → 헤더에 삽입 → LLM 호출
        ↓
응답 후 메모리에서 즉시 삭제
```

### 11.2 지원 LLM 어댑터

```python
class LLMAdapterFactory:
    """LLM 멀티 어댑터 - 어떤 모델이든 교체 가능"""

    @staticmethod
    def create(provider: str, api_key: str) -> BaseLLMAdapter:
        adapters = {
            "openai":    OpenAIAdapter,      # GPT-4o
            "anthropic": AnthropicAdapter,   # Claude
            "gemini":    GeminiAdapter,      # Gemini Pro
            "ollama":    OllamaAdapter,      # 로컬 LLM
        }
        return adapters[provider](api_key)

class BaseLLMAdapter:
    """공통 인터페이스 - 어떤 LLM이든 동일하게 호출"""
    def query(self, system: str, user: str, context: list) -> str:
        raise NotImplementedError

    def embed(self, text: str) -> list[float]:
        raise NotImplementedError
```

### 11.3 비용 분담 구조

| 항목 | 담당 | 비고 |
|------|------|------|
| 논문/규격 크롤링 | 플랫폼 | 서버 운영비 |
| Vector DB 운영 | 플랫폼 | Weaviate |
| RAG 검색 로직 | 플랫폼 | 자체 엔진 |
| LLM 답변 생성 | **사용자** | BYOK |
| 뉴스 번역/요약 | **사용자** | BYOK 또는 소형모델 |
| 파라미터 추출 | **사용자** | BYOK |
| 실제 수치 계산 | 플랫폼 | Python 엔진 (무료) |

---

## 12. 도메인 확장 전략

### 12.1 확장 로드맵

```
Phase 1 — 전기 (MVP)
  전기 논문/규격 DB
  전기 계산기 20종
  전기 자격증 정보
  해외 전기 뉴스

Phase 2 — 기계/소방
  ASME / ISO 기계 규격
  기계 계산기 추가
  소방설비기사 연동

Phase 3 — 건설/화학
  토목/건축 규격
  화학 안전 DB

Phase 4 — 전체 공학 플랫폼
  전 산업 도메인
  다국어 완전 지원
  커뮤니티 기능
```

### 12.2 확장 시 변경 범위

```
새 도메인 추가 시 건드리는 것:

✅ 추가만 하면 되는 것
  - DOMAIN_REGISTRY에 도메인 설정 추가
  - 해당 도메인 크롤러 추가
  - 해당 도메인 계산기 Python 함수 추가
  - 해당 도메인 자격증 데이터 추가

❌ 건드리지 않아도 되는 것
  - 검색 엔진 코어
  - RAG 파이프라인
  - 영수증 시스템
  - BYOK 구조
  - DB 스키마 (domain 컬럼으로 분리됨)
  - Frontend 공통 컴포넌트
```

---

## 13. 개발 로드맵

### Phase 1 — MVP (2~3개월)

```
인프라 세팅
  ├── DB 스키마 구축 (PostgreSQL + Weaviate)
  ├── Docker 환경 구성
  └── CI/CD 파이프라인

데이터 수집
  ├── IEEE Xplore 크롤러
  ├── arXiv 크롤러
  ├── KEC/전기사업법 파서
  └── Airflow DAG 기본 구성

검색 엔진
  ├── 임베딩 파이프라인
  ├── Weaviate 하이브리드 검색
  ├── RAG 답변 생성
  └── BYOK 연동

계산기 (핵심 10종)
  ├── 전압강하 계산기 + 영수증
  ├── 단락전류 계산기 + 영수증
  ├── 변압기 용량 계산기 + 영수증
  ├── 케이블 선정 계산기 + 영수증
  └── 역률 보정 계산기 + 영수증

Frontend MVP
  ├── 검색 인터페이스
  ├── 계산기 UI + 영수증 뷰
  └── BYOK 키 입력 UI
```

### Phase 2 — 기능 확장 (2개월)

```
  ├── 뉴스 파이프라인 완성
  ├── AI 일일 브리핑
  ├── 자격증 정보 시스템
  ├── 계산기 전체 확장 (20종)
  ├── PDF 영수증 출력
  ├── 프로젝트/이력 관리
  └── 사용자 계정 시스템
```

### Phase 3 — 고도화 (이후)

```
  ├── 도메인 확장 (기계/소방)
  ├── 커뮤니티 기능
  ├── 모바일 앱
  └── 기업용 API 제공
```

---

## 📌 핵심 요약

```
이 플랫폼의 3가지 차별점:

1. 할루시네이션 구조적 차단
   → AI는 수집된 문서 기반 요약만
   → 계산은 Python 엔진이 직접 수행

2. 영수증 투명성
   → 계산 과정 전체 공개
   → 출처 논문/규격 조항까지 명시

3. 확장 가능한 플러그인 구조
   → 전기 → 기계 → 전체 공학
   → 코어 건드리지 않고 도메인만 추가
```

---

*본 설계서는 지속적으로 업데이트됩니다.*
