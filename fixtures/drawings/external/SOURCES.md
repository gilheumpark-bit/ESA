# 외부 도면 테스트 코퍼스 (인터넷 공개·스캔/VLM 경로 검증)

Wikimedia Commons (CC 라이선스) 전기 단선도 — 한국 실발주 도면과 다른 스타일로
스캔/VLM 경로 일반성 검증용. 원본 SVG + sharp 렌더 PNG/JPG.

- wiki-oneline.svg/png — en.wikipedia.org/wiki/Single-line_diagram 대표 도면
  (발전기 200MW·3권선 변압기·분로 리액터·차단기·모선). VLM 판독 14개·conf 0.9.
- american.svg/png — Commons American_Distribution_System.svg
  (HV/MV 변전소→MV 피더→배전변압기 10→split-phase LV). VLM 35개(절단 salvage)·0.5.
- european.svg/png — Commons European_Distribution_System.svg
- wiring-real-sm.jpg — Commons Single-line_wiring_diagram.JPG(실사진: QS1·L1-3·FU1-6).
  VLM 8개·conf 0.9.

취득: Commons API imageinfo로 URL 확인 후 UA 준수 curl. 2026-07-21.
