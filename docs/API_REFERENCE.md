# ESA API Reference

> 기준일: 2026-07-23 · ESVA v0.2.0 · 제품 코드 기준 `ad7b91c`

`GET /api/openapi`는 외부에 공개할 핵심 API의 OpenAPI 3.1 계약입니다. 저장소의 모든 내부·조건부 Route Handler를 자동 수집한 문서는 아니며, 아래 인벤토리가 전체 라우트 표면을 구분합니다.

## 공통 경계

- 인증이 필요한 라우트는 `Authorization: Bearer <Firebase ID token>`을 서버에서 검증합니다.
- 브라우저 상태 변경 요청은 인증 외에 정확한 same-origin 검사를 적용합니다.
- BYOK 키가 필요한 AI 라우트는 요청 중에만 키를 사용하며 응답·DB·로그에 키를 넣지 않습니다.
- 응답 형태는 새 핵심 API의 `{ success, data | error }` 계약을 우선하지만, 일부 기존 조회 API는 도메인 객체를 바로 반환합니다. 호출자는 HTTP 상태를 먼저 확인해야 합니다.
- 세부 요청 한도는 `src/lib/rate-limit.ts`가 정본입니다. 인메모리 제한은 단일 프로세스 보호 장치이며 분산 전역 쿼터가 아닙니다.

## 공개 핵심 API

### `POST /api/calculate`

등록된 계산기를 실행하고 계산 영수증을 생성합니다.

```json
{
  "calculatorId": "voltage-drop",
  "inputs": {
    "voltage": 380,
    "current": 100,
    "length": 50,
    "cableSize": 35,
    "conductor": "Cu",
    "phase": 3,
    "powerFactor": 0.9
  },
  "countryCode": "KR"
}
```

계산기별 필수 입력과 허용 범위가 다릅니다. 성공 응답에는 계산 결과, 단계, 경고, 관련 계산기와 무결성 해시가 포함될 수 있습니다.

### `POST /api/search`

로컬 자료·계산기·기준서 스냅샷을 검색합니다. Studio/AI 응답은 배포 환경의 공급자 키 또는 허용된 사용자 설정에 따라 조건부입니다.

```json
{
  "query": "KEC 전압강하",
  "countryCode": "KR",
  "page": 1,
  "pageSize": 20
}
```

### `POST /api/chat`

멀티 공급자 AI 응답을 SSE로 스트리밍합니다. 현재 공급자와 모델 ID는 `src/lib/ai-providers.ts`가 정본입니다. 클라이언트는 `provider`, `model`, `messages`, `language`, 선택적 BYOK 또는 온프레미스 전송 정보를 보냅니다. 시스템 지침은 서버가 생성하며 클라이언트가 덮어쓸 수 없습니다.

완전한 계산 질문은 응답 모델을 호출하기 전에 ESVA 계산기 레지스트리를 실행합니다. 이 경우 첫 SSE 이벤트 중 하나로 다음 영수증이 전달됩니다.

```json
{
  "calculation": {
    "calculatorId": "voltage-drop",
    "calculatorName": "전압 강하 계산",
    "input": {
      "phase": 3,
      "voltage": 380,
      "current": 100,
      "length": 50,
      "cableSize": 35,
      "conductor": "Cu",
      "powerFactor": 0.9
    },
    "result": {
      "value": 4.14,
      "unit": "V"
    }
  }
}
```

필수 입력이 없거나 의도 파서 확신도가 부족하면 계산기 영수증을 만들지 않습니다. AI 출력은 사용자 입력과 실제 계산 영수증에 없는 수치, 안전 단정 표현을 필터링할 수 있습니다. 빈 스트림과 공급자 오류는 성공 답변으로 취급하지 않습니다.

### `POST /api/team-review`

계통도·평면도·기준서 3개 전문팀과 별도 합의 단계를 실행합니다.

- JSON: `query`, `projectName`, `projectType`, `params`, 선택적 `rules`
- multipart: 위 필드와 `file`
- 허용 파일: PNG, JPEG, WebP, PDF, DXF
- 이미지 분석: 지원 공급자의 BYOK 키 또는 서버 키 필요

서로 다른 전문팀 두 곳 이상이 성공하지 않으면 합의 완료가 아니라 사람 검토 필요 상태를 반환합니다.

### 도면 API

| API | 역할 | 핵심 경계 |
|---|---|---|
| `POST /api/sld` | 이미지 SLD 인식 | BYOK/서버 Vision 키, 이미지 형식·크기 검증 |
| `POST /api/dxf` | DXF 벡터 파싱 | `$INSUNITS` 또는 명시적 `unitScale`만 물리 길이에 사용 |
| `POST /api/pdf-drawing` | PDF 선택 페이지 벡터 파싱 | 페이지 범위·파일 크기 검증, 래스터 전용 PDF는 실패 |
| `POST /api/ocr` | 전기 명판 OCR | 필드 타입·길이·confidence 엄격 검증 |

### SLD V3 작업 API

SLD 전체 문서 판독은 작업 리소스를 생성한 뒤 실행·조회·재개·정정을 분리합니다.

| API | 역할 | 핵심 경계 |
|---|---|---|
| `POST /api/drawing-jobs` | 파일 등록과 작업 생성 | 소유자, 공급자, 페이지, 예산, 저장소 준비도 검사 |
| `GET /api/drawing-jobs?jobId=...` | 작업·진행·보고서 조회 | 작업 ID와 소유권, 저장 JSON 무결성 |
| `POST /api/drawing-jobs/[jobId]/run` | 최초 전체 판독 실행 | 실행 잠금, VLM 예산, 원본 임대 |
| `POST /api/drawing-jobs/[jobId]/resume` | 중단·부분 작업 재개 | 누적 예산과 기존 역할 영수증 보존 |
| `POST /api/drawing-jobs/[jobId]/corrections` | 사용자 정정 반영 | 문서 버전, idempotency key, 실행 중 409 |

운영에서는 `DRAWING_JOB_STORE_DIR`의 공유 내구 볼륨과 안정적인 `DRAWING_SOURCE_LEASE_SECRET`이 필요합니다. 저장소가 준비되지 않으면 동기 경로가 성공한 것처럼 보이지 않고 503 또는 명시적 제한 상태를 반환합니다.

### 영수증·보고서

| API | 역할 |
|---|---|
| `GET /api/calculate/[id]` | 서버 검증 사용자 소유 계산 조회 |
| `GET /api/receipt/[id]` | 공개 또는 소유 계산 영수증 조회·해시 검증 |
| `GET /api/reports/[id]` | 공개 또는 소유 팀 검토 보고서 조회·해시 검증 |
| `POST /api/export` | PDF, XLSX, CSV 내보내기 |

### 상태와 계약

- `GET /api/health`: 공개 응답은 상태와 시각만 제공합니다. 올바른 `HEALTHCHECK_TOKEN`이 있을 때만 의존성 상세를 제공합니다.
- `GET /api/openapi`: 공개 핵심 API OpenAPI 3.1 스키마입니다.

## 인증·저장 기능

| 라우트 | 메서드 | 역할 |
|---|---|---|
| `/api/account/tier` | GET | 서버 정본 사용자 티어 |
| `/api/dashboard` | GET | 사용자 계산·프로젝트·알림 요약 |
| `/api/projects` | GET, POST | 프로젝트 목록·생성 |
| `/api/projects/[id]` | GET, PATCH, DELETE | 소유 프로젝트 조회·수정·삭제 |
| `/api/projects/shared/[token]` | POST | 공유 토큰으로 공개된 프로젝트 읽기 |
| `/api/community` | GET, POST | 질문 목록·작성 |
| `/api/community/[id]` | GET, POST | 질문 조회·답변 작성 |
| `/api/community/[id]/vote` | POST | 인증 사용자 투표 |
| `/api/notifications` | GET, POST, PATCH | 본인 알림 조회·생성·읽음 처리 |
| `/api/field/complete` | POST | 본인 현장 체크 완료 기록 |
| `/api/field/sos` | POST | 본인 안전 이벤트 기록. 긴급 서비스가 아님 |

## 결제

| 라우트 | 메서드 | 역할 |
|---|---|---|
| `/api/billing/status` | GET | 키·가격·웹훅·DB가 모두 준비됐는지 공개 상태 반환 |
| `/api/checkout` | POST | 서버 플랜 핸들로 Stripe Checkout 생성 |
| `/api/billing/portal` | POST | 서버에 결박된 Stripe customer로 구독 관리 세션 생성 |
| `/api/stripe/webhook` | POST | Stripe 서명 검증·이벤트 멱등 처리·DB 권한 반영 |

운영 활성화 전 Stripe 테스트 모드 전체 왕복을 검증해야 합니다. 순서는 `checkout → signed webhook → users tier 반영 → 새 세션 조회 → portal`입니다.

## 기타·운영·조건부 라우트

| 라우트 | 메서드 | 상태 |
|---|---|---|
| `/api/autocomplete` | GET | 검색 자동완성 |
| `/api/convert`, `/api/standard-convert` | POST | 단위·기준서 변환 |
| `/api/contact`, `/api/feedback` | POST | 문의·피드백 저장 또는 구성된 전달 경로 |
| `/api/analytics` | POST | 옵트아웃/DNT를 존중하는 분석 이벤트 수집 |
| `/api/rules/validate` | POST | 사용자 규칙셋 검증 |
| `/api/settings/onpremise-test` | POST | 관리자 허용 origin의 온프레미스 연결 시험 |
| `/api/settings/byok-test` | POST | same-origin 공급자별 고정 엔드포인트 연결 시험. 키는 요청 중에만 사용 |
| `/api/admin` | GET | Enterprise 관리자 전용 |
| `/api/benchmark` | GET | 개발/관리 토큰으로 제한된 운영 도구 |
| `/api/cron/crawl` | GET | 크롤링 인프라가 연결될 때만 사용하는 조건부 작업 |
| `/api/dev/drawing-fixture` | POST | 개발 환경 전용 도면 fixture 진입점. production에서는 거부 |
| `/api/review` | POST | UI 미노출 수동 파라미터 검토 API |
| `/api/calculate/batch` | POST | UI 미노출 배치 계산 API |
| `/api/notarize` | POST | 기본 비활성 IPFS 타임스탬프 등록 경로. 기존 경로명만 유지하며 블록체인·제3자 공증이 아님 |

UI 미노출 API는 구현·테스트가 존재해도 제품의 일반 사용자 기능으로 간주하지 않습니다. 휴면 상태와 활성 조건은 `docs/DORMANT_MANIFEST.md`에 기록합니다.

## 계약 변경 확인

문서 예시보다 현재 Route Handler와 `GET /api/openapi`를 우선합니다. 새 라우트나 요청 필드를 추가할 때는 이 문서, OpenAPI 공개 범위, `docs/project/IMPLEMENTATION_MAP.md`를 함께 갱신하십시오.
