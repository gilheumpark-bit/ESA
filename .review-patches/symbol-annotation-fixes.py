from pathlib import Path

def rep(name,old,new,count=1):
 p=Path(name);s=p.read_text();assert s.count(old)==count,(name,s.count(old),old[:100]);p.write_text(s.replace(old,new))
p='src/engine/topology/dxf-parser.ts'
rep(p,'  const classificationStats = classifyDxfSymbols(components, snap.connections,', '''  // Text within a block is not part of its geometry hash, but it can change
  // device meaning (for example an ATS or fuse marking). Compare geometry only
  // after preserving these literal context checks. Parse each definition once.
  const blockAnnotationMemo = new Map<string, string[]>();
  for (const component of components) {
    const name = component.properties?.blockName;
    if (!name) continue;
    let annotations = blockAnnotationMemo.get(name);
    if (!annotations) {
      annotations = [];
      const entities = dxf?.blocks?.[name]?.entities;
      if (blockAnnotationMemo.size >= 512 || (entities && entities.length > 256)) {
        annotations.push('__ESA_CONTEXT_TRUNCATED__');
      } else for (const raw of entities ?? []) {
        const item = raw as unknown as { type?: unknown; text?: unknown };
        if (typeof item.type !== 'string' || !['TEXT', 'MTEXT', 'ATTRIB', 'ATTDEF'].includes(item.type)) continue;
        if (typeof item.text !== 'string' || !item.text.trim()) continue;
        if (item.text.length > 1000 || annotations.length >= 16) {
          annotations.push('__ESA_CONTEXT_TRUNCATED__'); break;
        }
        annotations.push(item.text);
      }
      if (blockAnnotationMemo.size < 512) blockAnnotationMemo.set(name, annotations);
    }
    if (!annotations.length) continue;
    const combined = [...(classificationTexts.get(component.id) ?? []), ...annotations];
    classificationTexts.set(component.id, combined.length > 16
      ? [...combined.slice(0, 16), '__ESA_CONTEXT_TRUNCATED__'] : combined);
  }
  const classificationStats = classifyDxfSymbols(components, snap.connections,''')
p='src/engine/topology/__tests__/symbol-classification.test.ts'
rep(p,"  it('no company library means no invisible fallback learning', () => {", """  it.each(['FUSE', 'ATS1'])('internal block marking %s defeats ordinary repeated-role classification', (marking) => {
    const source = classificationDxf().replace('3\\nZZ-B92\\n1\\n\\n',
      `3\\nZZ-B92\\n1\\n\\n0\\nTEXT\\n8\\n0\\n10\\n5\\n20\\n5\\n40\\n2\\n1\\n${marking}\\n`);
    const analysis = parseDxfToSLD(source, { symbolLibrary: classifierLibrary() });
    const variant = analysis.components.find((item) => item.properties?.blockName === 'ZZ-B92')!;
    expect(variant.symbolShape).toBeDefined();
    expect(variant.classification?.status).toBe('review');
    expect(variant.classification?.reasons).toContain(marking === 'ATS1' ? 'SPECIAL_MARKING' : 'TEXT_CONFLICT');
  });
  it('a consistent literal block marking supports rather than blocks its classification', () => {
    const source = classificationDxf().replace('3\\nZZ-B92\\n1\\n\\n',
      '3\\nZZ-B92\\n1\\n\\n0\\nTEXT\\n8\\n0\\n10\\n5\\n20\\n5\\n40\\n2\\n1\\nMCCB\\n');
    const analysis = parseDxfToSLD(source, { symbolLibrary: classifierLibrary() });
    const variant = analysis.components.find((item) => item.properties?.blockName === 'ZZ-B92')!;
    expect(variant.classification).toMatchObject({ status: 'classified', selectedType: 'breaker' });
    expect(variant.classification?.reasons).toContain('TEXT_SUPPORT');
  });
  it('no company library means no invisible fallback learning', () => {""")
p=Path('docs/project/handoffs/2026-09-11-symbol-classification-first.md')
p.write_text(p.read_text()+'''
기하 descriptor에서 제외하는 블록 내부 TEXT/MTEXT/속성 기본 문구도 종류·특수 표식의 원문 문맥으로 별도 수집한다. 외부의 최근접 문자만 확인하고 블록 안의 FUSE/ATS를 놓치지 않도록 했다. 수집은 블록당 한 번, 같은 바이트/건수 한도를 사용하며 잘린 문맥은 자동 분류하지 않는다. 실제 DXF에 내부 FUSE/ATS1/MCCB 문구를 넣은 충돌·정상 대조 검사를 추가했다. 속성의 모든 동적 표시/해석을 인증한 것은 아니다.
''')
print('Internal block markings are retained as bounded semantic evidence, independent of geometric similarity.')
