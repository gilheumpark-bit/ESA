# 전수 버그 사냥 분류 대장 (2026-07-21)

> 6축 병렬 사냥(도면엔진·API 48라우트·계산기 57·lib·프론트 94파일·게이트착시) → 본체 재현 확정.
> 상태: FIXED=수리+테스트 잠금 · DEFERRED=별도 세션 · DORMANT=0-caller(배선 시 발화).
>
> **[풀수리 종결 업데이트]** "모두 풀수리" 지시로 아래 DEFERRED 대부분을 후속 배치에서
> 수리 완료. 정리:
> - **엔진 F5/F6/F8** = FIXED(babd357) · **lib XFF·batch·convert** = FIXED(babd357) · **/api/review 커버리지** = FIXED(8c0d3e8)
> - **프론트엔드 H1~H4·M1~M7·M9·L1~L2·L5~L6·L8~L9** = FIXED(병합 c94cba7) · M8 6컴포넌트=declared-dead(오너 결정)·L3/L4/L7/L10=비긴급 보류
> - **계산기 12건 전부** = FIXED(병합, IEC B.52.14/B.52.15·NEC 310.15(C)·IEC 60364-5-54 k·ASTM B258 표준 대조) · 잔여=cable-sizing A2/B2 근사(보수측)·EPR 정규화 구조부채
> - 통합: jest 142 suites/1232(수리전 1177·+55·제거 0)·tsc 0·gate:pdf 15/15·build 0
> 하단 원본 항목은 사냥 시점 스냅샷으로 보존(수리 이력 추적용).

## FIXED (이 배치 — 커밋 동봉·전부 known-answer/회귀 테스트 잠금)

| ID | 심각도 | 파일 | 결함 → 수리 |
|---|---|---|---|
| rated-value | **CRIT** | agent/drawing/rated-value-extractor.ts | 정본 spec-text의 구판 복제본 드리프트 — "1000kVA"→1000kV·"22,900V"→900V(drawing-jobs 라이브). 최장일치+부정탐색+콤마 |
| F1 | **CRIT** | engine/topology/spec-text.ts | bare 슬래시가 전압쌍(380/220V)·감도전류(50/30mA)·날짜(2021/04)를 AF/AT로 오독 → review false-PASS/FAIL. 꼬리 부정탐색+타당성 |
| F2 | **HIGH** | pdf-vector-parser·dxf-parser (parseNodeCoords) | 정수-전용 정규식이 소수 좌표 끝점을 null로 떨궈 케이블 스펙 결속 사문(실도면 대부분 소수 좌표 → CABLE-AMPACITY 무발화). 정본 [\d.]로 정렬 |
| #1 | **HIGH** | data/ampacity-tables/kec-ampacity.ts | 온도보정 xlpe90 열=PVC값·pvc60 열 어긋남 → XLPE 과소·저온 과대(화재 방향). IEC 60364-5-52 B.52.14 정확값 |
| F3 | MED | pdf-vector-parser (isProseText) | 단독 "A"·"FOR"를 기능어로 물어 실설비 라벨 억제. 임계 ≥2 |
| F4 | MED | engine/review/circuit-review.ts | TR 2차전압이 슬래시 뒤 상전압(220) 캡처 → 기준값 1.73배. 상간(선간) max 사용 |
| F7 | LOW | lib/sld-recognition.ts | calcChain dependsOn [2]/[3] 하드코딩 → load 없을 때 자기참조. 동적 스텝번호 결박 |
| API-1 | MED | lib/community.ts | 무인증 search가 PostgREST .or() 필터 인젝션·무결 500. 필터문자 제거+100자 캡 |
| API-2 | MED | api/notifications·community/route.ts | page/pageSize NaN·음수·과대 미가드 → range(NaN)/음수오프셋 500. clamp |

## DEFERRED — 도면 엔진 (hot-path 인접·다음 배치)

- **F5 · MED** `spec-text.ts` — 병렬 다조(`150sq x 2`) 무시 → 단조로 읽어 옳은 도면 부적합. 조수 파싱 필요.
- **F6 · MED** `dxf-parser.ts:294` — INSERT 분기만 `isIgnoredLayer` 누락 → 표제란/도곽 블록이 phantom load(resolveBlockType 기본 'load'). CIRCLE/LINE/POLYLINE엔 있음.
- **F8 · LOW** `circuit-review.ts` — `hasKva`가 bare "VA"를 통과+MVA만 환산 → "500VA"를 500kVA(1000×). 제어용 TR 희소.

## DEFERRED — 계산기군 (57종·review 경로 밖·각 항목 도메인 검증 필요, §2.10)

> ⚠ 각 계산기는 known-answer 도메인 대조 후 수리. blind 수정은 화재 방향 위험. IEC/NEC 온도보정은 KEC #1과 동일 계열(각 표준표 필요).

- **HIGH** iec-ampacity·nec-ampacity 온도보정 열 오정렬(KEC #1 동일 계열, 미수리) · IEC 설치방법 silent fallback→Method C 과대(iec:239).
- **MED** Method D(직매)에 공기 보정표 적용(지중온도 오증가) · AWG 음수 규약 off-by-one(문서↔공식, 두 변환기 상호모순) · transformer-capacity 정격초과 vacuous PASS(용량부족 false-PASS) · transformer-loss 효율 1MVA 고정기준 · ground-conductor k=용단상수(보호도체 과소·비보수) · substation N+1이 유닛당 50%(이중화 상실) · rcd-sizing 정격초과 침묵 PASS · cable-sizing installation 입력 무시(항상 Method C).
- **LOW** relay-basic 픽업미만 음수 트립시간 · ampacity-global-compare ambientTemp 무검증 NaN + 국가기본 동결 · plugin-registry 0-caller(죽은 레지스트리) · motor-flc 460V 오매핑 휴면.

## DEFERRED — 프론트엔드 (94파일·surface 전체·별도 세션)

- **HIGH** H1 /compare 결과 언랩 누락(data.data 미해제 → 핵심기능 사망·"[object Object]") · H2 모바일 OCR 추천 `/calc/power/undefined` 404(string[] 오독) · H3 `esa-recent-calcs` reader만·writer 0(receipt·모바일 최근계산 영구 공백·거짓 카피) · H4 커뮤니티 관련계산기 칩 1-세그먼트 404.
- **MED** M1 useSettings 다중인스턴스 낡은값 clobber(테마↔언어 상호 원복) · M2 Country/Standard 죽은 컨트롤(countryCode 미전송·항상 KR) · M3 현장 체크리스트 재방문 초기화→이행률0 안전기록 오염 · M4 admin 감사로그 페이지네이션 죽음 · M5 비로그인 영수증 링크 404 · M6 기준변환 표시↔요청 분리 · M7 게이지 도달불가(calcId↔calculatorId) · M8 사문 컴포넌트 6(NotificationBell·Toast·Onboarding…) · M9 판정없는 계산에 "적합" 녹색배지(오해).
- **LOW/NIT** L1~L10(파일input value 미리셋·죽은 재시도 링크·침묵 catch·리스너 누수·중첩 invalid HTML·CSV 필터무시 등).

## DEFERRED — API·lib·커버리지

- **MED** lib/rate-limit getClientIp가 XFF 최좌측(스푸핑 가능) 신뢰 → 레이트리밋 우회. x-real-ip/플랫폼 IP 우선 필요.
- **LOW** calculate/batch 실행 전 예산 소진(전량 실패+후속차단) · convert 옵션 타입 무검증 NaN 200 · API 에러 shape 라우트별 불일치.
- **DORMANT** fetch-url-guard IPv6(IPv4-mapped·ULA·link-local·메타데이터 통과) · rateLimitFetchUrl 무한 메모리 — 둘 다 0-caller, 배선 시 발화.
- **커버리지 착시** /api/search 스택(랭킹·RAG·MainAgent) jest+E2E 0 · /api/review 200경로=verification 8모듈 0회 · collaboration 공유링크 만료/비번 실코드 0회(mock) · rated-value(수리 시 테스트 신설).

## 검증 안 된 것 (정직 선언)
- 프론트 H1~H4·M*는 코드 실측이지 라이브 재현 아님(읽기전용 좌석). 수리 착수 시 라이브 재현 선행.
- 계산기군 손계산은 좌석 주장 — 각 수리 전 표준 known-answer 재대조(저자와 같은 오류 회피).
