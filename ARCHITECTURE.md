# ESVA 아키텍처

> 기준: 제품 코드 커밋 `ad7b91c` · 2026-07-23

이 문서는 현재 production 진입점과 신뢰 경계를 설명합니다. 파일 수, 페이지 수, 테스트 수처럼 자주 바뀌는 수치는 고정하지 않습니다. 기능별 실제 배선은 [구현 배선 지도](docs/project/IMPLEMENTATION_MAP.md)가 정본입니다.

## 1. 시스템 경계

ESVA는 네 층으로 나뉩니다.

```text
사용자·브라우저
      │
      ▼
App: Next.js 페이지·Route Handler·인증 경계
      │
      ├───────────────┐
      ▼               ▼
Agent: 도면 역할 심사·합의   Engine: 계산기·기준서·토폴로지
      │               │
      └───────┬───────┘
              ▼
Data/External: 정적 자료·파일 저장소·Supabase·AI·Stripe·Weaviate
```

`App`은 사용자가 도달하는 유일한 HTTP 진입점입니다. `Agent`는 비결정적 AI 판독을 근거 봉투와 그래프로 정규화합니다. `Engine`은 입력 계약을 통과한 결정론적 계산과 기준서 판정을 담당합니다. 외부 서비스가 없을 때 가능한 기능과 불가능한 기능을 분리해 실패해야 합니다.

## 2. 주요 디렉터리

| 경로 | 책임 | 정본 |
|---|---|---|
| `src/app/` | 페이지, Route Handler, 사용자 오류 표면 | 각 `page.tsx`, `route.ts` |
| `src/engine/calculators/` | 계산 함수, 입력 타입, 레지스트리 | `CALCULATOR_REGISTRY` |
| `src/engine/standards/` | 기준서 스냅샷, 조건 트리, 전용 판정기 | 레지스트리와 evaluator |
| `src/engine/topology/` | DXF·PDF 선·문자·연결 그래프 | 형식별 파서 |
| `src/agent/drawing/` | SLD V3 작업, 페이지·구획, 근거 그래프, 평가 게이트 | V3 문서 보고서 계약 |
| `src/agent/vision/` | 역할별 Vision 호출, 크롭, OCR 판정 | 역할 봉투와 source ID |
| `src/agent/electrical/` | 전기 연결, 경로, 보호, 계산 입력 교차검증 | 전기 합성 보고서 |
| `src/agent/teams/` | 계통도·평면도·기준서 분석과 합의 | 팀 결과·합의 계약 |
| `src/lib/` | AI 공급자, BYOK, 인증, 저장, 출력 필터, 보안 정책 | 기능별 모듈 |
| `supabase/migrations/` | DB 스키마, RLS, 결제·보고서 계약 | 적용 순서가 있는 SQL |
| `fixtures/` | 합성·공개 교보재, 라벨, 규칙셋 | 출처 README와 manifest |

## 3. 일반 질문과 계산 질문

홈, 검색, Studio의 무파일 질문은 공용 브라우저 클라이언트를 거쳐 `/api/chat`으로 들어갑니다.

```text
홈·검색·Studio
  → requestElectricalChat()
  → POST /api/chat
  → 서버 소유 시스템 지침
  → 계산 의도 판별
      ├─ 입력 완전: CALCULATOR_REGISTRY 실행
      │             → 계산 영수증을 모델과 UI에 전달
      └─ 입력 불완전: 수치 실행 없음
  → 공급자 스트림
  → 출력 필터
  → 계산 영수증 + 답변 표시
```

클라이언트는 시스템 지침을 지정할 수 없습니다. 서버가 답변 언어와 전기 직무 규칙을 구성하고, 사용자 질문은 대화 메시지로만 전달합니다. 계산기는 지원 의도가 식별되고 필수 입력이 완전하며 확신도 기준을 넘을 때만 실행됩니다.

공식 OpenAI 공급자는 Responses API 계약을 사용합니다. Groq, Ollama, LM Studio와 관리자 허용 온프레미스 OpenAI 호환 서버는 Chat Completions 계약을 사용합니다. 공급자·모델 목록은 `src/lib/ai-providers.ts`가 정본입니다.

## 4. 단일 계산과 영수증

일반 계산기 화면은 `/api/calculate`를 통해 레지스트리를 실행합니다.

```text
계산기 폼
  → calculatorId + 입력값 검증
  → 레지스트리 계산 함수
  → 공식·단계·단위·경고·판정
  → 계산 영수증과 SHA-256
  → 인증 환경이면 Supabase 저장
  → 소유권 또는 공개 범위 확인 후 재조회
```

계산 함수는 외부 AI를 호출하지 않습니다. 정확도와 허용오차는 계산기별 기준값과 도메인 불확실성에 따라 다르므로 범용 정확도 수치를 두지 않습니다.

## 5. 도면 분석

### 5.1 형식별 입력

- 이미지: 실제 픽셀을 전체·구획·업스케일·고대비 변형으로 준비해 Vision 역할에 보냅니다.
- DXF: 엔티티, 블록, 삽입 단위와 끝점을 읽습니다. `$INSUNITS` 또는 사용자 명시 단위가 없으면 물리 길이를 확정하지 않습니다.
- 벡터 PDF: 페이지별 선과 문자를 `pdfjs-dist`로 읽습니다. 래스터 전용 페이지는 벡터 분석 완료로 표시하지 않습니다.

### 5.2 SLD V3 전체 문서 판독

```text
파일 등록
  → 페이지 열거와 예산 계산
  → 전체 이미지·논리 구획 생성
  → symbols / connections / text / logic / coverage 역할 심사
  → Pxx-S/L/T/R 근거 번호
  → Pxx-A 구획, Pxx-C 경계선, Pxx-U 미확정 끝점
  → 전체선과 구획선 교차검증
  → 전기 공간 그래프 합성
  → 수량·관계·보호·계산·제안
  → COMPLETE / PARTIAL / HOLD 보고서
```

구획 crop은 경계 누락을 줄이기 위해 겹칠 수 있지만 논리 구획은 겹치지 않습니다. 경계에서 잘린 선은 부품으로 오인하지 않도록 `C` 또는 `U` 번호를 갖습니다. 최종 관계는 구획 결과를 단순 합산하지 않고 전체 도면 그래프에서 다시 연결하고 중복을 제거합니다.

도면에서 길이, 케이블 규격, 전압, 전류, 도체, 상, 역률이 유일한 근거로 결박된 경우에만 정본 계산기를 실행합니다. 누락 입력은 `SKIPPED` 또는 HOLD 영수증으로 남습니다.

### 5.3 평가와 95% 주장

구현 계약 테스트와 외부 정확도 주장은 분리합니다.

- V3 계약 게이트: 좌표, 관계 방향, strata, 서명 범위와 위조 저항을 검사합니다.
- 생산 benchmark: 체크인된 교보재를 실제 파서와 평가기로 왕복합니다.
- 외부 95% 게이트: 독립 라벨, 실제 예측, 공급자·모델별 반복, 최신 서명 영수증이 모두 있어야 합니다.

합성 fixture와 내부 테스트만으로 `verified95=true`를 만들 수 없습니다.

## 6. 저장과 복구

| 데이터 | 저장 위치 | 재조회 경계 |
|---|---|---|
| BYOK 암호화 키 | IndexedDB의 추출 불가능 `CryptoKey` | 같은 브라우저 프로필 |
| BYOK 암호문 | 브라우저 `localStorage` | 암호화 키가 함께 있어야 복호화 |
| SLD 원본 | 브라우저 IndexedDB 또는 암호화 원본 임대 | SHA-256과 소유자 일치 필요 |
| SLD V3 작업 | `DRAWING_JOB_STORE_DIR`의 원자적 JSON | 운영에서는 공유 내구 볼륨 필요 |
| 비로그인 팀 보고서 | 현재 브라우저 `sessionStorage` | 다른 세션 영구 보관을 약속하지 않음 |
| 로그인 영수증·보고서·프로젝트 | Supabase | Firebase UID, RLS, 소유권 확인 |
| 결제 권한 | Stripe 이벤트와 Supabase 티어 | 서명 웹훅과 멱등 원장이 정본 |

프로세스 메모리 폴백은 운영 영구 저장 성공으로 표시하지 않습니다.

## 7. 보안 경계

- Firebase ID 토큰은 서버에서 검증하고 대상 리소스 소유권을 다시 확인합니다.
- BYOK 평문은 요청 중 공급자 호출에만 사용하며 DB, 로그, 응답에 저장하지 않습니다.
- 온프레미스 URL은 관리자 origin 허용 목록을 통과해야 합니다.
- 채팅 시스템 지침은 서버가 소유하고 사용자 입력과 분리합니다.
- 파일 업로드는 형식, 크기, 페이지, 픽셀, 실행 시간 예산을 검사합니다.
- 레이트 리밋은 단일 프로세스 보호입니다. 다중 인스턴스 전역 제한은 외부 저장소나 신뢰 프록시가 필요합니다.
- 일반 영수증 SHA-256과 외부 평가 Ed25519 서명은 용도와 보증 수준이 다릅니다.

상세 정책과 알려진 공백은 [SECURITY.md](SECURITY.md)에 기록합니다.

## 8. 외부 서비스

| 서비스 | 용도 | 미설정 동작 |
|---|---|---|
| AI 공급자·온프레미스 | 채팅과 이미지 분석 | 결정론적 계산·로컬 검색만 사용 |
| Firebase | 로그인과 ID 토큰 | 익명 기능으로 제한 |
| Supabase | 영수증·보고서·프로젝트·알림 | 운영 저장 기능 비활성 또는 실패 |
| Weaviate | 벡터 검색 | 로컬 검색으로 폴백 |
| Stripe | 구독과 티어 | 준비도 검사 실패, 결제 UI 비활성 |
| Sentry | 오류 관측 | DSN이 없으면 no-op |
| Pinata/IPFS | 선택적 타임스탬프 | 기본 비활성 |

환경 변수 이름과 활성 조건은 [.env.example](.env.example)이 정본입니다.

## 9. 문서 정본

- 제품 사용 범위: [README.md](README.md), [사용자 가이드](docs/USER_GUIDE.md)
- API: [API_REFERENCE.md](docs/API_REFERENCE.md), `GET /api/openapi`
- 현재 배선: [IMPLEMENTATION_MAP.md](docs/project/IMPLEMENTATION_MAP.md)
- 구조 결정: [DECISIONS.md](docs/project/DECISIONS.md)
- 도면 실증: [VALIDATION_EVIDENCE.md](docs/VALIDATION_EVIDENCE.md)
- 현재 작업 상태: [PROJECT_STATE.md](PROJECT_STATE.md)
- 문서 분류와 역사 자료: [docs/README.md](docs/README.md)
