# ESVA 풀수리 계획 (결제·티어 제외) — 2026-07-19

## 범위
- 포함: 거짓 적합, 깨진 배선, 데모 오인, quality 공백 PASS, chat output-filter, 플래그 UI, SOS 정직 라벨
- 제외: Stripe / OPEN_BETA / 티어 게이트 / webhook

## 배치 순서

| ID | 우선 | 대상 | 완료 기준 |
|----|------|------|-----------|
| B1 | P0 | sld/layout/standards FAKED compliant | 미검증=HOLD(`compliant:null`), 가정 100A 제거 |
| B2 | P0 | receipt API | `/api/calculate/[id]` 또는 alias, 응답 shape 정합 |
| B3 | P0 | report 데모·네비·export | 데모 폴백 제거, 네비 제거, excel POST |
| B4 | P0 | quality-checklist | 필수 파라미터 공백=`needs-data` (PASS 금지) |
| B5 | P0 | chat output-filter | 스트림 종료 후 필터 마커 SSE 전송 |
| W1 | P1 | SLD DXF/PDF | FLAG-OFF 시 탭 비활성+사유 |
| W2 | P1 | field SOS | UI에 인앱 기록 한정 명시 |
| W3 | P1 | consensus/UI HOLD | null compliant를 실패로 집계하지 않음 |

## 집행 상태 (완료)

| ID | 상태 | 변경 파일 |
|----|------|-----------|
| B1 | DONE | `sld-team.ts`, `layout-team.ts`, `standards-team.ts`, `types.ts`, `consensus-team.ts`, `VerificationReport.tsx`, `pipeline.ts` |
| B2 | DONE | `api/receipt/[id]/route.ts` 신설 |
| B3 | DONE | `report/[id]/page.tsx` 데모 제거, `Header.tsx` 네비 교정, export POST |
| B4 | DONE | `quality-checklist.ts` needs-data, multi-team/audit 정합 |
| B5 | DONE | `api/chat/route.ts` + `search/page.tsx` filter 소비 |
| W1 | DONE | `tools/sld/page.tsx` DRAWING_PARSER 비활성 UI |
| W2 | DONE | `field/page.tsx`, `api/field/sos/route.ts` 정직 라벨 |

### 잔여 (의도적)
- 결제/티어/webhook/OPEN_BETA — 범위 제외
- team-review UI 배선 — DORMANT API 유지 (네비 데모 제거로 오인 경로 차단)
- `npm test` / `tsc` — 본 세션 shell 정책으로 미실행 (로컬 재검증 권장)

### 정직 잔여
- SLD 이미지 분석 후 계산 체인은 HOLD 위주 — 실 57계산기 자동 연결은 후속
- receipt API는 Supabase 설정 시에만 영속 로드
