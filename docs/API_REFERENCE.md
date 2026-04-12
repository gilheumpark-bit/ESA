# ESVA API Reference

> 전체 API 스펙은 `/api/openapi`에서 OpenAPI 3.1 JSON으로도 확인 가능합니다.

---

## 공통 규약

### 응답 형식
모든 API는 일관된 JSON 형식을 사용합니다:

```json
// 성공
{ "success": true, "data": { ... } }

// 실패
{ "success": false, "error": { "code": "ESVA-4003", "message": "..." } }
```

### 에러 코드 체계
| 범위 | 카테고리 |
|------|----------|
| ESVA-1xxx | 인증/권한 |
| ESVA-2xxx | 플랜/제한 |
| ESVA-3xxx | 검색 |
| ESVA-4xxx | 계산 |
| ESVA-5xxx | 내보내기 |
| ESVA-6xxx | 외부 서비스 (LLM/IPFS) |
| ESVA-7xxx | 표준 변환 |
| ESVA-9xxx | 시스템 |

### 레이트리밋
| 엔드포인트 | 한도 |
|-----------|------|
| /api/chat | 20 req/min |
| /api/search | 30 req/min |
| /api/calculate | 60 req/min |
| /api/sld, /api/dxf | 10 req/min |

### 인증 (선택)
- Firebase ID Token: `Authorization: Bearer <token>`
- BYOK API 키: 요청 body의 `apiKey` 필드

---

## 엔드포인트

### POST /api/calculate
계산기 실행 + 영수증 생성.

**Request:**
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
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "result": {
      "value": 2.45,
      "unit": "%",
      "formula": "VD = √3 × I × L × R / V × 100",
      "steps": [...]
    },
    "receipt": {
      "id": "...",
      "hash": "sha256:...",
      "standardRef": "KEC 232.52"
    },
    "relatedCalculators": [...]
  }
}
```

### POST /api/search
AI 법규 검색 (MainAgent 경유).

**Request:**
```json
{
  "query": "KEC 232.52 전압강하",
  "countryCode": "KR",
  "provider": "gemini",
  "model": "gemini-2.5-flash"
}
```

### POST /api/chat
LLM 스트리밍 채팅 (SSE).

**Request:**
```json
{
  "messages": [{ "role": "user", "content": "전압강하 3% 이하 조건" }],
  "provider": "openai",
  "model": "gpt-4.1-mini"
}
```

### POST /api/team-review
4-Team 설계 리뷰.

**Request (JSON):**
```json
{
  "query": "22.9kV 수전설비 전압강하 검토",
  "projectName": "OO빌딩 수변전설비",
  "params": { "voltage_V": 380, "totalLength_m": 50 }
}
```

**Request (Multipart):**
- `file`: DXF/PDF/이미지 파일
- `projectName`: 프로젝트명
- `projectType`: 설비 유형

### POST /api/sld
SLD 도면 분석 (VLM).

### POST /api/dxf
DXF 벡터 파싱 (API 키 불필요).

### POST /api/export
영수증 내보내기 (PDF/Excel/CSV).

### GET /api/health
의존성 헬스체크 대시보드.

### GET /api/openapi
OpenAPI 3.1 스펙 (자동 생성).

---

*ESVA API v1.0*
