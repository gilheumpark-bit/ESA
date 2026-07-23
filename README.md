<p align="center">
  <img src="public/logo.svg" alt="ESVA 로고" width="80" />
</p>

# ESVA

ESVA(Electrical Search Vertical AI)는 전기 직무자가 질문, 계산, 기준서 탐색, 도면 검토를 한 작업 흐름에서 처리하도록 만든 웹 애플리케이션입니다. 계산식과 입력, 도면 근거, 보류 사유를 다시 확인할 수 있게 하는 것이 목적입니다.

현재 저장소 버전은 `0.2.0`입니다. 공개·합성 교보재를 사용한 내부 검증 단계이며, 설계 승인 도구나 법적 적합성 인증서가 아닙니다. 운영 데이터베이스, 결제, 외부 AI 품질은 배포 환경에서 별도로 검증해야 합니다.

## 현재 제공 범위

| 영역 | 상태 | 확인해야 할 경계 |
|---|---|---|
| 결정론적 계산기 | 사용 가능 | 계산기 레지스트리의 입력 계약과 기준값 테스트를 사용합니다. 모든 계산기에 하나의 공통 정확도 수치를 적용하지 않습니다. |
| AI 질문·답변 | 조건부 사용 가능 | 서버 키, BYOK 또는 허용된 온프레미스 모델이 필요합니다. 완전한 계산 질문은 AI가 임의 계산하지 않고 ESVA 계산기를 먼저 실행합니다. |
| 기준서 탐색·판정 | 사용 가능, 일부 HOLD | 저장소에 포함된 판본 스냅샷을 검색합니다. 공인 원문 최신 개정 자동 동기화가 아닙니다. |
| 이미지·DXF·PDF 도면 분석 | 조건부 사용 가능 | 벡터 파서와 역할별 이미지 분석을 구분합니다. 저해상도, 스캔 PDF, 커스텀 CAD 블록, 불완전한 결선은 HOLD가 될 수 있습니다. |
| SLD 전체 문서 판독 | 사용 가능 | 전체 페이지와 구획을 분석한 뒤 경계선 `C`, 미확정 끝점 `U`를 추적하고 전체 그래프에서 중복을 제거합니다. 외부 독립 라벨 기준 95% 달성은 아직 주장하지 않습니다. |
| 보고서·영수증 | 사용 가능 | 입력, 결과, 근거와 SHA-256 무결성 정보를 기록합니다. 일반 영수증 해시는 제3자 공증이나 법적 서명이 아닙니다. |
| 프로젝트·공유·커뮤니티·현장 기록 | 배포 환경 의존 | Firebase 인증과 Supabase 스키마가 필요합니다. |
| 결제·구독 | 운영 전 검증 필요 | Stripe 테스트 모드의 Checkout, 서명 웹훅, 티어 반영, 새 세션 조회까지 닫혀야 합니다. |
| 이메일·푸시, IPFS 타임스탬프 | 비활성 또는 휴면 | 인앱 기록과 설정만으로 발송·공증을 주장하지 않습니다. |

## AI가 계산을 처리하는 방식

완전한 계산 질문은 다음 순서로 처리됩니다.

```text
사용자 질문
  → 계산 의도와 필수 입력 확인
  → ESVA 계산기 레지스트리 실행
  → 입력·공식·결과 영수증 생성
  → 영수증을 AI 모델에 전달
  → 영수증과 답변을 화면에 표시
```

필수 입력이 없거나 파서 확신도가 낮으면 계산기를 실행하지 않습니다. AI는 빠진 입력과 실행할 계산기만 안내해야 하며 임의 수치로 적합 판정을 만들면 안 됩니다. `npm run gate:chat-live`는 production 서버에서 전압강하 계산을 실제 실행하고, 같은 영수증이 모델 입력과 사용자 응답에 전달되는지 검사합니다.

## 도면 분석 범위

검증 자료는 회사 기밀 도면이 아니라 저장소에 출처를 기록한 공개 PDF·이미지와 비민감 합성 DXF입니다. 현재 목표는 이 교보재 수준의 단선도·평면도에서 기호, 문자, 연결선, 상하류 관계, 수량과 누락 후보를 빠짐없이 구조화하는 것입니다.

도면 판독은 다음 순서로 진행됩니다.

1. 파일 형식과 전체 페이지를 열거합니다.
2. 전체 이미지와 겹침이 있는 정밀 구획을 분석합니다.
3. 기호, 문자, 연결, 논리를 서로 다른 역할로 판독합니다.
4. 구획 경계 선과 미확정 끝점에 추적 번호를 부여합니다.
5. 전체 도면 그래프에서 구획 결과를 다시 합치고 중복과 오병합을 제거합니다.
6. 입력 근거가 완전할 때만 정본 계산기를 실행합니다.
7. 확인, 추정, 미확인과 사용자 검토 항목을 보고서로 냅니다.

교보재와 재실행 명령은 [실증 증거 원장](docs/VALIDATION_EVIDENCE.md), 현재 한계는 [도면 검증 결과](docs/DRAWING_VALIDATION_RESULT.md)에 기록합니다.

## 로컬 실행

요구 사항은 Node.js 20.9 이상과 npm입니다. 외부 AI, 인증, 저장, 결제 기능은 해당 서비스 설정이 있을 때만 작동합니다.

```bash
git clone https://github.com/gilheumpark-bit/ESA.git
cd ESA
npm ci
cp .env.example .env.local
npm run dev
```

Windows PowerShell에서는 환경 파일을 다음과 같이 복사합니다.

```powershell
Copy-Item .env.example .env.local
npm run dev
```

브라우저에서 `http://localhost:3000`을 엽니다. 비밀값은 `.env.local`에만 넣고 Git에 커밋하지 마십시오.

## 검증

```bash
npm run check:docs
npx tsc --noEmit --incremental false
npm run lint -- --max-warnings=0
npm test -- --runInBand
npm run build
npm run gate:pdf
npm run gate:chat-live
```

도면 V3 계약과 외부 95% 주장 게이트는 목적이 다릅니다.

```bash
npm run gate:sld-v3-contract
npm run test:sld-benchmark
npm run gate:sld-golden
```

`gate:sld-golden`은 승인된 독립 라벨, 예측, 서명 키가 없으면 의도적으로 실패합니다. 실패를 구현 회귀와 95% 주장 자격 부족으로 구분해 영수증을 확인해야 합니다.

## 저장소 구조

```text
src/app/                  사용자 페이지와 API 진입점
src/engine/calculators/   결정론적 계산기와 입력 계약
src/engine/standards/     기준서 스냅샷과 판정기
src/engine/topology/      DXF·PDF 벡터와 연결 그래프
src/agent/                도면 역할 심사, 전기 합성, 합의, 보고서
src/lib/                  AI 공급자, 인증, 저장, 보안, 내보내기
supabase/migrations/      PostgreSQL·RLS·결제·보고서 계약
fixtures/                 합성·공개 교보재와 독립 라벨
docs/                     사용자, 검증, 구조, 인수인계 문서
```

구조와 신뢰 경계는 [ARCHITECTURE.md](ARCHITECTURE.md), 문서별 정본 여부와 읽는 순서는 [문서 지도](docs/README.md)를 참조하십시오.

## 배포 전 확인

- Supabase 마이그레이션 파일의 존재는 대상 DB 적용 완료를 뜻하지 않습니다.
- 인메모리 레이트 리밋은 단일 프로세스 보호 장치입니다.
- 기준서 판정은 관할 기관의 현행 원문 확인을 대체하지 않습니다.
- 실제 외부 모델 품질은 공급자, 모델, 도면, 반복 실행별로 따로 평가해야 합니다.
- SLD `verified95`는 승인된 외부 평가 영수증이 없으면 항상 비활성입니다.

## 문서와 라이선스

- 사용자 절차: [docs/USER_GUIDE.md](docs/USER_GUIDE.md)
- API 계약: [docs/API_REFERENCE.md](docs/API_REFERENCE.md), `GET /api/openapi`
- 현재 구현 상태: [PROJECT_STATE.md](PROJECT_STATE.md)
- 기여 절차: [CONTRIBUTING.md](CONTRIBUTING.md)
- 보안 정책: [SECURITY.md](SECURITY.md)

라이선스는 [CC BY-NC 4.0](LICENSE)입니다. 상업적 사용에는 별도 허가가 필요합니다.
