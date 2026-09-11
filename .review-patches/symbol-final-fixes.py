from pathlib import Path
import subprocess

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

# An explicit conflict discovered by the classifier must not coexist with a
# claimsComplete report. Preserve already read values, not a false completion.
p='src/agent/drawing/drawing-document-report.ts'
assert Path(p).read_bytes()==subprocess.check_output(['git','show',f'9327c3afcd8a090be90d699c071b7d59b202700f:{p}'])
rep(p,"  if (input.evidenceGraph.symbols.some((item) => item.certainty !== 'confirmed')) {", """  if (input.evidenceGraph.symbols.some((item) => item.classification && item.classification.status !== 'classified')) {
    addHoldReason(holdReasons, 'UNREADABLE_SYMBOL');
  }
  if (input.evidenceGraph.symbols.some((item) => item.certainty !== 'confirmed')) {""")
p='src/engine/topology/__tests__/symbol-classification.test.ts'
rep(p,"import { applyDrawingCorrection }", "import { uncertaintyDocument } from '@/agent/drawing/test-support/uncertainty-document';\nimport { buildDrawingDocumentV3 } from '@/agent/drawing/drawing-document-report';\nimport { applyDrawingCorrection }")
rep(p,"describe('real DXF -> V3 -> feedback and report', () => {", """describe('real DXF -> V3 -> feedback and report', () => {
  it('classification metadata does not demote an otherwise verified complete document', () => {
    const document = uncertaintyDocument(), f = setup(); f.run();
    document.evidenceGraph.symbols[0].classification = f.components[1].classification;
    const result = buildDrawingDocumentV3({ ...document, documentPageCount: document.pageCount });
    expect(result.verification.claimsComplete).toBe(true);
    expect(result.evidenceGraph.symbols[0].certainty).toBe('confirmed');
  });
  it('a classification conflict blocks document completion without deleting valid raw results', () => {
    const document = uncertaintyDocument(), f = setup(); f.run();
    const symbol = document.evidenceGraph.symbols[0];
    symbol.classification = { ...f.components[1].classification!, status: 'review', method: 'unresolved',
      selectedType: undefined, reasons: ['TEXT_CONFLICT'] };
    const result = buildDrawingDocumentV3({ ...document, documentPageCount: document.pageCount });
    expect(result.verification).toMatchObject({ claimsComplete: false, documentStatus: 'HOLD', holdReasons: ['UNREADABLE_SYMBOL'] });
    expect(result.evidenceGraph.symbols[0]).toMatchObject({ confirmedType: 'breaker', certainty: 'confirmed' });
  });""")
p=Path('docs/project/handoffs/2026-09-11-symbol-classification-first.md')
p.write_text(p.read_text()+'''
분류기가 원문·회사 사전의 충돌을 발견했지만 이전 종류 판독 자체는 confirmed로 남는 경우, 문서 전체를 완료로 표시하지 않도록 완료 영수증에도 분류 예외를 반영했다. 정상 확정값을 지우거나 미확정이 없는 문서를 함께 강등하지 않는다. 기존 완료 양성 사례와 충돌 음성 사례를 따로 검사한다. 원본과 같은 종류를 다시 확인한 경우에는 연관된 유사도 분류를 불필요하게 되돌리지 않는다.
''')
print('No-op confirmations retained; new conflicts prevent false document completion without discarding verified values.')
