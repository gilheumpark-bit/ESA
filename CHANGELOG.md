# Changelog

All notable changes to ESVA are documented in this file.

## [Unreleased]

### Added
- **`claude-local` 도면 공급자** — 사용자의 로그인된 `claude` CLI 를 루프백에서만
  사용한다. 원격 API 키가 필요 없다. 프롬프트는 stdin 으로만 넣고 argv 값은
  정규식·열거로 검증하며, 이미지는 격리 임시 폴더에 두고 `--allowedTools=Read`
  로 좁힌다. 상태 확인은 토큰을 쓰지 않는 `claude auth status --json` 이다.
  라이브 게이트는 `npm run gate:claude-local-live`(계정 사용량 소비, CI 제외).
- **조립 품질 지표** — `scripts/lib/drawing-assembly-metrics.mjs` 와
  `npm exec -- node scripts/measure-assembly-quality.mjs <작업저장소>`. **정답 라벨
  없이** 조립기가 자기 입력을 얼마나 정리했는지 잰다(미병합쌍·조각·모호 비율).
  라벨 점수는 모델이 무엇을 읽었는가에 지배되어 고급 도면에서 조립기 변경을
  탐지하지 못한다 — 같은 코드로 3회가 85~87% ↔ 85~100% 로 흔들린다. 라벨 점수를
  **대체하지 않고 함께** 읽는다(세 비율을 0 으로 만드는 가장 쉬운 방법은 아무것도
  확정하지 않는 것이다).
- **도면 매트릭스 반복·프로필 축** — `--repeat=N` 은 같은 셀을 N 회 돌려 최악과
  폭으로 접는다(평균은 무너진 회차를 지운다). `--profile='{"symbols":"low"}'` 는
  역할별 추론 단계를 덮어써 A/B 를 만들고, 영수증 파일명이 프로필 해시로 갈린다.
- **검토 보고서·도면 반출** — `src/lib/export-review-report.ts`,
  `src/lib/export-drawing-document.ts`. CSV(BOM+CRLF)와 인쇄용 HTML 을 낸다.
  `POST /api/export` 의 `reviewReport` 변형은 SHA-256 무결성 검사를 통과한
  보고서만 받는다. **확정 항목만 추리지 않는다** — 그러면 검토자가 반출물을
  완성된 목록으로 읽는다.

### Added
- **`src/agent/drawing/device-vocabulary.ts` — 기기 어휘의 유일한 정본.**
  진단(31차): 모델이 실제로 낸 타입 문자열은 **52종 614회**인데 실제 기기 종류는
  절반도 안 됐다(CT 5철자·피뢰기 5철자·PT 6철자·MOF 3철자, `metering_out_fit` 과
  `metering_outfit` 은 각각 1회씩 — 회차마다 철자를 새로 짓는다). 그 열린 어휘를
  **8개 함수가 각자 정규화**했고, 24·26·29·30차 결함이 전부 "그중 하나가 한 철자를
  빠뜨림" 이었다. 별칭 추가는 비용이 철자 × 소비자라 수렴하지 않는다.
  이제 `spatial-graph` 가 그래프 입구에서 정본화하므로 저장 문서의
  `typeCandidates` 자체가 닫힌 어휘이고, 하류는 별칭 표가 필요 없다(채점기의
  별칭 표를 지웠다). 정규화는 목록이 아니라 **생성 규칙**이다 — 영숫자만 남겨
  평탄화하면 `current_transformer`·`current transformer`·`currentTransformer` 가
  한 토큰이 되어 24·26차 결함이 재발 불가능해진다. 어휘는 두 층이다:
  `DeviceType`(세부 보존 — 진공·기중·배선용 차단기는 다른 기기다) /
  `DeviceFamily`(병합·골든 축). 표시 ID 는 날 약호 그대로 둔다(`VCB-01`).
  라이브: 참조 교재 **모호비 0.633 → 0.412**(어휘 통일만 바뀐 격리 구간),
  KIMM PDF 라벨 75% → **90~100%**, 변압기 정답 4 에 **8 → 4/5/5**.

### Fixed
- **모선 구간이 부유 끝점으로 신고되던 것** — `spatial-graph` 의 관계 조립기가
  **단일 선분의 양끝이 각각 정확히 한 기기에 닿을 때만** 관계로 인정했다. 실제
  단선결선도는 기기 → 분기점 → 모선 → 분기점 → 기기로 가므로 모선 구간처럼 양끝이
  기기가 아닌 정상 도선이 전부 `UNBOUND_LINE_ENDPOINT` 가 되고 감사자가 페이지를
  실패시켰다. 제품 경로의 조립기(`evidence-deduplicator.buildPageRelations`)는
  7차에 이미 선망 추적으로 고쳤다 — **같은 개념의 조립기가 둘인데 한쪽만 고쳐져
  있었다.** 끝점이 분기점·교차점에 닿으면 선망에 이어진 것으로 보고, 모선 위
  구간은 자기 참조로 세지 않는다. **아무것도 안 닿은 부유 끝점은 그대로 신고**해
  차단 신호는 유지한다. 기존 4,160개 시험 중 이를 잡는 것이 하나도 없었다.
  *라이브 실증은 아직 없다 — 단위 시험까지만.*
- **병합기가 어휘 정본을 안 쓰고 있었다** — 31차에 "어휘를 그래프 입구에서 닫았다"
  고 적었으나 중복 제거기가 둘이고, 문서를 만드는 쪽은 그래프 입구를 거치지 않고
  날 판독을 직접 받는다. `current_transformer`(전면)와 `ct`(구획)가 서로 다른
  값으로 정규화돼 **같은 CT 가 두 노드로** 남았다. `typesCompatible` 을 계열
  비교로 올려 정본에 연결했다. 이 과정에서 **우연히 통과하던 시험 하나**를
  찾았다 — `PT/PPT` 를 "다른 타입" 예시로 썼는데 둘 다 계기용변압기이고 좌표가
  완전히 같았다(구획 둘이 같은 자리를 읽은 것). 병합이 맞다.
- **실행 실패가 성능 수치로 둔갑하던 것** — 로컬 GPT 경로가 라벨 25%·관계 0% 를
  냈는데 실제로는 구획 10/10 실패·기호 0 이었다(원장 6차의 23%·관계 0% 와 같은
  형태). 파이프라인이 원인을 두 번 버리고 있었다: `turn.status !== 'completed'`
  에서 공급자의 `status`·`reason` 을 폐기했고, `stderr.resume()` 로 **CLI 가
  이유를 적는 stderr 를 통째로 폐기**했다. 아는 조건만 코드로 분류해
  싣는다(`USAGE_LIMIT`·`RATE_LIMIT`·`NOT_LOGGED_IN`·`UNKNOWN_MODEL`). 원문은
  싣지 않는다 — 실측된 usage-limit 메시지에 결제 URL 이 들어 있다.
- **감사 소견이 판독을 통째로 버리고 있었다** — `document-orchestrator` 가 사설
  정규식 `/UNBOUND|AMBIGUOUS_LINE|SELF_LINE/` 으로 차단 충돌을 판정해 **모호성까지
  차단**으로 분류했다. `electrical-invariants` 의 정본 집합은
  `AMBIGUOUS_LINE_ENDPOINT` 를 `HOLDING` 으로 선언하는데 정규식이 무시했다.
  실측(교재형 수변전 p6): symbols·connections·text·logic 이 **모두 성공한**
  전면 판독이 `AMBIGUOUS_LINE_ENDPOINT` 3건 때문에 failed 가 되고, 변압기 3대를
  한 시야에 보는 유일한 패스가 버려져 3회 중 2회가 변압기를 1 로 읽었다.
  정본 집합을 쓰는 `isBlockingGraphConflict()` 하나로 합쳤다(`translateGraphConflicts`
  도 같은 함수 사용). 참조 티어 83~100%(폭 17p) → **100/100/100%(폭 0p)**,
  품질 FAIL → **HOLD**. 24차·26차·29차와 같은 결함군 — 같은 개념의 독립 정본이
  둘 있으면 어긋난다.
- **참조 티어 정답표 오류(자기 정정)** — 27차 육안 계수가 **모선에서 갈라진 피더
  3개의 개폐기를 통째로 빠뜨려** `PF/COS 2`(실제 5)로 적혔다. 29차에 그것을
  "라벨 없는 유령"이라 기록했으나 **실재 기기이며, 파이프라인의 정상 판독을
  오류로 채점하고 있었다.** 아울러 `switch` 를 정확 수량 축에서 뺐다 — 이 교재는
  PF·COS·피더 개폐기에 같은 기호를 쓰고 라벨이 `COS또는PF` 라 **도면이 클래스를
  결정하지 않는다.** 정확 수량 축의 조건에 "어휘가 정본화될 것" 외에 "도면이
  클래스를 결정할 것"을 더했다.
- **골든 축 별칭 표의 구멍 둘** — `canonicalSymbolType` 이 `lightning_arrester`
  와 `disconnecting_switch` 를 접지 못했다. 실측(교재형 수변전 p6): 피뢰기가
  `lightning_arrester|surge_arrester|arrester` 로 **읽혔는데도** 첫 후보만
  정본화돼 arrester 축이 0 이었다. 단로기는 반대로 switch 축에서 빠져 **과다
  계수가 줄어 점수가 올라갔다** — 누락이 스스로를 감춘다. 26차
  `current transformer`(공백형)까지 같은 결함의 세 번째 사례다. 별칭을 넣고
  **양방향 시험**(빼면 red)을 걸었다. 참조 티어 라벨 45~86%(폭 41p) →
  **85~100%(폭 15p)**, transformer·breaker·arrester 는 3회 전부 정답 일치.
- **참조 티어 정답표가 얇았다** — 육안 정답 13종 중 3종만 걸려 있어 27차의
  `100/100/100 · 폭 0p` 은 실질 정확 축 하나 위의 값이었다. 정본 어휘가 있는 축
  (breaker 하한 1 → **정확 1**, switch 2, arrester 1)까지 넓혔다. MOF·PT·CT·
  OCR 등은 어휘가 정본화되지 않아 넣으면 판독이 아니라 이름 불일치를 채점하게
  되므로 뺐다.
- **채점기가 과다 계수에 상을 주고 있었다** — `scripts/lib/drawing-model-score.mjs`
  가 종합을 `기호 정확도 70% + 관계 회수율 30%` 로 냈는데, 관계축이
  `min(1, 실측/하한)` 이었다. `minRelations` 는 정답이 아니라 사람이 센 **회귀
  하한**이므로 넘기만 하면 언제나 100% 다. 실측: 고급 PDF 의 관계는 하한 12 에
  **463(38.58배)**, 차단기는 하한 9 에 **78(8.67배)** — 둘 다 100% 였다. 즉
  **종합의 30% 가 무료였고 과다 계수가 점수를 올렸다.** 하한을 점수에서 떼어
  `floorGates`(충족 여부 + 초과 배율) 관문으로 옮기고, 종합은 정답 수량을 아는
  축만으로 매긴다. 정확 축이 없으면 `null` 이다. 시험도 함께 고쳤다 — 옛 시험은
  하한 **미달**만 넣어 봐서 무료 100% 를 드러낼 수 없었다. 저장된 영수증을 재채점한
  결과 고급 PDF·PNG 88→**75%**, 중급 75→**64%**, 참조 교재 100→**100%**, 초급은
  95→**100% + 관계 하한 관문 FAIL**(옛 자는 미달을 95% 안에 섞어 지웠다).
- **줄바꿈된 한국어 주석이 기기로 승격** — `isProseText` 의 한국어 판정이 종결
  표현(`하여|합니다|해야`…)에만 의존했는데 그것은 정의상 마지막 줄에만 있다.
  줄바꿈된 주석의 앞줄은 전부 그물을 빠져나갔다. 실측(교재형 수변전 단선결선도):
  주석 `…또는 TR CNCV-W`(트리억제형 케이블)의 `TR` 이 전력변압기로 계수돼 정답
  3 에 4 가 나왔다. 한국어는 교착어라 문장 속 낱말이 조사를 달고 나오므로,
  토큰 5개 이상 + 조사로 끝나는 토큰 2개 이상이면 문장으로 본다. 전수 확인:
  해당 페이지의 기기 문자 5건이 전부(전부 실제 문장) 걸리고 **KIMM 실도면
  197건은 하나도 걸리지 않았다**. 수리 후 라벨 92~94% → **100/100/100%(폭 0)**.
- **문자 중복 제거 부재** — `assignDisplayIdsForTexts` 가 정렬 후 ID 만 붙였다.
  구획이 겹치게 잘리므로 같은 명판이 2~3 노드로 남았다(실측: `MOLD TR-2` 가
  `989,511 42x6` 과 `1027,514 67x10` 로 두 번). 같은 자리의 같은 글자를 접고
  더 넓게 읽은 쪽을 남긴다. 멀리 떨어진 반복 표기는 접지 않는다.
- **타입 이름 구분자 차이로 CT·ZCT 가 전력변압기로 계수** — `normalizeKind` 가
  `current_transformer`(밑줄)만 검사해 `current transformer`(공백)가 일반 분기
  `includes('transformer')` 로 떨어졌다. 실측: 한 회차에서 CT·ZCT 7개가
  전력변압기로 세어져 5 대신 12 가 나왔다. **모델이 회차마다 어느 형태를 내느냐로
  값이 흔들렸으므로 계수 변동의 출처이기도 하다.**
- **같은 명판을 여러 번 읽어 여러 대로 계수** — 도면의 벡터 층이 `MOLD TR-2` 를
  딱 한 번 선언했다면 그 이름을 단 판독은 몇 개든 한 대다. 크기·겹침 같은 간접
  신호는 근본적으로 약하다(정답 채점에서 SAME 1.00~10.10 · DISTINCT 1.00~4.97 로
  완전히 겹친다). 벡터 앵커가 여럿인 명판(`MCCB ABSc` 78개 · `VCB(DRAW OUT)` 5개)
  은 접지 않아 실재하는 반복 기기를 지키고, 벡터 판독이 없는 래스터 업로드에서는
  발화하지 않는다. 실측(PDF 경로 3회): 전력변압기 8/9/7 → **5/5/5(폭 0)**,
  라벨 87~90% → **95/95/95%(폭 0)**.
- **계기용변성기를 전력변압기 대수에 합산** — `count-register` 의 `normalizeKind` 가
  일반 분기 `includes('transformer')` 로 끝나는데 `instrument_transformer`·
  `potential_transformer`·`vt_pt` 를 앞에서 잡지 않았다. 실측(KIMM 수변전
  단선결선도): 그래프의 전력변압기 노드는 5~8개인데 집계는 11 이었다. 검토자가
  없는 변압기를 찾게 된다. 같은 결함이 `transformer_ct`·`transformer_vt` 에
  대해 이미 수리됐는데 이름이 다른 셋이 남아 있었다.
- **도면 참조 콜아웃을 기기로 계수** — 육각형 안 "번호/약호"(예: `1`/`TR`)는
  도면 상세 참조 기호지 그 자리에 기기가 있다는 뜻이 아니다. 제원이 붙거나
  숫자가 멀리 있으면 콜아웃이 아니다. 전수 확인(기기 텍스트 197건): 제거 3건,
  전부 육각형 마커였고 `CH`·`PL`·`SC` 같은 약호 기기는 걸리지 않았다.
- **PDF 파서가 호출자 버퍼를 detach** — pdf.js 는 받은 ArrayBuffer 를 워커로
  transfer 한다. 파서가 넘기던 `new Uint8Array(pdfBytes)` 는 사본이 아니라 뷰라서,
  같은 버퍼로 두 번째 페이지를 파싱하면 **예외도 경고도 없이 기기 0개**가 나왔다
  (83페이지 설계세트에서 1페이지만 살아남는다). 파서가 사본을 소유하도록 고쳤다.
  방어가 호출부에 흩어져 `sld-team` 에만 있고 `layout-team` 에는 없었다.
- **1페이지 밖 재스캔 대상이 전부 거부** — 팀에 넘기는 스냅샷은 항상 `page = 1`
  인데 오케스트레이터가 문서 페이지 번호를 넣어, **1페이지가 아닌 모든 페이지에서
  재스캔 복구가 통째로 죽어 있었다.** 단일 페이지 업로드로만 재던 측정에서는
  우연히 일치해 드러나지 않았다.
- **재검사 대상 하나가 나머지를 죽임** — 검증이 `map` 안에서 throw 해 대상 한 개가
  범위를 벗어나면 역할 호출 전체가 실패했다. 유효한 대상은 살리고 거부한 것은
  사유와 함께 HOLD 로 남긴다. 전부 잘못됐으면 종전대로 거부한다.
- **기기 몸체에 갇힌 표기를 기기로 계수** — 퓨즈 사각형에 인쇄된 단자 번호를
  `terminal` 기기로 읽어 물리 수를 부풀렸다(확정 322개 중 15개). `ambiguous` 로
  내려 물리 수에서 빼고 확인 항목을 붙인다. 노드도 근거도 지우지 않으며,
  source·protection·load·bus 로 분류되는 구조 기기는 강등하지 않는다.
- **IEC 지정문자가 판독 충돌에 지지** — `FU2` 를 fuse 로 읽은 판독과 같은 자리를
  switch 로 읽은 판독이 만나면 지정문자를 쥐고도 ambiguous 로 무너졌다. 도면이
  스스로 선언한 지정문자가 이기게 하되, **조각 보호를 건너뛰지 않는다**(비슷한
  크기끼리의 충돌만 푼다 — 앞선 판은 반토막 판독을 확정으로 올려 퓨즈를 과다 계수했다).
- **재스캔 갭 폴백** — coverage auditor 가 대상을 내지 않아도 구획에 공백이 남으면
  실패한 역할 기준으로 재스캔을 건다.

### Changed
- **도면 매트릭스 대표값을 평균에서 최저점으로** — 평균은 무너진 회차를 지운다.
  최악과 폭을 함께 기록하고, 대표 회차의 문서를 남겨 사후에 볼 수 있게 한다.

### Security
- **시크릿 커밋 차단 훅** — `.githooks/pre-commit`. 이 저장소는 공개이고 `.env.example`
  은 추적 대상이라 `git add -A` 한 번이면 로컬 값이 공개된다. 이름이 시크릿인 변수에
  값이 붙은 `.env*` 와, 알려진 시크릿 형태가 추가된 줄을 차단한다. 차단 메시지에 값을
  출력하지 않는다. **클론마다 `git config core.hooksPath .githooks` 를 한 번 실행해야
  켜진다**(CONTRIBUTING 참조). 훅이 실제로 발화하는지는
  `scripts/__tests__/pre-commit-hook.test.ts` 가 임시 저장소에서 실행해 검증한다.

### Fixed
- **고밀도 도면 관계 복원** — 페이지 밀도별 2×2·3×3·4×4 구획, 기호 심사가 살아 있는 페이지의 결정론적 래스터 직선 보조, 구획 선망 재조립과 물리 장치 중복 제거를 graph v7에 결박했다. 추론 관계는 확정으로 승격하지 않는다.
- **도면 고추론 제한시간** — high 문서 예산을 570초로 맞추고 Agent Platform은 동시 8호출을 사용한다. 문서 기한에 도달해도 이미 완료된 독립 심사 봉투는 버리지 않는다.
- **KEC 212.7.2 오해 방지** — 별도 과부하·단락 보호장치의 ID·통과에너지·무손상 내량·출처가 모두 있을 때만 A²s를 비교한다. 일반적인 상·하위 선택협조로 오표기하거나 보호곡선 하나에서 값을 추정하지 않는다.
- **Agent Platform 도면 실호출** — Express Mode가 필수로 요구하는
  `contents[].role=user`가 빠져 실제 SLD가 502로 끝나던 문제를 SLD·OCR·구획
  VLM·역할 호출 전체에서 수리했다. Gemini thought 파트는 최종 JSON에서 제외한다.
- **주석 토폴로지 오판** — 모델이 전력 흐름 문자를 `annotation`으로 더 잘 읽으면
  ESA가 이를 고립된 전기 노드로 세어 연결망 품질을 낮추던 역전 현상을 막았다.
- **아크플래시 입사 에너지 단위** — IEEE 1584-2002 식 (5) 의 결과는 J/cm² 인데
  `cal/cm²` 라벨을 달고 cal 기준 PPE 표와 대조했다. 전 구간 4.184 배 과대였고,
  480V·20kA·0.2s(교과서 예제)가 "작업 금지" 로 판정됐다.
- **아크플래시 중고압 과소평가** — 거리 지수가 전압과 무관하게 1.641(저압 MCC 행)
  이었고 전극 간격도 저압 기본값을 썼다. 13.8kV 에서 **덜 안전한 방향**으로 어긋났다.
  2002 Table 4 를 전압대·기기 종류별로 넣고 `equipmentClass` 입력을 열었다.
- **NFPA 70E 표 선정** — 입사 에너지 분석 결과로 130.7(C)(15)(c) 의 등급을 지정하는
  것은 표준이 허용하지 않는다. 정본 Table 130.5(G)(최소 내아크 정격)로 바꿨다.
- **밀폐공간 인식 누락** — 정규식의 캡처 그룹 오류로 `정화조`·`침전조`·`집수정` 이
  밀폐공간으로 인식되지 않아 산소·가스·환기·감시인 항목이 전부 빠졌다.
- **우천·온도 인식** — `폭우`·`소나기`·`장마` 가 우천이 아니었고, `영하 40도` 가
  폭염으로, `체감온도 100도` 가 안전으로, `35도 각도` 가 폭염으로 판정됐다.
- **자정을 넘기는 작업 일정** — `22시~06시` 의 소요 시간이 0 으로 뭉개져 2 시간 주기
  가스 재측정이 사라졌다. 체크포인트 정렬도 벽시계 순이라 종료 확인이 맨 위에 왔다.
- **출력 필터 우회** — 성공한 계산기 태그 옆 ±200 자의 모든 수치가 근거 없이
  통과했다. 계산기 태그의 근접 승인을 없앴다(실출력은 신뢰 입력으로 이미 통과한다).
  소문자·id 생략 태그도 막고, 돌지 않은 계산기를 댄 태그는 기록한다.
- **오류 분류** — 계산 경로의 거부를 422 로 옮기면서 내부 불변식(우리 표의 구멍)까지
  422 로 바꿔 경보를 죽였다. 되돌리고 조합 커버리지 게이트를 뒀다. 라우트가
  `error.field` 를 버려 화면이 어느 칸도 짚지 못하던 것도 배선했다.
- **표 조회 오류 흡수** — 허용전류표가 깨져도 HTTP 200 으로 "요구 전류를 만족하는
  규격이 없습니다" 가 나갔다. 도메인적으로 거짓인 문장이다.
- **답변 채택 데드락** — 잠금 순서가 답변 → 질문이라 질문 작성자의 더블클릭으로
  순환 대기가 났다(마이그레이션 008).

### Changed
- `ENGINE_VERSION` 0.1.0 → **0.2.0**. KEC PVC 최고허용온도 수리로 표 밖 온도의
  보정계수가 달라졌다. 옛 판 영수증은 재실행이 안 되므로 내보내기 검증이
  `ENGINE_VERSION_DRIFT` 로 "우리가 식을 바꿨다" 와 "영수증이 위조다" 를 구분한다.
- `GET /api/openapi` 의 `/calculate` 응답 목록에 실제로 나가는 상태(401·403·422·429·500)를
  선언했다. 라우트 소스와 선언을 대조하는 검사를 함께 뒀다.
- 현장 안전 체크리스트에 정전 작업 뒷단계(잔류전하 방전·단락접지·재통전 전 확인)와
  밀폐공간 철수·재진입 구간(인원 점검·출입금지·재진입 조건)을 추가했다.
- 파서가 위험을 인식했는데 다룰 항목이 없으면 **그 사실을 항목으로 고지**한다.
  침묵은 "문제없음" 으로 읽힌다.

### Fixed (이전 배치)
- **AI 계산 경로** — 홈 일반 질문과 Studio 무파일 질문을 공용 `/api/chat` 경로에 연결했다. 완전한 계산 질문은 정본 계산기 레지스트리를 먼저 실행하고 입력·결과 영수증을 모델과 UI에 전달하며, 불완전한 입력은 임의 계산하지 않는다.
- **호환 모델 전송 방식** — Groq, Ollama, LM Studio, 온프레미스 OpenAI 호환 공급자를 Responses API가 아닌 Chat Completions 계약으로 호출한다.
- **채팅 지침 경계** — 클라이언트 `systemPrompt` 신뢰를 제거하고 서버 소유 전기 직무 지침과 사용자 메시지를 분리했다.
- **False compliance (SLD/Layout/Standards)** — Hardcoded `compliant: true` and assumed 100A load removed. Unverified ratings return `compliant: null` (HOLD) with explicit notes; consensus no longer scores HOLD as pass/fail.
- **Receipt 404 path** — Added `GET /api/receipt/[id]` alias (loads calculation receipts); UI path no longer dead.
- **Demo verification report** — Removed demo fallback and `/report/demo` nav link; missing reports show honest empty state. Excel export uses POST `/api/export`.
- **Quality checklist empty PASS** — Required missing params yield `needs-data` (not pass); empty input overall score is 0.
- **Chat unsourced numbers** — Wired `filterLLMOutput` after stream; search chat panel replaces text when filter fails.
- **DXF/PDF when FLAG-OFF** — SLD tabs disabled with reason when `DRAWING_PARSER=false`.
- **SOS honesty** — API/UI state that only in-app log exists (no SMS/email/push).
- **Calculator input-contract drift (57/57 restored)** — `CALCULATOR_PARAMS` (the UI form field names) had drifted from the calculator functions' actual input names. With no rename layer between form → API → calculator, 52 of 57 calculators threw `"<field> ... got undefined"` in production; unit tests missed it because they call the functions directly. Realigned every field name to the calculator contract (verbatim from each interface), fixed silent unit bugs (surge-arrester kV→V 1000× error, power-loss Ω/km·km, ground-resistance rod diameter mm) and enum values. Now 57/57 produce a value + `SourceTag` through the real form path.
- **Rate limiting not actually invoked** — `applyRateLimit` was imported but never called on API routes; wired across routes (note: the Next.js 16 `src/proxy.ts` entry also applies a 60/min gate first, so route-level `default` profiles are redundant — tracked).
- **Safety features**: confined-space returned an empty checklist (risk "low") for hazardous non-confined locations (e.g. 전기실); dead-man switch used `requestAnimationFrame` and froze when the tab backgrounded; SOS state auto-reset within frames; checked safety items were not recorded in the completion receipt (compliance always 0%).
- **Standards judgment**: articles carrying a `value: 0` placeholder threshold auto-PASS'd (`>= 0`) or always-FAIL'd (`<= 0`); now return **HOLD** with the source rule.

### Added
- **로컬 ChatGPT 계정 공급자** — 같은 PC의 공식 Codex 로그인과 stdio app-server를
  사용해 별도 OpenAI Platform API 키 없이 채팅·계산 영수증 설명·SLD·OCR·도면
  전문팀 검토를 실행한다. 설정 화면에서 실제 계정 모델을 선택하며, 비-loopback
  요청과 명령·파일·MCP·웹·승인 이벤트는 fail-closed로 차단한다.
- **로컬 Vision 구조화 출력** — 무효한 범용 object 스키마를 SLD·OCR·전체도면의
  완전한 스키마로 교체하고, 서로 다른 역할 출력은 JSON 전용 프롬프트와 기존
  역할별 엄격 파서로 검증한다.
- **AI 계산 실왕복 게이트** — `npm run gate:chat-live`가 production 서버, 정본 전압강하 계산기, 모델 입력 영수증, SSE 표시 순서를 실제 HTTP로 검증한다.
- **SLD 구획 경계 연속성** — `Pxx-A` 논리 구획, `Pxx-C` 경계선, `Pxx-U` 미확정 끝점과 전체 도면 재합성 영수증을 추가했다.
- **문서 정본 지도와 자동 검사** — 현재 정본, 검증 원장, 설계 참고, 역사 기록을 분류하고 로컬 링크·환경 변수 중복을 검사한다.
- **Array-input calculator forms** — `CalculatorForm` gains `type: 'array'` (repeatable rows, `flatten` for primitive arrays); wires the 7 list-input calculators (loads/sections/transformers/emergencyLoads) that a flat form could not express.
- **Dedicated standards evaluators** — breaking-capacity (IEC-434.1/533.1, JIS-434.1) and ampacity (NEC-310.16, IEC-523.1) promoted from HOLD to real judgment; thresholds come only from authoritative tables or measured inputs.
- **AX design** — `/preview/ax` (thread home + answer + mobile, receipt-as-first-class, governance status bar); AX palette + typography (navy + amber, warm paper, IBM Plex Sans KR / Noto Serif KR / IBM Plex Mono) applied app-wide via the token system.
- **Observability** — Sentry instrumentation + client/server/edge configs (DSN-gated, no hardcoded secrets); `SECURITY.md`; `/api/analytics`.
- **Regression guard** — `calculator-params-contract.test.ts` exercises all 57 calculators through the real form-submit path (value + source), preventing contract drift from returning.

### Changed
- App-wide theme re-mapped to AX: `--color-primary` navy `#1e3a5f`, `--color-accent` amber `#b45309`, warm-paper surfaces, IBM Plex Sans KR body font (light + warm-dark).
- README, 아키텍처, 사용자·API·평가·기여·보안 문서를 현재 production 배선과 검증 경계 기준으로 재구성했다. 고정 페이지·테스트 수와 외부 근거 없는 경쟁 우위·범용 정확도 주장은 제거했다.

### Removed
- Safety copy that promised delivery not yet implemented ("관리자에게 즉시 발송", "자동 신고") — no SMS/push/email channel exists, so the claims were removed until delivery is built.

## [0.2.0] - 2026-04-14

### Added
- **IEC 60364-5-52 Ampacity Tables** — 19 sizes x 6 methods x Cu/Al x PVC/XLPE/EPR (~200+ values)
- **Calculator Thresholds Config** — Centralized 7 hardcoded constants into `calc-thresholds.ts`
- **CompositeCondition DSL** — AND/OR logic for multi-condition article evaluation
- **8 Physics Laws** — V=IR, P=VI, VD%, Q=Ptan(phi), S=P/cos(phi), I^2R, Z=sqrt(R^2+X^2), E=Pt
- **MV/HV Voltage Constants** — 3.3kV through 765kV (11 levels)
- **6 New Standard Drawing Templates** — EV charging, Solar PV, UPS/Emergency, MV switchgear, Data center, total 11
- **12 New Material Prices** — Oil transformers, EV chargers, PV modules, UPS, ESS (56 total)
- **4 New JIS Articles** — Short-circuit, insulation, seismic, medical (18 total)
- **NEC Cross-References** — All 42 articles now have relatedClauses (KEC/IEC/JIS equivalents)
- **7 Page Loading Skeletons** — Dashboard, SLD, OCR, Community, Projects, Settings, History
- **Orchestrator Retry** — Exponential backoff (500ms, 1s) on team dispatch failure
- **VLM Retry + Key Validation** — 2-retry with backoff, API key format checks
- **Server AI Timeout** — 5s timeout guard + multi-provider failover
- **BFS Cache** — Knowledge graph query cache (5-min TTL, 200-entry LRU)
- **Ranking Reasoning** — EngRank now explains why each result ranked high

### Improved
- **Calculator Types** — Added `uncertaintyRange` and `warnings[]` fields
- **Debate Protocol** — Enum-based CALC_TO_PARAM mapping (17 calculators)
- **Safety Policies** — 17 injection patterns (was 8), 16 test cases (was 2)
- **Vision Splitter** — Dynamic image dimension parsing from PNG/JPEG headers
- **Layout Team** — LAYOUT_CONFIG object, 24 cable OD entries, configurable conduit fill
- **Standards Team** — Type-safe param extraction, error logging
- **Sandbox Agent** — Safe array access, dataScope parsing fix
- **Notifications API** — PATCH authentication + rate limiting
- **Admin API** — `isDemo` field for demo data detection
- **Multi-Team Review** — Team score breakdown + top findings/commendations
- **Gen-Verify-Fix** — `convergenceReason` field explaining loop termination
- **Pages** — aria-label/aria-pressed on SLD/Community buttons, search debounce (300ms)

### Fixed
- Standard drawing connection validation bug (was checking extractedTypes[0])
- JIS 523.1 loadCurrent stub (value: 0 placeholder)
- Cable sizing hardcoded `0.08` reactance, `3%` voltage drop
- Short-circuit hardcoded `kPeak = 1.8` (now dynamic per voltage level)

### Stats
- 22 test suites / 336 tests (was 323)
- 245+ standard articles (was 211)
- 56 material prices (was 44)
- 11 drawing templates (was 5)
- E2E: 28 Playwright tests (was 12)

## [0.1.0] - 2026-04-13

### Added
- **4-Team Agent System** — Orchestrator + SLD/Layout/Standards/Consensus teams
- **Debate Protocol** — Physics-law validation (V=IR, P=VI), 3-round consensus, HITL escalation
- **Vision Pipeline** — DXF/PDF vector parsing, VRAM-split parallel vision, 150+ electrical symbol DB
- **52+ Engineering Calculators** — Voltage drop, cable sizing, arc flash (IEEE 1584), short-circuit, grounding, solar PV, transformer, lighting, motor, power factor, demand factor, conduit fill, and more
- **Standards Engine** — KEC (61+75 extended), NEC (41), IEC (25), JIS (15) = 211+ articles in condition-tree DSL
- **Receipt System** — SHA-256 hash, timestamp, model tracking, optional IPFS pinning
- **BYOK System** — AES-GCM encrypted API key storage (session-scoped)
- **5-Stage DAG Pipeline** — EXTRACT → LOOKUP → CALCULATE → VERIFY → REPORT
- **19 Pages** — Search, calculators, standards browser, glossary, comparison, dashboard, projects, receipts, settings, admin, community, and more
- **31 API Endpoints** — Including OpenAPI 3.1 self-documenting spec and health check dashboard
- **Multi-Model LLM Support** — Google Gemini 2.5, OpenAI GPT-4.1, Anthropic Claude 4, Groq Llama 4, Mistral, Ollama
- **170+ Electrical Constants** — Centralized with source references (IEEE 1584, KEC, NEC, IEC)
- **250+ IEC 60050 Terms** — 4-language electrical terminology (KR/EN/JP/ZH)
- **200+ Synonym Mappings** — Abbreviation to full-name
- **ARI Circuit Breaker** — EMA-based automatic failover for LLM providers
- **9 Guardrail Rules** — Blocking rules for safety-critical estimations
- **Chief Principal Engineer Persona** — 30-year experience, Engineering Review Report format
- **22 Test Suites / 323 Tests** — Calculator accuracy ±0.01%, standards DSL, LLM tools
- **PWA Support** — Service Worker + IndexedDB for offline capability
- **Accessibility** — Skip links, ARIA labels, keyboard navigation, focus management
- **Security** — Input sanitization, URL allowlist, rate limiting, BYOK encryption

### Technical
- Next.js 16 (App Router) with Turbopack
- TypeScript strict mode
- Tailwind CSS 4 with `@layer components`
- Firebase Auth + Supabase + Stripe
- Vercel AI SDK (multi-provider)
- Zustand + React Query
- Weaviate vector DB with local fallback
