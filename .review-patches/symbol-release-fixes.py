from pathlib import Path

def rep(name,old,new,count=1):
 p=Path(name);s=p.read_text();assert s.count(old)==count,(name,s.count(old),old[:100]);p.write_text(s.replace(old,new))
p='src/engine/topology/symbol-classifier.ts'
rep(p,'  function repeated(component: SLDComponent, candidate: Ranked): string[] {', '''  const seededNeighbours = new Map([...adjacency].map(([id, neighbours]) =>
    [id, [...neighbours].filter((peerId) => seeds.has(peerId)).sort()] as const));
  function repeated(component: SLDComponent, candidate: Ranked): string[] {''')
rep(p,'    const anchors = new Set<string>();', '    const anchors = new Set<string>(), anchorPositions = new Set<string>();')
rep(p,'      for (const peerId of adjacency.get(busId) ?? []) {','      for (const peerId of seededNeighbours.get(busId) ?? []) {')
rep(p,'        anchors.add(peerId);', '''        const position = `${peer.position.x}:${peer.position.y}`;
        if (anchorPositions.has(position)) continue;
        anchorPositions.add(position); anchors.add(peerId);''')
p='src/engine/topology/__tests__/symbol-classification.test.ts'
rep(p,"  it('different connection degree prevents positional reuse', () => {", """  it('duplicated nodes at the same location do not supply two independent role anchors', () => {
    const f = setup(); f.components[2].position = { ...f.components[1].position }; f.run();
    expect(f.candidate.classification?.status).toBe('review');
  });
  it('different connection degree prevents positional reuse', () => {""")
rep(p,"  it('no company library means no invisible fallback learning', () => {", """  it.each(['pending', 'revoked'] as const)('does not reuse %s descriptors as classification examples', (status) => {
    const f = setup(); f.components.splice(1, 2); f.connections.length = 0; f.library.entries = [];
    f.library.feedback = [{ ...approvedFeedback(), status }]; f.texts.set('candidate', ['MCCB']); f.run();
    expect(f.candidate.classification?.status).toBe('unread');
  });
  it('an approved descriptor can support a new-name variation with explicit type evidence', () => {
    const f = setup(); f.components.splice(1, 2); f.connections.length = 0; f.library.entries = [];
    f.library.feedback = [approvedFeedback()]; f.texts.set('candidate', ['MCCB']); f.run();
    expect(f.candidate.classification).toMatchObject({ selectedType: 'breaker', status: 'classified', method: 'family-context' });
  });
  it('no company library means no invisible fallback learning', () => {""")
# Make benchmark artifacts attributable to this policy/version, not baseline AI quality.
p=Path('docs/project/handoffs/2026-09-11-symbol-classification-first.md')
p.write_text(p.read_text()+'''
## 통합 검토 보강

집중 실행34554287778에서 타입·무경고 린트·심볼/피드백/기존 파서와 독립 스크립트 계약이 통과했다. 그 이전 실행의 한 실패는 선택값을 아예 기록하지 않은 review 상태를 `selectedType:undefined` 속성이 존재해야 한다고 단언한 시험이었다. 선택값이 없다는 조건을 `not.toHaveProperty`로 명확히 해 유지했다. 자동 판단을 허용하거나 임계값을 낮춘 변경이 아니다.

반복 문맥은 전체 기기 대신 고정된 기등록 seed 인덱스를 사용한다. 같은 좌표에 중복된 기기를 별도 두 근거로 세지 않는다. 승인되지 않거나 취소된 descriptor는 유사도 참조에 넣지 않는 반대 조건과, 승인 descriptor의 새 이름 변형을 명시 종류 표기로 분류하는 정상 조건을 추가했다. 최종 전체 검사와 브라우저 결과는 별도 실행으로 확인한다.
''')
print('Frozen role index and independent location checks; approved and withdrawn descriptor reuse tested separately.')
