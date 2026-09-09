from pathlib import Path
p=Path('src/agent/drawing/rated-value-extractor.ts');s=p.read_text()
old="field: quantity.unit.toLowerCase(), raw, normalized: { value: quantity.value, unit: quantity.unit },"
assert s.count(old)==1
s=s.replace(old,"field: quantity.unit.toLowerCase().includes('var') ? 'reactivePower'\n          : /va$/i.test(quantity.unit) ? 'capacity' : quantity.unit === 'A' ? 'current'\n            : quantity.unit === 'kA' ? 'breakingCapacity' : /v/i.test(quantity.unit) ? 'voltage'\n              : /w/i.test(quantity.unit) ? 'power' : 'size',\n        raw, normalized: { value: quantity.value, unit: quantity.unit },")
p.write_text(s)
p=Path('src/engine/topology/test-support/feedback-dxf.ts');s=p.read_text()
s="import { createHash } from 'node:crypto';\n"+s
s=s.replace("  document.title = '피드백 재사용 합성 도면';", "  document.documentHash = createHash('sha256').update(source).digest('hex');\n  document.title = '피드백 재사용 합성 도면';")
p.write_text(s)
# Existing Node tests transpile slices of production source. Keep the new direct
# imports in those slices; do not alter their assertions or replace production code.
p=Path('scripts/lib/drawing-commercial.node-test.mjs');s=p.read_text()
old="'agent/drawing/cross-page-graph'"
assert s.count(old)==1
s=s.replace(old,"'agent/drawing/rated-quantities', "+old)
p.write_text(s)
p=Path('scripts/lib/ax-precision.node-test.mjs');s=p.read_text()
if "'cross-page-graph'" in s and "'rated-quantities'" not in s:
 s=s.replace("'cross-page-graph'","'rated-quantities', 'rated-value-extractor', 'cross-page-graph'")
 p.write_text(s)
# Remove only this task's temporary .ts copy so TS/ESLint do not treat it as a product module.
Path('.review-patches/rated-value-extractor.ts').unlink()
print('Preserved rating consumer field names and fixture identities.')
