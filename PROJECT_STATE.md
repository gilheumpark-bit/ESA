---
schemaVersion: 1
project: ESA
status: active
baselineBranch: feat/ax-precision-20260907
codeBaselineCommit: 690ad046dd7f77cb84d5517a5b197fa7d8663752
updatedAt: 2026-09-09T15:00:00+09:00
trigger: files
changedDomains: [agent, engine, scripts, config, docs]
---

# ESA 프로젝트 상태

## 기준과 제품 경계

위 SHA는 개발 잔재·기술부채 정리의 **출발 코드**이며 이 문서 자신의 커밋이나 main 병합을 뜻하지 않는다. PR #71 작업 브랜치와 main은 별개다. 최종 검증은 정확한 제품 HEAD와 CI를 함께 확인한다.

ESA는 전기 검색·결정론적 계산·도면 분석·전문팀 검토와 근거 보고서 도구다. 설계 승인·법적 적합성 인증서가 아니며 도면에 없는 입력을 추정해 확정하지 않는다. 수량 일치·합성 회귀 통과·모델 확신도와 독립 실도면 정확도를 구분한다.

이전 장문 상태·개발 기록은 [정리 전 보존본](docs/project/handoffs/2026-09-09-project-state-before-cleanup.md)에 보존했다. 과거 실호출·판정·실패를 지우거나 이번 버전의 성과로 합산하지 않는다.

## 현재 연결된 핵심 경로

| 영역 | 현재 코드와 계약 |
|---|---|
| 도면 작업 | 빠른 `/api/dxf`, `/api/pdf-drawing`, `/api/sld`와 전체 `/api/drawing-jobs`. 단일 작업 통합은 아직 하지 않았다. |
| 판독 | symbols/connections/text/logic 및 최종 coverage auditor. 기호·결선·문자 준비 후 정밀 구획을 실행하며 독립 logic과 겹쳐 처리한다. 공유 FIFO가 동시 호출 상한을 지킨다. |
| 전처리 | 선택 구획만 픽셀 생성. 같은 문서 실행의 최근 한 페이지 준비만 재사용하며 다른 사용자·실행과 공유하지 않는다. AI 답변 캐시로 새 판독을 위장하지 않는다. |
| 연결·근거 | 타입 후보·원본 좌표 단자, 경로 전체의 선 ID·출처 보존. 공간 색인 뒤 기존 정밀 기하를 판정하며 모호 교차·분기를 강제 확정하지 않는다. |
| 재개·보고서 | 완료 페이지의 기기 ID·판정·단자·문자 보존. CSV·인쇄는 기기·정격·계산·전체 경로·미확정 항목을 포함하고 상한 초과 시 조용히 자르지 않는다. |
| 회사 사전 | DXF 지문·별칭의 회사별 브라우저 저장 및 JSON 이동. 조직 공용 서버 사전·이미지 학습 기능은 아니다. |
| 프런트엔드 | 비교 계산·OCR의 늦은 응답 폐기, 오류/재시도·클립보드 대안, 내부 이동·프로젝트 초기 인증 복원 대기. 합성 로그인 UI 검사는 운영 권한 검증과 별개다. |
| 인증·저장 | Firebase 서버 검증, Supabase 및 요청 범위 BYOK. 로컬 ChatGPT는 같은 PC loopback 경계이며 계정 토큰을 복제하지 않는다. |
| 유지보수 | 이번 변경에 미사용 선언·tracked 잔재·개발 의존성 감사·실패 증거 보존을 연결했다. 실제 출고 검증 상태는 아래를 따른다. |

## 최근 변경과 근거

| 코드 | 작업 기록 |
|---|---|
| `4aaf0536` | [분할 배선·완료 페이지·보고서](docs/project/handoffs/2026-09-08-commercial-drawing-workflow.md) |
| `9e2603a7` | [프런트엔드 목록·버튼·오류 복구](docs/project/handoffs/2026-09-08-frontend-controls.md) |
| `ea11b447` | [선택 구획·공간 색인·준비 재사용](docs/project/handoffs/2026-09-09-drawing-performance.md) |
| `690ad046` | [보안 패치·단계 대기·인증 복원](docs/project/handoffs/2026-09-09-remaining-security-scheduling.md) |
| 이번 정리 | [잔재·의존성·유지보수 검사](docs/project/handoffs/2026-09-09-development-debt-cleanup.md) |

## 열린 부채

정본은 [TECHNICAL_DEBT](docs/TECHNICAL_DEBT.md)이며 의도적 휴면은 [DORMANT_MANIFEST](docs/DORMANT_MANIFEST.md)로 분리한다.

- `DEBT-SAFETY-001`: 절연장갑 Class 1~4의 출처·판본·근거 화면 연결. 값이나 필터를 임의 변경하지 않았다.
- `DEBT-UI-001` / `UIV-001`: 재계산 후 영수증이 남는 간헐 브라우저 실패. 반복 통과만으로 원인 수리로 종결하지 않는다.
- `DEBT-ARCH-001`: 빠른 분석과 전체 작업의 공통 파싱·상태 공유. 단순 병렬 호출로 사용량을 늘리지 않고 권한·결과·취소·재개 계약부터 통합한다.

## 검증 상태와 한계

출발 코드 `690ad046`의 정규 CI `34305971538`은 성공했지만 브라우저 한 검사가 재시도로 통과했다. 별도 실행 `34305215730`의 무재시도 통과가 간헐 오류를 없애는 증거는 아니다. 운영 의존성 감사와 개발 의존성 포함 범위를 구분한다.

이번 정리의 커밋·단위 검사·감사·빌드·PDF·브라우저 결과는 새 인수인계와 PR 검증 댓글에 기록한다. 불안정한 시험 개수를 정본 문서 여러 곳에 복제하지 않는다. 실행 실패·미확인은 PASS가 아니다.

실제 외부 AI를 포함한 전체 처리시간, 독립 실도면 정밀도·재현율, 운영 DB 권한/저장, Stripe 결제·웹훅, Weaviate 적재·조회는 별도 환경 확인 대상이다. 기존 교보재 실증은 [VALIDATION_EVIDENCE](docs/VALIDATION_EVIDENCE.md)에 보존돼 있으며 부재라고 단정하지 않는다. 규정 수치·단위·라이선스·권한은 이번 정리에서 바꾸지 않았다.

## 재실행

```bash
npm ci
npm run gate:hygiene
npm run check:docs
npx tsc --noEmit
npm run lint -- --max-warnings=0
npm test -- --ci --coverage --forceExit
npm run test:scripts
npm run gate:audit
npm run gate:audit:all
npm run build
```

실제 PDF와 브라우저 검사는 독립 production 서버를 사용한다. Windows 진입점은 `scripts/enforce.ps1`이며 Windows 실실행 여부는 별도로 확인한다.

[아키텍처](ARCHITECTURE.md) · [배선 지도](docs/project/IMPLEMENTATION_MAP.md) · [구조 결정](docs/project/DECISIONS.md) · [문서 지도](docs/README.md) · [전체 인수인계](docs/project/HANDOFFS.md)
