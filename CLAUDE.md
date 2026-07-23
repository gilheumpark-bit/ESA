# ESA — 프로젝트 작업 지침

ESA(Electrical Search Vertical AI)는 전기 엔지니어용 검색·계산·도면 검토 웹앱이다. 계산 결과나 AI 응답은 설계 승인 또는 법적 적합성 인증서가 아니다. 누락 입력, 확인하지 않은 규격 판본, 불충분한 도면 근거는 추정으로 채우지 말고 `HOLD`와 필요한 확인 항목으로 남긴다.

## 현재 제품 경계

- 계산기 레지스트리는 `src/engine/calculators/index.ts`, 고정 개수 계약은 `src/engine/calculators/count.ts`가 정본이다. 계산기마다 공식과 기준값이 다르므로 하나의 보편 정확도 수치를 주장하지 않는다.
- 기준서 데이터는 저장소 스냅샷이다. 공인 원문을 자동 동기화하지 않으며, 판본과 확인일이 없으면 `is_standard_current=false`다.
- 전문 검토는 계통도·평면도·기준서의 3개 전문팀과 별도 합의 단계로 구성된다. 합의 단계는 네 번째 독립 전문가가 아니다.
- 서로 다른 전문팀 두 곳 이상이 성공하지 않으면 합의를 완료로 표시하지 않는다.
- 계산 영수증과 팀 보고서는 SHA-256 무결성 검사를 제공한다. IPFS 공증은 기본 비활성이고 일반 영수증에 자동 적용되지 않는다.
- 계정 데이터와 영구 저장은 Firebase 인증 및 Supabase 마이그레이션이 필요하다. 운영 환경에서 알림·감사로그를 프로세스 메모리에 저장 성공으로 위장하면 안 된다.
- Stripe는 서버의 플랜 핸들, 서명 검증 웹훅, 멱등 DB 함수가 정본이다. 실제 테스트 모드 왕복 전에는 결제 운영 완료를 주장하지 않는다.
- **실증(교보재 검증) 이력의 정본은 `docs/VALIDATION_EVIDENCE.md` 원장이다.** 도면 파이프라인·계산기의 "실증이 없다/필요하다"는 판단은 원장의 앵커(커밋 SHA·fixtures·게이트 명령)를 확인·재실행한 뒤에만 한다. 앵커 재실행이 red면 그것은 실증 부재가 아니라 회귀이며, 전후 차분으로 원인 커밋을 찾는다.

## 핵심 구조

```text
src/app/                  Next.js 16 App Router 페이지와 Route Handler
src/engine/calculators/   결정론적 계산기와 레지스트리
src/engine/standards/     KEC·NEC·IEC·JIS·NER·ESA 스냅샷과 평가기
src/engine/topology/      DXF/PDF 벡터 파서와 토폴로지
src/agent/                입력 분류, 전문팀, 토론, 합의, 보고서
src/lib/                  인증·저장·결제·AI 공급자·보안 경계
supabase/migrations/      PostgreSQL/RLS/결제·보고서 계약
docs/                     사용자·검증·운영 문서
```

### 전문팀 실행

1. `src/agent/orchestrator.ts`가 입력을 분류하고 필요한 전문팀을 선택한다.
2. `sld-team.ts`, `layout-team.ts`, `standards-team.ts`가 서로 다른 근거를 산출한다.
3. `consensus-team.ts`는 성공한 전문팀 결과의 출처와 충돌을 확인해 보고서를 만든다.
4. 이미지 요청의 BYOK 키는 요청 중에만 VLM 호출로 전달하고 보고서·로그·DB에 넣지 않는다.

### 도면 분석 스택

- 이미지: `sharp`로 방향 정규화·실제 크롭 → OpenAI/Gemini/Claude Vision → 엄격한 JSON·좌표·연결 검증 → 중복 병합.
- DXF: `dxf-parser`로 엔티티와 블록을 읽고 `$INSUNITS` 또는 사용자가 명시한 스케일만 물리 길이로 사용한다.
- PDF: `pdfjs-dist`로 선택 페이지의 벡터 선·문자를 읽는다. 래스터 전용 PDF는 벡터 분석 성공으로 표시하지 않는다.
- 물리량: 픽셀 간격으로 길이·전압·전류·도체 굵기를 추정하지 않는다. 도면 표기, DXF 단위, 또는 사용자 입력이 없으면 `HOLD`다.
- 결과: 기기·연결·고립 노드·가정·규격 근거를 전문팀이 교차 검토하고 보고서 해시를 저장한다.

## 기술 스택

| 영역 | 정본 |
|---|---|
| 프레임워크 | Next.js 16, React 19, TypeScript strict |
| UI | Tailwind CSS 4, 프로젝트 CSS 토큰, Lucide 아이콘 |
| 인증 | Firebase ID token을 서버에서 검증 |
| DB | Supabase PostgreSQL + RLS + service-role 서버 경계 |
| 결제 | Stripe Checkout·Billing Portal·서명 웹훅 |
| AI | Vercel AI SDK 및 직접 Vision 호출, BYOK 지원 |
| 벡터 검색 | `weaviate-client` v3, 미설정 시 로컬 검색 |
| 도면 | `dxf-parser`, `pdfjs-dist`, `sharp` |
| 테스트 | Jest 30, TypeScript, ESLint, Next production build |

AI 모델 목록은 `src/lib/ai-providers.ts`가 정본이다. 모델 ID·가격·종료 일정은 바뀔 수 있으므로 수정 전 공급자 공식 문서를 확인하고, 문서에 모델 목록을 복제하지 않는다.

## 구현 규칙

- 사용자 입력과 외부 응답을 타입 단언으로 신뢰하지 않는다. 배열 크기, 문자열 길이, 수치 범위, ID 연결성을 경계에서 검증한다.
- 인증은 브라우저가 보낸 `userId`나 JWT payload 디코딩만으로 통과시키지 않는다. 서버 검증 UID와 대상 소유권을 함께 확인한다.
- URL 프록시는 정확한 origin 허용 목록을 사용하고 사용자정보 포함 URL, 우회 IP, 임의 사설 주소를 차단한다.
- BYOK 원문은 로그·응답·DB·`localStorage`에 저장하지 않는다. 브라우저 저장은 IndexedDB의 추출 불가능한 `CryptoKey`와 AES-GCM 암호문을 사용한다.
- AI 출력의 근거 없는 숫자와 안전 단정은 출력 필터를 우회하지 않는다.
- 도면의 물리 단위가 불명확하면 기본 `mm`나 임의 길이를 넣지 않는다.
- API 오류 응답에 내부 예외, 환경 변수, 공급자 응답 전문, 키를 노출하지 않는다.
- 새 API는 인증, 소유권, same-origin/CSRF, 크기 제한, rate limit, 타임아웃, 실패 응답을 검토한다.
- UI는 기존 토큰과 컴포넌트를 사용한다. 이모지·가짜 통계·빈 버튼·placeholder 링크를 사용자 표면에 두지 않는다.
- 기존 사용자 변경을 덮어쓰거나 테스트를 약화해 green을 만들지 않는다.

## 검증

변경 반경에 맞는 테스트를 먼저 실행하고, 출고 전에는 아래를 파이프 없이 각각 확인한다.

```bash
npx tsc --noEmit
npm run lint -- --max-warnings=0
npm test -- --runInBand
npm run build
npm run gate:pdf
```

Windows 전체 게이트:

```powershell
pwsh -NoProfile -File scripts/enforce.ps1
```

`exit 0`을 직접 확인하지 않은 검사를 통과했다고 쓰지 않는다. 외부 Stripe·Supabase·Weaviate·AI 키가 없는 환경에서는 코드·모의 계약 검증과 실제 서비스 왕복을 분리해 보고한다.

## 문서 정본

- 문서 분류와 읽는 순서: `docs/README.md`
- 사용 범위와 배포 경계: `README.md`, `docs/USER_GUIDE.md`
- 공개 핵심 API: `docs/API_REFERENCE.md`, `GET /api/openapi`
- 도면 검증 범위: `docs/DRAWING_VALIDATION_RESULT.md`
- 휴면 모듈: `docs/DORMANT_MANIFEST.md`
- 현재 작업 인수인계: `PROJECT_STATE.md`가 존재하면 Git 상태와 먼저 대조한다.
