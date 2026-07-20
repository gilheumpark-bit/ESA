# SLD V3 §1–15 구현 추적표

기준 설계는 `docs/superpowers/specs/2026-07-21-sld-full-reading-proposal-95-design.md`다. 이 표의 `완료`는 생산 호출과 자동 검증이 연결됐다는 뜻이며, 현장 정확도 95%를 뜻하지 않는다.

## 설계 절별 배선

| 절 | 생산 진입과 구현 | 주 검증 | 상태 |
|---|---|---|---|
| §1 목표·완료 정의 | `document-orchestrator.ts` → `drawing-document-report.ts`가 페이지·구획·미확정 항목을 합산하고 COMPLETE/PARTIAL을 결정 | `document-orchestrator.test.ts`, `drawing-document-report.test.ts` | 완료 |
| §2 역할 분리 | `drawing-council.ts`가 symbols, connections, text, logic을 별도 호출하고 `sld-team.ts`가 봉투를 합산 | `drawing-council.test.ts`, `sld-team-independent-review.test.ts` | 완료 |
| §3 전체·정밀 스캔 | `drawing-source.ts`가 이미지·PDF·DXF를 준비하고 전체 이미지와 4/9/16 정밀 구획을 실행한다. PDF는 요청 페이지·총 픽셀·시간·취소 예산 안에서만 순차 렌더한다 | `drawing-source.test.ts`, `drawing-council.test.ts`, 실PDF 18페이지 왕복 | 완료 |
| §4 OCR·사용자 수정 | original, 4x, high-contrast의 서로 다른 호출만 3중 판독으로 인정한다. PDF/DXF의 전체 좌표 문자를 근거 그래프에 전달하고, 수정 종류·버전·고유키를 검증한 뒤 전후 파생값 영수증을 남긴다 | `ocr-adjudicator.test.ts`, `team-result-adapter.test.ts`, `apply-drawing-correction.test.ts`, correction API tests | 완료 |
| §5 번호 체계 | `evidence-deduplicator.ts`가 Pxx-S/L/T 번호를 결정적으로 부여하고 원본 근거 ID를 보존 | `evidence-deduplicator.test.ts` | 완료 |
| §6 수량 체크 | `count-register.ts`가 기호 출현, 확정, 모호, 누락 의심, 물리 장치 수를 분리 | `count-register.test.ts` | 완료 |
| §7 다중 페이지·재개 | `POST /api/drawing-jobs` → `/{jobId}/run|resume`, 공유 내구 볼륨의 원자적 작업 JSON, AES-256-GCM 원본 임대, 브라우저 폴링·세션 복구를 연결했다. 운영 저장소가 없으면 재개는 503으로 닫힌다 | API route tests, 내구 디스크 왕복 tests, 브라우저 생성→실행→새로고침 복구 | 완료 |
| §8 페이지 간 병합 | `cross-page-graph.ts`가 명시 페이지 참조만 확정하고 같은 라벨은 후보로 보류 | `cross-page-graph.test.ts` | 완료 |
| §9 논리·계산·제안 | `calculation-adapter.ts`, `recommendation-engine.ts`, `rated-value-extractor.ts`가 근거 결박과 HOLD를 강제 | `calculation-adapter.test.ts`, `recommendation-engine.test.ts` | 완료 |
| §10 보고서 | `/tools/sld`가 `DrawingSourcePreview`, `DrawingDocumentV3Overlay`, `DrawingDocumentV3Report`를 통해 원본·번호·관계·수정·제안을 연결 | 브라우저 실PDF 업로드, 페이지 전환, 데스크톱·모바일·콘솔 검증 | 완료 |
| §11 95% 실증 | `sld-evaluator-v2.ts`, `sld-benchmark-runner.ts`, `drawing-evaluation-gate.ts`가 문자·기호 공간 일대일 매칭, 관계·페이지 방향, 층별 최저값, 실제 3회 영수증, Ed25519를 검증한다. 구형 manifest gate와 V3 gate는 분리했다 | `npm run gate:sld-v3-contract`, 적대 변조 tests | 구현 완료·현장 실증 대기 |
| §12 데이터 계약 | `types-v3.ts`가 페이지, 증거 그래프, 수량, 계산, 제안, 수정, 평가 영수증을 정본화 | TypeScript 전체 검사와 V3 테스트 | 완료 |
| §13 모듈·API 경계 | 원본 준비, 오케스트레이션, 평가, 수정, API, UI를 분리하고 실제 호출처를 연결 | 0-caller 반증 grep과 production build | 완료 |
| §14 수용 기준 | 아래 FR-AC-01~15를 생산 코드와 회귀 테스트에 결박 | 전체 Jest와 본 문서의 FR 표 | 완료 |
| §15 구현 순서·출고 | 입력→역할→근거→작업→제안→수정→API/UI→평가기 순으로 배선하고 전체 게이트 실행 | `scripts/enforce.ps1` | 완료 |

## FR-AC-01~15 증거

| 기준 | 생산 근거 | 직접 회귀 |
|---|---|---|
| FR-AC-01 모든 요청 페이지 상태 | `document-orchestrator.ts` pageStates | `builds V3 document...`, 실PDF 18/18 상태 |
| FR-AC-02 전체·예정 구획 누락 시 COMPLETE 금지 | `coverage-ledger.ts`, `drawing-document-report.ts` | `marks a region complete only...` |
| FR-AC-03 PT/PPT 임의 확정 금지 | `ocr-adjudicator.ts`, `cross-page-graph.ts`, `evidence-deduplicator.ts` | OCR 충돌, PT/PPT 교차 페이지·중복 병합 적대 tests |
| FR-AC-04 확정·모호·누락 분리 | `count-register.ts` | `never puts ambiguous into confirmed` |
| FR-AC-05 출현 수·물리 장치 수 분리 | `count-register.ts` | `separates symbolOccurrences...` |
| FR-AC-06 경계 중복·누락 방지 | `evidence-deduplicator.ts` | `preserves overlapping receipts`, `LINE_CONTINUITY_UNCERTAIN` |
| FR-AC-07 페이지 참조 없는 동일 라벨 자동 병합 금지 | `cross-page-graph.ts` | `does not auto-merge same label...` |
| FR-AC-08 제안의 원본·계산·규칙 근거 | `recommendation-engine.ts` | `rejects SUPPORTED without evidence` |
| FR-AC-09 입력 부족 시 HOLD | `calculation-adapter.ts`, `recommendation-engine.ts` | `HOLDs breaker rating...`, `missing inputs...HOLD` |
| FR-AC-10 평가 점수 재계산 | `sld-evaluator-v2.ts` | 문자 위치 이동, 관계 방향 반전, 통과 불리언 변조 적대 tests |
| FR-AC-11 모든 지표·층 95% 요구 | `buildEvaluationSuiteResult`, `shouldActivateVerified95` | 최악값 suite 및 실제 3회 영수증 부족 거부 tests |
| FR-AC-12 생산 지문 변경 시 배지 만료 | `drawing-evaluation-gate.ts` | `requires an external signature...` |
| FR-AC-13 취소·예산·일부 실패 성공 위장 금지 | `document-orchestrator.ts`, job run/resume routes | `marks budget exceeded as PARTIAL...`, API 상태 복구 테스트 |
| FR-AC-14 원본을 보고서·로그·Git에 포함 금지 | `source-lease-store.ts`, API response contract | `no source bytes`, owner-bound lease tests |
| FR-AC-15 해시·버전 일치 페이지만 재사용 | `drawing-job-store.ts::canReusePage` | `resumes...only pages that did not complete`와 stale render 재호출 |

## 실증 경계

- 실파일 파싱 왕복: 합성 DXF 1페이지는 COMPLETE, 기호 5개·선로 4개. 공개 교보재 PDF 18페이지는 AI 키 없이 페이지 전체 렌더 후 1페이지 완료·17페이지 실패·미확정 25건의 PARTIAL로 정직하게 종료했다.
- `verified95`는 두 경우 모두 false다. 승인된 real-adjudicated 현장 데이터셋, 독립 라벨 합의, 동일 생산 공급자·모델 3회 반복, Ed25519 영수증이 없으므로 현장 95% 달성 주장은 보류한다.
- 운영의 중단·재개는 `DRAWING_JOB_STORE_DIR` 공유 내구 볼륨과 `DRAWING_SOURCE_LEASE_SECRET`이 실제로 설정됐을 때만 열린다. Docker 구성에는 전용 영구 볼륨이 배선됐고, 저장소 미설정 운영 실측은 503 fail-closed였다.
- 로컬 샌드박스 브라우저 실측에서 합성 DXF는 생성→실행→COMPLETE(1페이지, 구획 1/1, 미확정 0)→새로고침 결과 복구까지 성공했고 데스크톱·390px 모바일의 전역 가로 넘침은 0이었다.
