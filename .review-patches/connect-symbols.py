from pathlib import Path
import subprocess
BASE='9327c3afcd8a090be90d699c071b7d59b202700f'
changed=set()
def rep(name,old,new,count=1):
 p=Path(name)
 if name not in changed:
  assert p.read_bytes()==subprocess.check_output(['git','show',f'{BASE}:{name}']),f'baseline drift: {name}'
 s=p.read_text();assert s.count(old)==count,(name,s.count(old),old[:120]);p.write_text(s.replace(old,new));changed.add(name)

p='src/lib/symbol-feedback.ts'
rep(p,"import { SLD_COMPONENT_TYPES", "import { readSymbolShape, type SymbolShape } from './symbol-shape';\nimport { SLD_COMPONENT_TYPES")
rep(p,'export interface DxfSymbolIdentity {','export interface DxfSymbolIdentity {\n  /** Optional on legacy records; produced from original vector geometry, never a hash approximation. */\n  shape?: SymbolShape;')
rep(p,'  return { blockName: value.blockName.trim(), fingerprint: value.fingerprint };', '''  const shape = value.shape === undefined ? undefined : readSymbolShape(value.shape);
  if (value.shape !== undefined && !shape) return undefined;
  return { blockName: value.blockName.trim(), fingerprint: value.fingerprint, ...(shape ? { shape } : {}) };''')
p='src/lib/sld-recognition.ts'
rep(p,'export interface SLDComponent {','''export interface SLDComponent {
  /** Parser-owned derived metadata; parseSLDResponse does not accept it from model JSON. */
  symbolShape?: import('./symbol-shape').SymbolShape;
  classification?: import('./symbol-classification').SymbolClassification;''')
rep(p,'export interface SLDAnalysis {','export interface SLDAnalysis {\n  classificationStats?: import(\'./symbol-classification\').SymbolClassificationStats;')
p='src/agent/teams/types.ts'
rep(p,'export interface ExtractedComponent {','''export interface ExtractedComponent {
  symbolShape?: import('@/lib/symbol-shape').SymbolShape;
  classification?: import('@/lib/symbol-classification').SymbolClassification;''')
p='src/agent/drawing/types-v3.ts'
rep(p,'export interface SymbolNode {','export interface SymbolNode {\n  classification?: import(\'@/lib/symbol-classification\').SymbolClassification;')
rep(p,'evidence-graph-continuity-v10','evidence-graph-continuity-v11')

p='src/engine/topology/dxf-parser.ts'
rep(p,"import DxfParserModule", "import { describeSymbolShape, type SymbolShape } from '@/lib/symbol-shape';\nimport { classifyDxfSymbols } from './symbol-classifier';\nimport DxfParserModule")
rep(p,'  const fingerprintMemo = new Map<string, string | null>();', '''  const fingerprintMemo = new Map<string, string | null>();
  const shapeMemo = new Map<string, SymbolShape | null>();
  const classificationTexts = new Map<string, string[]>();
  const blockShape = (name: string): SymbolShape | undefined => {
    if (shapeMemo.has(name)) return shapeMemo.get(name) ?? undefined;
    // Exact parsing is not curtailed when the optional comparison budget is exhausted.
    if (shapeMemo.size >= 512) return undefined;
    const entities = dxf?.blocks?.[name]?.entities;
    const shape = entities ? describeSymbolShape(entities) : null;
    shapeMemo.set(name, shape); return shape ?? undefined;
  };''')
rep(p,'          type,\n          label: entity.name,','          type,\n          symbolShape: blockShape(entity.name),\n          label: entity.name,')
rep(p,"properties: { blockName: entity.name, layer: entity.layer ?? '',", "properties: { blockName: entity.name, layer: entity.layer ?? '', symbolRotation: String(entity.rotation ?? 0),")
rep(p,'    if (closestComp) {\n      if (t.spec.voltage)', '''    if (closestComp) {
      // Similarity context only uses an unambiguous nearest local text anchor.
      // Row-based fallback and equal-distance text do not become corroboration.
      const local = closestDist < textProximityThreshold && !components.some((candidate) => candidate.id !== closestComp!.id
        && euclideanDist({ x: t.x, y: t.y }, candidate.position) <= closestDist + 1e-6);
      if (local && !isCableSpec) {
        const records = classificationTexts.get(closestComp.id) ?? [];
        if (records.length < 16) { records.push(t.text.slice(0, 1000)); classificationTexts.set(closestComp.id, records); }
      }
      if (t.spec.voltage)''')
rep(p,'  return {\n    components,\n    connections: snap.connections,', '''  const classificationStats = classifyDxfSymbols(components, snap.connections,
    { library: options.symbolLibrary, index: libraryIndex, texts: classificationTexts });
  return {
    components,
    classificationStats,
    connections: snap.connections,''')
p='src/agent/teams/sld-team.ts'
rep(p,'        properties: c.properties,','        properties: c.properties,\n        symbolShape: c.symbolShape,\n        classification: c.classification,',2)
p='src/agent/drawing/team-result-adapter.ts'
rep(p,"import { readDxfSymbolIdentity }", "import { readSymbolClassification } from '@/lib/symbol-classification';\nimport { readDxfSymbolIdentity }")
rep(p,"sourceSymbol: readDxfSymbolIdentity({ blockName: component.properties?.blockName, fingerprint: component.properties?.blockFingerprint }),", "sourceSymbol: readDxfSymbolIdentity({ blockName: component.properties?.blockName, fingerprint: component.properties?.blockFingerprint, shape: component.symbolShape }),\n      ...(context.positionSpace === 'source' && component.classification ? { classification: readSymbolClassification(component.classification) } : {}),")
p='src/agent/drawing/evidence-deduplicator.ts'
rep(p,'export interface RawSymbolHit {','export interface RawSymbolHit {\n  classification?: SymbolNode[\'classification\'];')
rep(p,"import ", "import ",0) if False else None
# Insert a new import before the first ordinary import without duplicating existing imports.
f=Path(p);s=f.read_text();pos=s.index('import ');s=s[:pos]+"import { readSymbolClassification, unresolvedClassification } from '@/lib/symbol-classification';\n"+s[pos:];f.write_text(s)
rep(p,'if (dup.sourceSymbol && JSON.stringify(dup.sourceSymbol) !== JSON.stringify(hit.sourceSymbol)) {', '''if (dup.sourceSymbol && (dup.sourceSymbol.blockName !== hit.sourceSymbol.blockName
          || dup.sourceSymbol.fingerprint !== hit.sourceSymbol.fingerprint
          || (dup.sourceSymbol.shape && hit.sourceSymbol.shape && JSON.stringify(dup.sourceSymbol.shape) !== JSON.stringify(hit.sourceSymbol.shape)))) {''')
rep(p,'        } else dup.sourceSymbol = { ...hit.sourceSymbol };','        } else dup.sourceSymbol = { ...hit.sourceSymbol, ...(hit.sourceSymbol.shape ?? dup.sourceSymbol?.shape ? { shape: hit.sourceSymbol.shape ?? dup.sourceSymbol?.shape } : {}) };')
rep(p,'      dup.typeCandidates = unique([...dup.typeCandidates, ...hitCandidates]);', '''      dup.typeCandidates = unique([...dup.typeCandidates, ...hitCandidates]);
      const incomingClassification = readSymbolClassification(hit.classification);
      const classificationConflict = typeConflict || conflictingOrigins.has(dup.id)
        || (dup.classification?.selectedType && incomingClassification?.selectedType
          && dup.classification.selectedType !== incomingClassification.selectedType);
      if (classificationConflict && (dup.classification || incomingClassification)) {
        dup.classification = unresolvedClassification('MERGED_CONFLICT', dup.classification ?? incomingClassification);
      } else if (incomingClassification && !dup.classification) dup.classification = incomingClassification;''')
rep(p,'      typeCandidates: hitCandidates,','      typeCandidates: hitCandidates,\n      ...(hit.classification ? { classification: readSymbolClassification(hit.classification) } : {}),')
p='src/agent/drawing/apply-drawing-correction.ts'
rep(p,"import { randomUUID }", "import { updateClassificationsAfterCorrection } from '@/lib/symbol-classification-correction';\nimport { randomUUID }")
rep(p,'  const lines = current.evidenceGraph.lines.map((item) => ({ ...item }));', '  updateClassificationsAfterCorrection(symbols, input, targetPage);\n  const lines = current.evidenceGraph.lines.map((item) => ({ ...item }));')

p='src/components/DrawingDocumentV3Report.tsx'
rep(p,"import { DrawingReviewQueue }", "import { SymbolClassificationResults } from './SymbolClassificationResults';\nimport { DrawingReviewQueue }")
rep(p,"type Tab = 'counts'", "type Tab = 'classifications' | 'counts'")
rep(p,"  const [tab, setTab] = useState<Tab>(document.unresolvedItems.length ? 'unresolved' : 'counts');", "  const hasClassifications = document.evidenceGraph.symbols.some((node) => node.classification);\n  const [tab, setTab] = useState<Tab>(hasClassifications ? 'classifications' : document.unresolvedItems.length ? 'unresolved' : 'counts');")
rep(p,"  ];\n\n  return (", "  ];\n  if (hasClassifications) tabs.unshift(['classifications', '분류 결과']);\n\n  return (")
rep(p,"        {tab === 'counts'", '''        {tab === 'classifications' && <SymbolClassificationResults title="심볼 분류 결과"
          rows={document.evidenceGraph.symbols.map((node) => ({ id: node.displayId, label: node.rawLabel,
            sourceType: node.confirmedType ?? node.typeCandidates[0] ?? 'unknown', classification: node.classification }))}
          onSelect={onSelectDisplayId} onCorrect={onCorrect} correcting={Boolean(correctingDisplayId)} />}
        {tab === 'counts' ''')
# The added space before && is insignificant JSX whitespace, not a contract change.
p='src/app/(with-nav)/tools/sld/page.tsx'
rep(p,"import { DrawingReadingSummary }", "import { SymbolClassificationResults } from '@/components/SymbolClassificationResults';\nimport { DrawingReadingSummary }")
rep(p,'          <QuickDrawingResultTabs', '''          <SymbolClassificationResults title="빠른 심볼 분류 결과"
            rows={analysis.components.map((component) => ({ id: component.id, label: component.label,
              sourceType: component.type, classification: component.classification }))} />
          {analysis.classificationStats && <p className="text-xs text-[var(--text-secondary)]">
            형상 비교 {analysis.classificationStats.shapeComparisons}회 · 반복 형상 결과 재사용 {analysis.classificationStats.reusedShapeComparisons}회.
            이번 분류 단계의 추가 모델 호출 {analysis.classificationStats.additionalModelCalls}회. 전체 분석 비용 절감률은 별도 실측 대상입니다.
          </p>}
          <QuickDrawingResultTabs''')
p='src/lib/export-drawing-document.ts'
rep(p,"import { summarizeDrawingReadState }", "import { SYMBOL_CLASSIFICATION_REASONS } from '@/lib/symbol-classification';\nimport { summarizeDrawingReadState }")
rep(p,"  for (const symbol of symbols) {\n    add({ section: '기기'", """  for (const symbol of symbols) {
    const classification = symbol.classification;
    if (classification) add({ section: '심볼 분류', displayId: cell(symbol.displayId),
      kind: cell(classification.selectedType, classification.candidates.map((candidate) => candidate.type).join('/') || '미판독'),
      detail: `${classification.method} · ${classification.reasons.map((reason) => SYMBOL_CLASSIFICATION_REASONS[reason]).join(' / ')} · 형상 유사도(확률 아님): ${classification.candidates.map((candidate) => `${candidate.type}=${candidate.similarity.toFixed(3)}`).join(' / ')} · 대조 사례: ${classification.referenceKeys.join(' / ')} · 정격·결선 확정과 별개`,
      certainty: classification.status === 'classified' ? classification.method === 'family-context' ? '자동 분류' : '분류됨' : classification.status === 'review' ? '예외 검토' : '미판독',
      ...sourceColumns(symbol.evidence) });
    add({ section: '기기'""")
p='scripts/lib/drawing-commercial.node-test.mjs'
rep(p,"'lib/security-hardening',", "'lib/symbol-classification', 'lib/sld-component-types', 'lib/security-hardening',")
p='scripts/lib/ax-precision.node-test.mjs'
rep(p,"['symbol-feedback', 'sld-component-types']", "['symbol-feedback', 'sld-component-types', 'symbol-shape', 'symbol-classification']")
rep(p,"writeFileSync(adapter, readFileSync(adapter, 'utf8').replace('require(\"@/lib/symbol-feedback\")', 'require(\"./lib/symbol-feedback\")'));", '''for (const file of [adapter, path.join(build, 'evidence-deduplicator.js')]) {
  writeFileSync(file, readFileSync(file, 'utf8').replace(/require\\(\"@\\/lib\\/([^\"]+)\"\\)/g,
    (_, name) => `require(\"./lib/${name}\")`));
}''')

# Source reviews catch unsafe promotion even before an integration fixture runs.
p=Path('src/engine/topology/symbol-classifier.ts');s=p.read_text()
s=s.replace('similarity: score, keys: [ref.key]', 'similarity: score, keys: score >= SYMBOL_CLASSIFIER_POLICY.automaticMinimum ? [ref.key] : []')
p.write_text(s)
print('CONNECTED_PRODUCT_FILES',len(changed))
