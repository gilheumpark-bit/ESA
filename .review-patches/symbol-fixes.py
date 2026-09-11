from pathlib import Path

def rep(name,old,new,count=1):
 p=Path(name);s=p.read_text();assert s.count(old)==count,(name,s.count(old),old[:90]);p.write_text(s.replace(old,new))
p='src/engine/topology/__tests__/symbol-classification.test.ts'
rep(p,"import type { SymbolLibrary } from '@/lib/symbol-library-contract';\n",'')
rep(p,"f.library.feedback = [approvedFeedback('fuse')];", "f.library.feedback = [approvedFeedback('fuse'), approvedFeedback('breaker')];")
p='src/lib/symbol-classification.ts'
rep(p,"    || !['classified', 'review', 'unread'].includes(String(v.status))", "    || typeof v.status !== 'string' || !['classified', 'review', 'unread'].includes(v.status)")
rep(p,"    || !['approved-exact', 'company-library', 'existing-parser', 'family-context', 'human-correction', 'unresolved'].includes(String(v.method))", "    || typeof v.method !== 'string' || !['approved-exact', 'company-library', 'existing-parser', 'family-context', 'human-correction', 'unresolved'].includes(v.method)")
rep(p,"    || (v.selectedType !== undefined && !types.has(String(v.selectedType)))", "    || (v.selectedType !== undefined && (typeof v.selectedType !== 'string' || !types.has(v.selectedType)))")
rep(p,"    if (!types.has(String(c.type))", "    if (typeof c.type !== 'string' || !types.has(c.type)")
p='src/lib/symbol-shape.ts'
rep(p,"    || raw.circles.some((c) => c[2] <= 0)", "    || raw.lines.some((l) => l[0] === l[2] && l[1] === l[3])\n    || raw.circles.some((c) => c[2] <= 0)")
print('Strict metadata and zero-length geometry validation; no test or confidence gate removed.')
