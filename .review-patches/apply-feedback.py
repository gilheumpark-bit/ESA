from pathlib import Path
import subprocess
BASE='d73a19b5318d2a39ea80f02b62eba0429b44955b'
changed=set()
def replace(name, old, new, count=1):
    p=Path(name)
    if name not in changed:
        assert p.read_bytes()==subprocess.check_output(['git','show',f'{BASE}:{name}']), f'baseline changed: {name}'
    s=p.read_text();assert s.count(old)==count,(name,s.count(old),old[:100]);p.write_text(s.replace(old,new));changed.add(name)
def transform(name, fn):
    p=Path(name)
    if name not in changed:
        assert p.read_bytes()==subprocess.check_output(['git','show',f'{BASE}:{name}']), f'baseline changed: {name}'
    p.write_text(fn(p.read_text()));changed.add(name)

replace('src/agent/drawing/types-v3.ts','export interface RatedValue {','''export interface RatedValue {
  sourceTextId?: string;
  readingCertainty?: Certainty;
  assignment?: {
    certainty: Certainty;
    candidateSymbolIds: string[];
    symbolId?: string;
    reason: 'explicit-tag' | 'enclosing-body' | 'proximity-only' | 'multiple-owners' | 'no-local-owner' | 'missing-geometry';
  };''')
replace('src/agent/drawing/types-v3.ts','export interface SymbolNode {','''export interface SymbolNode {
  sourcePatterns?: import('@/lib/reviewed-symbol-feedback').DxfSourcePattern[];
  appliedFeedbackIds?: string[];''')
replace('src/agent/drawing/types-v3.ts','evidence-graph-continuity-v9','evidence-graph-continuity-v10')
transform('src/agent/drawing/rated-value-extractor.ts',lambda _:Path('.review-patches/rated-value-extractor.ts').read_text())

p='src/agent/drawing/cross-page-graph.ts'
replace(p,"import type { CrossPageRelation", "import { ratedValueAssignment } from './rated-value-extractor';\nimport { parseRatedQuantities, quantityVolts } from './rated-quantities';\nimport type { CrossPageRelation")
replace(p,'  const relations: CrossPageRelation[] = [];',"  symbols = [...symbols].sort((a, b) => a.id.localeCompare(b.id));\n  const relations: CrossPageRelation[] = [];")
replace(p,'for (const ref of pageRefs) {',"for (const ref of [...pageRefs].sort((a, b) => a.pageIndex - b.pageIndex || (a.targetPageHint ?? -1) - (b.targetPageHint ?? -1) || a.text.localeCompare(b.text))) {")
replace(p,'findCompatiblePair(sourceSymbols, targetSymbols, texts)','findCompatiblePair(sourceSymbols, targetSymbols, texts, ref, symbols)')
replace(p,'voltageCompatibility(a, b, texts)','voltageCompatibility(a, b, texts, symbols)')
def cross(s):
    a=s.index('function findCompatiblePair(');b=s.index('function makeRel(',a)
    return s[:a]+'''function findCompatiblePair(
  sources: SymbolNode[], targets: SymbolNode[], texts: TextNode[], ref: PageRefHit, allSymbols: SymbolNode[],
): { from: SymbolNode; to: SymbolNode } | null {
  const anchored = sources.filter((source) => source.evidence.some((item) =>
    item.pageIndex === ref.pageIndex && Math.hypot(
      item.bounds.x + item.bounds.w / 2 - ref.bounds.x - ref.bounds.w / 2,
      item.bounds.y + item.bounds.h / 2 - ref.bounds.y - ref.bounds.h / 2) <= 120));
  const pairs: Array<{ from: SymbolNode; to: SymbolNode }> = [];
  for (const from of anchored) {
    for (const to of targets) {
      if (!typesCompatible(from.confirmedType ?? '', to.confirmedType ?? '')) continue;
      if (voltageCompatibility(from, to, texts, allSymbols) !== 'compatible') continue;
      const sameTag = from.rawLabel && to.rawLabel && isSpecificEquipmentTag(from.rawLabel)
        && normalize(from.rawLabel) === normalize(to.rawLabel);
      if (sameTag || (sources.length === 1 && targets.length === 1)) pairs.push({ from, to });
    }
  }
  if (pairs.length !== 1) return null;
  const pair = pairs[0];
  // A duplicate tag with missing voltage still blocks arbitrary first-match confirmation.
  if (pair.from.rawLabel && (sources.filter((item) => normalize(item.rawLabel ?? '') === normalize(pair.from.rawLabel!)).length > 1
    || targets.filter((item) => normalize(item.rawLabel ?? '') === normalize(pair.to.rawLabel ?? '')).length > 1)) return null;
  return pair;
}
function voltageCompatibility(a: SymbolNode, b: SymbolNode, texts: TextNode[], symbols: SymbolNode[]): 'compatible' | 'conflict' | 'unknown' {
  const va = nearbyVoltage(a, texts, symbols), vb = nearbyVoltage(b, texts, symbols);
  if (va == null || vb == null) return 'unknown';
  return Math.abs(va - vb) / Math.max(va, vb) < 0.15 ? 'compatible' : 'conflict';
}
function nearbyVoltage(symbol: SymbolNode, texts: TextNode[], symbols: SymbolNode[]): number | null {
  const evidence = symbol.evidence[0];
  if (!evidence) return null;
  const { bounds, pageIndex } = evidence;
  const values = new Set<number>();
  for (const text of texts) {
    if (text.certainty !== 'confirmed' || !text.confirmedText) continue;
    const assignment = ratedValueAssignment(text, symbols);
    if (assignment.certainty !== 'confirmed' || assignment.symbolId !== symbol.id) continue;
    const item = text.evidence.find((candidate) => candidate.pageIndex === pageIndex);
    if (!item || Math.hypot(bounds.x + bounds.w / 2 - item.bounds.x - item.bounds.w / 2,
      bounds.y + bounds.h / 2 - item.bounds.y - item.bounds.h / 2) > 120) continue;
    for (const quantity of parseRatedQuantities(text.confirmedText)) {
      const volts = quantityVolts(quantity);
      if (volts !== undefined) values.add(volts);
    }
  }
  // Several voltages require terminal-role context; do not pick the first one.
  return values.size === 1 ? [...values][0] : null;
}

'''+s[b:]
transform(p,cross)

p='src/lib/symbol-library-contract.ts'
replace(p,'export interface SymbolLibraryEntry {', '''export interface SymbolLibraryEntry {
  matchPolicy?: 'fingerprint-and-name';
  feedbackId?: string;''')
replace(p,'    if (!entryValid) return;\n    entries.push({','''    if (entry.matchPolicy !== undefined && entry.matchPolicy !== 'fingerprint-and-name') {
      errors.push(`${at}.matchPolicy 무효`); entryValid = false;
    }
    if (entry.matchPolicy === 'fingerprint-and-name' && (!fingerprint?.startsWith('fp2:') || blockNames.length !== 1)) {
      errors.push(`${at}: 정정 사례는 현행 지문과 하나의 블록명이 필요합니다`); entryValid = false;
    }
    if (entry.feedbackId !== undefined && (typeof entry.feedbackId !== 'string' || !/^fb-[a-zA-Z0-9-]{1,96}$/.test(entry.feedbackId)
      || entry.matchPolicy !== 'fingerprint-and-name')) {
      errors.push(`${at}.feedbackId 무효`); entryValid = false;
    }
    if (!entryValid) return;
    entries.push({
      ...(entry.matchPolicy === 'fingerprint-and-name' ? { matchPolicy: entry.matchPolicy } : {}),
      ...(typeof entry.feedbackId === 'string' ? { feedbackId: entry.feedbackId } : {}),''')
p='src/engine/topology/symbol-library.ts'
replace(p,'  size: number;','''  size: number;
  strictPatterns?: Map<string, Array<{ type: SLDComponentType; feedbackId?: string }>>;
  declaredFingerprints?: Map<string, Set<SLDComponentType>>;
  declaredNames?: Map<string, Set<SLDComponentType>>;''')
replace(p,'  for (const entry of library.entries) {','''  const strictPatterns: NonNullable<SymbolLibraryIndex['strictPatterns']> = new Map();
  const declaredFingerprints: NonNullable<SymbolLibraryIndex['declaredFingerprints']> = new Map();
  const declaredNames: NonNullable<SymbolLibraryIndex['declaredNames']> = new Map();
  const remember = (map: Map<string, Set<SLDComponentType>>, key: string, type: SLDComponentType) => {
    const types = map.get(key) ?? new Set<SLDComponentType>(); types.add(type); map.set(key, types);
  };
  for (const entry of library.entries) {
    if (entry.matchPolicy === 'fingerprint-and-name') {
      const strictKey = `${entry.fingerprint}:${entry.blockNames![0].toLowerCase()}`;
      const matches = strictPatterns.get(strictKey) ?? [];
      matches.push({ type: entry.deviceType, feedbackId: entry.feedbackId });
      strictPatterns.set(strictKey, matches);
      continue;
    }
    if (entry.fingerprint) remember(declaredFingerprints, entry.fingerprint, entry.deviceType);
    for (const name of entry.blockNames ?? []) remember(declaredNames, name.toLowerCase(), entry.deviceType);''')
replace(p,'    size: library.entries.length,','    size: library.entries.length,\n    strictPatterns, declaredFingerprints, declaredNames,')
def matching(s):
    a=s.index('export function matchSymbol(');b=s.index('// IDENTITY_SEAL',a)
    return s[:a]+'''/** A conflict in reviewed evidence must not fall through to a name heuristic. */
export function hasSymbolLibraryConflict(index: SymbolLibraryIndex, blockName: string, fingerprint: string | null): boolean {
  const strict = fingerprint ? index.strictPatterns?.get(`${fingerprint}:${blockName.toLowerCase()}`) : undefined;
  if (!strict?.length) return index.ambiguousBlockNames.has(blockName.toLowerCase())
    || Boolean(fingerprint && index.ambiguousFingerprints.has(fingerprint) && !index.byBlockName.has(blockName.toLowerCase()));
  return new Set([...strict.map((item) => item.type),
    ...(fingerprint ? index.declaredFingerprints?.get(fingerprint) ?? [] : []),
    ...(index.declaredNames?.get(blockName.toLowerCase()) ?? [])]).size > 1;
}
export function matchSymbolEvidence(index: SymbolLibraryIndex, blockName: string, fingerprint: string | null):
  { type: SLDComponentType; feedbackIds: string[] } | null {
  const name = blockName.toLowerCase();
  const strict = fingerprint ? index.strictPatterns?.get(`${fingerprint}:${name}`) : undefined;
  if (strict?.length) {
    const types = new Set([...strict.map((item) => item.type),
      ...(fingerprint ? index.declaredFingerprints?.get(fingerprint) ?? [] : []), ...(index.declaredNames?.get(name) ?? [])]);
    if (types.size !== 1) return null;
    return { type: strict[0].type, feedbackIds: [...new Set(strict.flatMap((item) => item.feedbackId ? [item.feedbackId] : []))].sort() };
  }
  if (fingerprint && !index.ambiguousFingerprints.has(fingerprint)) {
    const type = index.byFingerprint.get(fingerprint);
    if (type) return { type, feedbackIds: [] };
  }
  if (index.ambiguousBlockNames.has(name)) return null;
  const type = index.byBlockName.get(name);
  return type ? { type, feedbackIds: [] } : null;
}
export function matchSymbol(index: SymbolLibraryIndex, blockName: string, fingerprint: string | null): SLDComponentType | null {
  return matchSymbolEvidence(index, blockName, fingerprint)?.type ?? null;
}

'''+s[b:]
transform(p,matching)
replace('src/lib/sld-recognition.ts','export interface SLDComponent {','''export interface SLDComponent {
  /** Parser-produced provenance; parseSLDResponse does not accept it from model JSON. */
  sourcePattern?: import('./reviewed-symbol-feedback').DxfSourcePattern;
  appliedFeedbackIds?: string[];''')
p='src/engine/topology/dxf-parser.ts'
replace(p,'  matchSymbol,','  matchSymbolEvidence,\n  hasSymbolLibraryConflict,')
replace(p,'const libraryType = libraryIndex ? matchSymbol(libraryIndex, entity.name, fingerprint) : null;','const libraryMatch = libraryIndex ? matchSymbolEvidence(libraryIndex, entity.name, fingerprint) : null;\n        const libraryType = libraryMatch?.type ?? null;')
replace(p,'const heuristicType = libraryType ? null : resolveBlockTypeOrNull(entity.name);','const libraryConflict = libraryIndex ? hasSymbolLibraryConflict(libraryIndex, entity.name, fingerprint) : false;\n        const heuristicType = libraryType || libraryConflict ? null : resolveBlockTypeOrNull(entity.name);')
replace(p,"properties: { blockName: entity.name, layer: entity.layer ?? '' },",'''properties: { blockName: entity.name, layer: entity.layer ?? '', ...(libraryConflict ? { reviewedFeedbackConflict: 'true' } : {}) },
          ...(fingerprint?.startsWith('fp2:') ? { sourcePattern: { kind: 'dxf-block-v2' as const, fingerprint, blockName: entity.name } } : {}),
          ...(libraryMatch?.feedbackIds.length ? { appliedFeedbackIds: libraryMatch.feedbackIds } : {}),''')
replace('src/agent/teams/types.ts','export interface ExtractedComponent {','''export interface ExtractedComponent {
  sourcePattern?: import('@/lib/reviewed-symbol-feedback').DxfSourcePattern;
  appliedFeedbackIds?: string[];''')
# Only the vector mapping carries parser provenance, never model response adaptation.
transform('src/agent/teams/sld-team.ts',lambda s:s.replace('        properties: c.properties,','        properties: c.properties,\n        sourcePattern: c.sourcePattern,\n        appliedFeedbackIds: c.appliedFeedbackIds,',1))
transform('src/agent/drawing/team-result-adapter.ts',lambda s:s.replace("      regionId: 'vector-full',", "      regionId: 'vector-full',\n      ...(component.sourcePattern ? { sourcePatterns: [{ ...component.sourcePattern }] } : {}),\n      ...(component.appliedFeedbackIds?.length ? { appliedFeedbackIds: [...component.appliedFeedbackIds] } : {}),",1))
p='src/agent/drawing/evidence-deduplicator.ts'
replace(p,'export interface RawSymbolHit {','''export interface RawSymbolHit {
  sourcePatterns?: SymbolNode['sourcePatterns'];
  appliedFeedbackIds?: string[];''')
transform(p,lambda s:s.replace('      dup.evidence.push(...incoming);','''      dup.evidence.push(...incoming);
      if (hit.sourcePatterns?.length) dup.sourcePatterns = [...new Map([...(dup.sourcePatterns ?? []), ...hit.sourcePatterns]
        .map((pattern) => [`${pattern.fingerprint}:${pattern.blockName}`, { ...pattern }])).values()];
      if (hit.appliedFeedbackIds?.length) dup.appliedFeedbackIds = [...new Set([...(dup.appliedFeedbackIds ?? []), ...hit.appliedFeedbackIds])];''',1))
replace(p,'      typeCandidates: hitCandidates,','''      typeCandidates: hitCandidates,
      ...(hit.sourcePatterns?.length ? { sourcePatterns: hit.sourcePatterns.map((pattern) => ({ ...pattern })) } : {}),
      ...(hit.appliedFeedbackIds?.length ? { appliedFeedbackIds: [...hit.appliedFeedbackIds] } : {}),''')
p='src/lib/quick-drawing-readout.ts'
replace(p,"  | 'MULTIPLE_TYPE_CANDIDATES'", "  | 'FEEDBACK_CONFLICT' | 'MULTIPLE_TYPE_CANDIDATES'")
replace(p,"  TYPE_UNKNOWN: '현재 근거로 기기 종류를 분류하지 못했습니다',", "  TYPE_UNKNOWN: '현재 근거로 기기 종류를 분류하지 못했습니다',\n  FEEDBACK_CONFLICT: '회사 사전·승인 정정 사례가 서로 충돌해 자동 분류하지 않았습니다',")
replace(p,'    type: isUnknown(item) ?', "    type: item.properties?.reviewedFeedbackConflict === 'true' ? { certainty: 'unread', reason: 'FEEDBACK_CONFLICT' }\n      : isUnknown(item) ?")
Path('/tmp/feedback-changed-paths.txt').write_text('\n'.join(sorted(changed))+'\n')
print('CORE_PRODUCT_FILES',len(changed))
