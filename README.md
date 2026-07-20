<p align="center">
  <img src="public/logo.svg" alt="ESVA 로고" width="80" />
</p>

<h1 align="center">ESVA — Electrical Search Vertical AI</h1>

<p align="center">
  전기 엔지니어가 계산 근거를 다시 확인할 수 있는 검색·계산·도면 검토 작업대
</p>

<p align="center">
  <a href="https://github.com/gilheumpark-bit/ESA/actions"><img alt="CI" src="https://github.com/gilheumpark-bit/ESA/actions/workflows/ci.yml/badge.svg" /></a>
  <a href="https://github.com/gilheumpark-bit/ESA/blob/main/LICENSE"><img alt="License: CC BY-NC 4.0" src="https://img.shields.io/badge/License-CC%20BY--NC%204.0-lightgrey.svg" /></a>
  <img alt="Node" src="https://img.shields.io/badge/Node-%3E%3D20.9-green.svg" />
  <img alt="Calculators" src="https://img.shields.io/badge/Calculators-57-orange.svg" />
</p>

## 현재 상태

ESVA v0.2.0은 오픈 베타입니다. 계산 엔진과 로컬 기준서 탐색은 외부 AI 없이 사용할 수 있습니다. AI 검색, 계정 데이터, 결제, 벡터 검색처럼 외부 서비스에 의존하는 기능은 배포 환경의 키와 인프라가 있어야 작동합니다.

ESVA는 설계 승인 도구나 법적 적합성 인증서가 아닙니다. 계산 결과와 기준서 인용은 입력값·판본·관할 조건을 확인한 뒤 기술사 또는 책임 엔지니어가 최종 검토해야 합니다.

## 무엇이 실제로 작동하나

| 영역 | 상태 | 조건과 경계 |
|---|---|---|
| 엔지니어링 계산기 | 사용 가능 | 레지스트리에 등록된 57개 계산기. 각 계산기별 공식·입력 계약·기준값 테스트를 사용하며, 모든 계산기에 하나의 보편 정확도 수치를 주장하지 않습니다. |
| 기준서 탐색·판정 | 사용 가능 / 일부 HOLD | 저장소의 특정 판본 스냅샷을 검색합니다. 공인 원문의 최신 개정을 자동 동기화하지 않습니다. 근거값이나 전용 평가기가 부족하면 PASS 대신 HOLD를 반환합니다. |
| AI 검색·채팅 | 조건부 | 서버 공급자 키 또는 사용자의 BYOK 키가 필요합니다. 출력 필터가 근거 없는 수치·안전 단정 표현을 차단하거나 보류시킬 수 있습니다. |
| 도면 분석 | 조건부 | DXF와 벡터 PDF는 결정론적 파서를 사용합니다. 스캔 PDF·복잡한 CAD·불완전 블록은 누락될 수 있습니다. 이미지 도면 분석에는 지원 AI 공급자 키가 필요합니다. |
| 전문팀 검토 | 조건부 | 계통도·평면도·기준서 3개 전문 분석 단계 뒤 별도 합의 단계가 결과를 종합합니다. 서로 다른 전문팀 2개 이상이 성공하지 않으면 합의 완료로 표시하지 않습니다. |
| 영수증·보고서 | 사용 가능 | 계산 입력·출력·공식·판본 메타데이터와 SHA-256 무결성 해시를 기록합니다. 공개 여부와 소유권을 분리해 검사합니다. |
| 프로젝트·커뮤니티·히스토리 | 조건부 | Firebase 인증과 Supabase 스키마·서비스 역할 키가 필요합니다. 미설정 환경에서는 로그인·영구 저장 기능이 제한됩니다. |
| 벡터 검색 | 조건부 | Weaviate가 없거나 연결되지 않으면 로컬 검색으로 폴백합니다. |
| 결제·구독 | 배포 전 검증 필요 | Stripe 키·가격·서명 검증 웹훅·실제 테스트 모드 왕복이 모두 준비된 배포에서만 활성화해야 합니다. |
| 알림 | 일부 | 인앱 알림은 지원합니다. 이메일·푸시 선택지는 발송 인프라가 연결되기 전에는 전달되지 않습니다. |
| IPFS 타임스탬프 등록 | 기본 비활성 | 익명화·최소화된 영수증을 IPFS에 고정하고 서버 레지스트리에 시각을 기록하는 조건부 기능입니다. 블록체인 거래나 제3자 공증이 아니며, `RECEIPT_NOTARIZE`를 켜기 전 개인정보·삭제·Pinata 왕복 검증이 필요합니다. |

## 핵심 흐름

```text
질문/도면/계산 입력
        │
        ├─ 결정론적 계산 엔진 ── 입력 검증 ── 계산 영수증
        │
        ├─ 기준서 스냅샷 ────── 전용 평가기 또는 HOLD
        │
        └─ 3개 전문 분석 ────── 합의 단계 ── 검토 보고서
                                      │
                         경고·가정·근거·사람 검토 필요 표시
```

합의 단계는 네 번째 독립 전문가가 아닙니다. 세 전문 분석 결과의 출처와 성공 여부를 확인한 뒤 충돌을 정리하는 별도 단계입니다.

## BYOK 보안 경계

브라우저에 저장한 공급자 키는 Web Crypto AES-GCM으로 암호화됩니다. 암호화 키는 IndexedDB의 추출 불가능한 `CryptoKey`로 보관하고, 원문 API 키를 `localStorage`에 저장하지 않습니다.

AI 요청 시에는 브라우저가 키를 복호화해 TLS 연결로 ESVA 서버에 전달하고, 서버가 선택한 공급자 호출에 일시 사용합니다. ESVA 애플리케이션은 이 원문 키를 데이터베이스나 서버 로그에 저장하지 않지만, “키가 서버를 전혀 통과하지 않는다”는 구조는 아닙니다. 공용 PC에서는 사용 후 키를 삭제하고 브라우저 프로필을 분리하십시오.

## 로컬 실행

요구 사항: Node.js 20.9 이상, npm, 선택적으로 Firebase·Supabase·AI 공급자 계정.

```bash
git clone https://github.com/gilheumpark-bit/ESA.git
cd ESA
npm ci
cp .env.example .env.local
npm run dev
```

Windows PowerShell에서는 다음을 사용합니다.

```powershell
Copy-Item .env.example .env.local
npm run dev
```

브라우저에서 `http://localhost:3000`을 엽니다. 외부 서비스 없이도 계산기와 로컬 데이터 기반 화면을 먼저 확인할 수 있습니다.

## 환경 설정

정본은 [.env.example](.env.example)입니다.

| 목적 | 주요 환경 변수 |
|---|---|
| AI 공급자 | `GOOGLE_GENERATIVE_AI_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `DEEPSEEK_API_KEY`, `MISTRAL_API_KEY`, `GROQ_API_KEY` |
| 인증 | `NEXT_PUBLIC_FIREBASE_*`, `FIREBASE_*` |
| 영구 저장 | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` |
| 벡터 검색 | `WEAVIATE_URL`, `WEAVIATE_API_KEY`, `EMBEDDING_PROVIDER` |
| 결제 | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, 가격 ID |
| 온프레미스 AI | `ONPREMISE_ALLOWED_ORIGINS` |
| 운영 진단 | `HEALTHCHECK_TOKEN`, `INTERNAL_API_SECRET` |

서비스 역할 키와 웹훅 시크릿은 `NEXT_PUBLIC_*` 이름으로 만들거나 클라이언트 번들에 넣으면 안 됩니다. `.env.local`은 Git에서 제외됩니다.

## 검증 명령

```bash
npm test -- --runInBand
npm run lint -- --max-warnings=0
npx tsc --noEmit
npm run build
npm run gate:pdf
```

테스트 개수는 기능 변경에 따라 달라지므로 README에 고정 수치로 복제하지 않습니다. CI 결과와 현재 실행 로그를 근거로 판단하십시오.

## 주요 디렉터리

```text
src/app/                 페이지와 API 라우트
src/engine/calculators/  결정론적 계산기
src/engine/standards/    기준서 스냅샷과 평가기
src/engine/topology/     DXF/PDF 토폴로지 파서
src/agent/               전문 분석·토론·합의
src/lib/                 인증, 저장, 검색, 내보내기, 보안 경계
supabase/migrations/     배포용 데이터베이스 계약
docs/                    사용자·검증·운영 문서
```

## 알려진 배포 의존성

- 인메모리 레이트 리밋은 단일 프로세스 보호 장치입니다. 다중 인스턴스 운영에서는 신뢰 가능한 프록시 또는 공유 저장소 기반 제한이 추가로 필요합니다.
- Supabase 마이그레이션 파일이 존재해도 대상 DB에 실제 적용됐다는 뜻은 아닙니다. 배포마다 마이그레이션 상태와 RLS를 확인해야 합니다.
- Stripe 구독 권한은 브라우저 리다이렉트가 아니라 서명 검증 웹훅과 DB 상태를 정본으로 삼아야 합니다.
- 규격 스냅샷의 `is_standard_current`는 공인 원문과 판본 확인일이 없으면 안전하게 `false`입니다.

## 라이선스

[CC BY-NC 4.0](LICENSE). 상업적 사용에는 별도 허가가 필요합니다.
