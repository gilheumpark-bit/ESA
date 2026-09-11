from pathlib import Path

def rep(name,old,new,count=1):
 p=Path(name);s=p.read_text();assert s.count(old)==count,(name,s.count(old),old[:100]);p.write_text(s.replace(old,new))
p='src/lib/symbol-classification-correction.ts'
rep(p,'  const ref = target?.sourceSymbol ?', "  const sourceTypeChanged = target?.classification?.selectedType !== input.selectedValue.trim();\n  const ref = target?.sourceSymbol ?")
rep(p,"if ((input.correctionKind === 'type' && ref", "if ((input.correctionKind === 'type' && sourceTypeChanged && ref")
p='src/engine/topology/symbol-classifier.ts'
rep(p,"if (feedback.status === 'approved' && shape) refs.push", "if (feedback.status === 'approved' && shape\n      && !special.test(feedback.source.blockName.normalize('NFKC').replace(/[_-]/g, ' '))) refs.push")
p='src/engine/topology/__tests__/symbol-classification.test.ts'
rep(p,"  it('changing a source seed withdraws dependent automatic results but leaves original records', () => {", """  it('confirming an unchanged source type does not unnecessarily ask to review all its repeated uses', () => {
    const document = classificationDocument(); const seed = document.evidenceGraph.symbols.find((s) => s.sourceSymbol?.blockName === 'ZZ-A91')!;
    const changed = applyDrawingCorrection(document, { targetDisplayId: seed.displayId, correctionKind: 'type', selectedValue: 'breaker',
      correctedBy: 'synthetic-reviewer', idempotencyKey: 'same-source-0001' });
    expect(changed.evidenceGraph.symbols.find((s) => s.sourceSymbol?.blockName === 'ZZ-B92')?.classification)
      .toMatchObject({ method: 'family-context', status: 'classified' });
  });
  it('changing a source seed withdraws dependent automatic results but leaves original records', () => {""")
rep(p,"  it('an approved descriptor can support a new-name variation with explicit type evidence', () => {", """  it('an approved special-device pattern is not generalized as an ordinary family', () => {
    const f = setup(); f.components.splice(1, 2); f.connections.length = 0; f.library.entries = [];
    f.library.feedback = [{ ...approvedFeedback(), source: { ...approvedFeedback().source, blockName: 'ATS1' } }];
    f.texts.set('candidate', ['MCCB']); f.run(); expect(f.candidate.classification?.status).toBe('unread');
  });
  it('an approved descriptor can support a new-name variation with explicit type evidence', () => {""")
print('No-op confirmations retain valid inferences; special-device prototypes are not ordinary family seeds.')
