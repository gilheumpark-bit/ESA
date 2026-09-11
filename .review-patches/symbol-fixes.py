from pathlib import Path

def rep(name,old,new,count=1):
 p=Path(name);s=p.read_text();assert s.count(old)==count,(name,s.count(old),old[:100]);p.write_text(s.replace(old,new))
p='src/engine/topology/__tests__/symbol-classification.test.ts'
rep(p,"import type { SymbolLibrary } from '@/lib/symbol-library-contract';\n",'')
rep(p,"f.library.feedback = [approvedFeedback('fuse')];", "f.library.feedback = [approvedFeedback('fuse'), approvedFeedback('breaker')];")
rep(p,"expect(f.candidate.classification).toMatchObject({ status: 'review', selectedType: undefined, reasons: ['SHAPE_MATCH', 'INSUFFICIENT_CONTEXT'] });", "expect(f.candidate.classification).toMatchObject({ status: 'review', reasons: ['SHAPE_MATCH', 'INSUFFICIENT_CONTEXT'] });\n    expect(f.candidate.classification).not.toHaveProperty('selectedType');")
rep(p,"['SPARE', 'SPACE', 'ELCB', 'RCCB', 'ATS', '누전', '특수']", "['SPARE', 'SPACE', 'ELCB', 'RCCB', 'ATS', 'ATS1', 'ELCB3', '누전', '특수']")
rep(p,"  it('conflicting explicit text defeats a matching repeated position', () => {", """  it('discarded long or excessive text cannot be treated as no conflicting evidence', () => {
    const f = setup(); f.texts.set('candidate', ['__ESA_CONTEXT_TRUNCATED__']); f.run();
    expect(f.candidate.classification).toMatchObject({ status: 'review', reasons: ['BUDGET_LIMIT'] });
  });
  it('conflicting explicit text defeats a matching repeated position', () => {""")
p='src/lib/symbol-classification.ts'
rep(p,"    || !['classified', 'review', 'unread'].includes(String(v.status))", "    || typeof v.status !== 'string' || !['classified', 'review', 'unread'].includes(v.status)")
rep(p,"    || !['approved-exact', 'company-library', 'existing-parser', 'family-context', 'human-correction', 'unresolved'].includes(String(v.method))", "    || typeof v.method !== 'string' || !['approved-exact', 'company-library', 'existing-parser', 'family-context', 'human-correction', 'unresolved'].includes(v.method)")
rep(p,"    || (v.selectedType !== undefined && !types.has(String(v.selectedType)))", "    || (v.selectedType !== undefined && (typeof v.selectedType !== 'string' || !types.has(v.selectedType) || v.status !== 'classified'))")
rep(p,"    if (!types.has(String(c.type))", "    if (typeof c.type !== 'string' || !types.has(c.type)")
p='src/lib/symbol-shape.ts'
rep(p,"    || raw.circles.some((c) => c[2] <= 0)", "    || raw.lines.some((l) => l[0] === l[2] && l[1] === l[3])\n    || raw.circles.some((c) => c[2] <= 0)")
p='src/engine/topology/symbol-classifier.ts'
rep(p,'|RESERVE|SPECIAL)\\b|', '|RESERVE|SPECIAL)\\d*\\b|')
rep(p,"const conflict = component.properties?.feedbackConflict === 'true'", "const contextTruncated = (options.texts.get(component.id) ?? []).includes('__ESA_CONTEXT_TRUNCATED__');\n    const conflict = component.properties?.feedbackConflict === 'true'")
rep(p,"if (libraryType && component.type === libraryType && shape && !conflict", "if (libraryType && component.type === libraryType && shape && !conflict && !contextTruncated")
rep(p,"const reason = conflict ? 'LIBRARY_CONFLICT'", "const reason = contextTruncated ? 'BUDGET_LIMIT' : conflict ? 'LIBRARY_CONFLICT'")
rep(p,"    if (conflicts.has(component.id))", "    if ((options.texts.get(component.id) ?? []).includes('__ESA_CONTEXT_TRUNCATED__')) { component.classification = base({ status: 'review', reasons: ['BUDGET_LIMIT'] }); continue; }\n    if (conflicts.has(component.id))")
p='src/engine/topology/dxf-parser.ts'
rep(p,"        if (records.length < 16) { records.push(t.text.slice(0, 1000)); classificationTexts.set(closestComp.id, records); }", """        if (t.text.length > 1000 || records.length >= 16) {
          if (!records.includes('__ESA_CONTEXT_TRUNCATED__')) records.push('__ESA_CONTEXT_TRUNCATED__');
        } else records.push(t.text);
        classificationTexts.set(closestComp.id, records);""")
print('Strict metadata, zero-length geometry and incomplete-context guards; optional missing decision asserted explicitly.')
