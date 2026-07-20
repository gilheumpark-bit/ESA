---
schemaVersion: 1
project: ESA
status: active
baselineBranch: codex/sld-v3-completion
codeBaselineCommit: 419273e8b69f1323e8ad359fc3f698ecf4eab461
updatedAt: 2026-07-21T05:01:09.3417634+09:00
trigger: architecture
changedDomains: [agent, app, components, engine, lib]
---

# 2026-07-21 SLD V3 §1–15 구현 인수인계

## 변경

- 전체 문서 판독의 페이지 준비, 역할별 심사, 공간 근거, 관계·수량·계산·제안, 작업 복구와 사용자 정정을 하나의 V3 생산 흐름으로 연결했다.
- 외부 실도면 95% 주장은 구현 통과와 분리하고 독립 라벨·실제 3회 실행·서명된 평가 지표가 없으면 계속 비활성화한다.

## 이유

- 일부 기호나 문자만 나열하는 분석으로는 현직자가 요구하는 전체 수량, 케이블 연결 관계, 누락 여부와 전기 논리의 추적 가능한 설명을 만들 수 없다.
- 장시간 도면 분석은 프로세스 재시작, 취소, 부분 실패, 중복 정정에도 결과와 원본 임대를 일관되게 보존해야 한다.

## 사용자 소유 변경

- 회사 도면, 운영 자격증명, 외부 AI 키, 운영 DB와 실결제 데이터는 읽거나 커밋하지 않았다.
- 브라우저 실증에는 저장소의 비민감 합성 DXF만 사용했고 임시 복사본은 검증 뒤 제거했다.

## 기준선

- 브랜치: `codex/sld-v3-completion`
- 코드 기준 커밋: `419273e8b69f1323e8ad359fc3f698ecf4eab461`
- 상세 절·수용기준: `docs/project/SLD_V3_TRACEABILITY.md`

## 완료

### 연결된 생산 흐름

`/tools/sld` 전체 문서 업로드 → `POST /api/drawing-jobs` 작업·암호화 원본 임대 생성 → `/{jobId}/run` → 요청 페이지 예산 내 준비 → 벡터 파서 또는 역할 분리 Vision 심사 → coverage ledger·공간 근거 그래프 → 페이지 간 관계·수량·정격·계산·근거 기반 제안 → V3 보고서 → GET 폴링·새로고침 복구 → PARTIAL 페이지만 resume 또는 근거 정정.

### 이번에 닫은 독립 리뷰 결함

- 프로세스 Map 작업/원본: 공유 내구 디렉터리의 원자적 JSON과 AES-256-GCM 임대로 전환. 운영 미설정은 503.
- 준비 뒤 취소 소실·취소 결과 COMPLETE 제목: 취소 신호를 보존하고 CANCELLED 영수증을 회귀 검증.
- 결과 일부만 있어도 벡터 5역할 완료: 역할별 `vectorAudit` 없으면 PARTIAL.
- PDF 최대 500페이지 선렌더: 요청 페이지·페이지 수·총 픽셀·시간·취소 예산 순차 처리.
- 부분 판독에서 접지/보호/고아 부재 확정: coverage 미완료 시 HOLD.
- PT/PPT 부분문자 병합, 모호 페이지 참조, 전압 누락 자동 연결: 엄격 종류·확정 OCR·양쪽 전압·방향 조건으로 교체.
- 중복 선의 종류 무시·불안정 내부 ID·BOUNDARY 누락 0: lineKind 분리, 기하 해시 ID, 누락 의심 보정.
- 확장자만 맞는 가짜 파일·개인 응답 캐시: magic bytes 검증과 `private, no-store`.
- 정정 중복·경쟁·종류 혼합: idempotency, 문서 버전 CAS, text/type/label 분리, 전후 계산 영수증.
- 평가기의 문자 무공간·관계 무방향·통과 불리언 신뢰·3회 숫자 위조: 공간/방향 재계산, 실제 반복 영수증, 서명 지표 재판정.
- PDF/DXF 전체 문자를 내부에서만 읽고 버림: 모든 파서 좌표 문자를 V3 근거 그래프로 전달.
- 장시간 POST만 대기: 1.5초 GET 폴링, 작업 상태 노출, sessionStorage 작업 ID 복구.

## 부분 완료

- V3 95% 평가 실행기와 서명 게이트는 생산 코드에 연결됐지만 현장 데이터가 없어 배지는 계속 false다.
- 공유 내구 디렉터리는 로컬·Docker 볼륨 계약까지 확인했다. 실제 다중 인스턴스 스테이징 장애 전환은 운영 자격증명 준비 후 검증한다.

## 미검증

- 독립 라벨링한 real-adjudicated 현장 도면에서 공급자별 정확도·비용·timeout.
- 새 서버 인스턴스가 기존 진행 작업을 조회하고 resume하는 스테이징 왕복.
- 운영 키 회전 중 기존 암호화 임대 만료·정리 절차.

## 보류

- `verified95` 활성화는 실도면 독립 라벨, 공급자·모델별 3회 실행, 모든 strata 통과, 승인 Ed25519 키가 없으므로 HOLD다.
- 회사 기밀 도면, 운영 DB, 실결제, 외부 AI 키는 이번 검증에 사용하지 않았다.

## 검증

- `pwsh -NoProfile -File scripts/enforce.ps1`: exit 0.
- TypeScript·ESLint 경고 0.
- Jest: 132 suites, 1,081 tests PASS.
- Next.js 16.2.10 production build: 64 route entries, compile/type/static generation PASS.
- PDF fixture gate: 9/9 PASS.
- V3 전용: 20 suites, 65 tests PASS.
- topology: 5 suites, 77 tests PASS.
- `npm run gate:sld-v3-contract`: 5/5 PASS.
- 브라우저: 저장소 미설정 503 fail-closed; 로컬 샌드박스 DXF COMPLETE, 1페이지·구획 1/1·미확정 0; 새로고침 복구; 390px 전역 가로 넘침 0.

## 현실 증거 경계

- `verified95`는 구현돼 있지만 활성화하지 않았다. 독립 라벨링한 real-adjudicated 실도면, 동일 공급자·모델 데이터셋별 3회 실행, 모든 필수 strata 95% 이상, Ed25519 영수증이 필요하다.
- 공개 교보재 PDF 실측은 회사 자료가 아니며 PARTIAL/HOLD 정직성 확인 용도다. 현장 정확도 점수로 사용하지 않는다.
- 운영 배포자는 `DRAWING_JOB_STORE_DIR`, `DRAWING_SOURCE_LEASE_SECRET`, `SLD_V3_EVAL_*`를 실제 인프라·키에 연결해야 한다.

## 다음 첫 행동

1. 기밀을 제거한 대표 실도면을 이중 라벨링하고 불일치 합의본을 만든다.
2. 공급자·모델별 `runBenchmarkSuite`를 데이터셋마다 3회 실행해 suite receipt를 생성한다.
3. 운영 공유 볼륨과 키를 설정한 스테이징에서 업로드→중단→새 인스턴스 GET→resume→정정 CAS 왕복을 재현한다.
