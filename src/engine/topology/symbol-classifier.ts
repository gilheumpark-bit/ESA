import type { SLDComponent, SLDConnection } from '@/lib/sld-recognition';
import type { SLDComponentType } from '@/lib/sld-component-types';
import type { SymbolLibrary } from '@/lib/symbol-library-contract';
import { compareSymbolShapes, readSymbolShape, shapeTopology, type SymbolShape } from '@/lib/symbol-shape';
import { SYMBOL_CLASSIFICATION_VERSION, symbolReferenceKey, type SymbolClassification, type SymbolClassificationStats } from '@/lib/symbol-classification';
import { matchSymbol, matchSymbolFeedback, type SymbolLibraryIndex } from './symbol-library';

/** Versioned rule cutoffs, NOT calibrated probabilities or engineering approval. */
export const SYMBOL_CLASSIFIER_POLICY = Object.freeze({ candidateMinimum: 0.80, automaticMinimum: 0.96,
  minimumTypeMargin: 0.06, minimumStrokes: 3, minimumRepeatedAnchors: 2, maximumComparisons: 10_000, maximumReferences: 512 });
interface Reference { key: string; type: SLDComponentType; shape: SymbolShape; componentId?: string }
interface Ranked { type: SLDComponentType; similarity: number; keys: string[] }
const special = /\b(?:ATS|ELCB|ELB|RCCB|RCBO|GFCI|SPARE|SPACE|RESERVE|SPECIAL)\d*\b|예비|특수|누전|절체/iu;
const hints: Array<[SLDComponentType, RegExp]> = [
  ['breaker', /\b(?:MCCB|MCB|ACB|VCB|NFB|BREAKER)\b|차단기/iu], ['fuse', /\bFUSE\b|퓨즈/iu],
  ['switch', /\bSWITCH\b|개폐기/iu], ['relay', /\bRELAY\b|계전기/iu],
  ['motor', /\bMOTOR\b|전동기/iu], ['transformer', /\bTRANSFORMER\b|변압기/iu],
  ['capacitor', /\bCAPACITOR\b|콘덴서/iu], ['generator', /\bGENERATOR\b|발전기/iu],
];
const textTypes = (text: string) => hints.filter(([, expression]) => expression.test(text)).map(([type]) => type);
const validPoint = (c: SLDComponent) => Number.isFinite(c.position.x) && Number.isFinite(c.position.y);

/** Classification is an additional result layer. Never rewrite source types,
 * rated values, calculation inputs, or independent verification in this pass. */
export function classifyDxfSymbols(components: SLDComponent[], connections: SLDConnection[], options: {
  library?: SymbolLibrary; index: SymbolLibraryIndex | null; texts: ReadonlyMap<string, string[]>;
}): SymbolClassificationStats {
  const stats: SymbolClassificationStats = { version: SYMBOL_CLASSIFICATION_VERSION, classified: 0, inferred: 0, review: 0, unread: 0,
    shapeComparisons: 0, reusedShapeComparisons: 0, uniqueBlockShapes: 0, additionalModelCalls: 0, scope: 'observed-dxf-symbols' };
  const byId = new Map(components.map((item) => [item.id, item]));
  const adjacency = new Map<string, Set<string>>();
  for (const connection of connections) {
    if (connection.from === connection.to || !byId.has(connection.from) || !byId.has(connection.to)) continue;
    for (const [from, to] of [[connection.from, connection.to], [connection.to, connection.from]]) {
      const peers = adjacency.get(from) ?? new Set<string>(); peers.add(to); adjacency.set(from, peers);
    }
  }
  const rawText = (c: SLDComponent) => [c.properties?.blockName ?? c.label ?? '', ...(options.texts.get(c.id) ?? [])]
    .join(' ').normalize('NFKC').replace(/[_-]/g, ' ').slice(0, 20_000);
  const refs: Reference[] = [], seeds = new Map<string, Reference>();
  const base = (patch: Partial<SymbolClassification>): SymbolClassification => ({ version: SYMBOL_CLASSIFICATION_VERSION,
    status: 'unread', method: 'unresolved', candidates: [], reasons: [], referenceKeys: [], independentVerification: false, ...patch });
  const shapeById = new Map<string, SymbolShape>();
  const shapeKeys = new Set<string>();
  const symbolKey = (c: SLDComponent) => symbolReferenceKey(c.properties?.blockName ?? c.label ?? '', c.properties?.blockFingerprint ?? '');
  const conflicts = new Set<string>();
  // Freeze the trusted seed set before inference: a prediction can never seed another prediction.
  for (const component of components) {
    const shape = readSymbolShape(component.symbolShape);
    if (shape) { shapeById.set(component.id, shape); shapeKeys.add(symbolKey(component)); }
    if (component.properties?.synthetic) continue;
    const name = component.properties?.blockName, fp = component.properties?.blockFingerprint ?? null;
    const feedback = name && options.index ? matchSymbolFeedback(options.index, name, fp) : undefined;
    const libraryType = name && options.index ? matchSymbol(options.index, name, fp) : null;
    const raw = rawText(component), declared = textTypes(raw);
    const contextTruncated = (options.texts.get(component.id) ?? []).includes('__ESA_CONTEXT_TRUNCATED__');
    const conflict = component.properties?.feedbackConflict === 'true' || feedback?.status === 'conflict'
      || Boolean(name && options.index?.ambiguousBlockNames.has(name.toLowerCase()))
      || Boolean(fp && options.index?.ambiguousFingerprints.has(fp));
    if (conflict) conflicts.add(component.id);
    if (libraryType && component.type === libraryType && shape && !conflict && !contextTruncated && !special.test(raw)
      && declared.every((type) => type === libraryType)) {
      const ref = { key: symbolKey(component), type: libraryType, shape, componentId: component.id };
      refs.push(ref); seeds.set(component.id, ref);
    }
    if (component.type !== 'unknown') {
      const reason = contextTruncated ? 'BUDGET_LIMIT' : conflict ? 'LIBRARY_CONFLICT' : special.test(raw) ? 'SPECIAL_MARKING'
        : declared.some((type) => type !== component.type) ? 'TEXT_CONFLICT' : undefined;
      component.classification = reason ? base({ status: 'review', reasons: [reason] }) : base({
        status: 'classified', selectedType: component.type,
        method: feedback?.status === 'matched' ? 'approved-exact' : libraryType ? 'company-library' : 'existing-parser',
        reasons: [feedback?.status === 'matched' ? 'APPROVED_EXACT' : libraryType ? 'COMPANY_LIBRARY' : 'EXISTING_PARSER'],
        referenceKeys: libraryType ? [symbolKey(component)] : [],
      });
    }
  }
  // Older feedback records contain only a hash. They remain exact-match records;
  // never fabricate a geometry vector from a cryptographic hash.
  for (const feedback of options.library?.feedback ?? []) {
    const shape = readSymbolShape(feedback.source.shape);
    if (feedback.status === 'approved' && shape
      && !special.test(feedback.source.blockName.normalize('NFKC').replace(/[_-]/g, ' '))) refs.push({ key: symbolReferenceKey(feedback.source.blockName, feedback.source.fingerprint), type: feedback.deviceType, shape });
  }
  const uniqueRefs = [...new Map(refs.sort((a, b) => a.key.localeCompare(b.key) || a.type.localeCompare(b.type))
    .map((r) => [`${r.key}:${r.type}`, r])).values()];
  const referenceOverflow = uniqueRefs.length > SYMBOL_CLASSIFIER_POLICY.maximumReferences;
  const index = new Map<string, Reference[]>();
  // Do not silently truncate references: that could remove the competing class.
  if (!referenceOverflow) for (const ref of uniqueRefs) {
    const topology = shapeTopology(ref.shape), group = index.get(topology) ?? []; group.push(ref); index.set(topology, group);
  }
  const memo = new Map<string, { ranked: Ranked[]; limited: boolean }>();
  function rank(shape: SymbolShape) {
    const key = JSON.stringify(shape), cached = memo.get(key);
    if (cached) { stats.reusedShapeComparisons++; return cached; }
    const types = new Map<SLDComponentType, Ranked>(); let limited = referenceOverflow;
    for (const ref of index.get(shapeTopology(shape)) ?? []) {
      if (stats.shapeComparisons >= SYMBOL_CLASSIFIER_POLICY.maximumComparisons) { limited = true; break; }
      stats.shapeComparisons++;
      const score = compareSymbolShapes(shape, ref.shape).score;
      if (score < SYMBOL_CLASSIFIER_POLICY.candidateMinimum) continue;
      const previous = types.get(ref.type);
      if (!previous) types.set(ref.type, { type: ref.type, similarity: score, keys: score >= SYMBOL_CLASSIFIER_POLICY.automaticMinimum ? [ref.key] : [] });
      else { previous.similarity = Math.max(previous.similarity, score); if (score >= SYMBOL_CLASSIFIER_POLICY.automaticMinimum) previous.keys.push(ref.key); }
    }
    const result = { ranked: [...types.values()].map((item) => ({ ...item, keys: [...new Set(item.keys)].sort().slice(0, 20) }))
      .sort((a, b) => b.similarity - a.similarity || a.type.localeCompare(b.type)), limited };
    memo.set(key, result); return result;
  }
  const seededNeighbours = new Map([...adjacency].map(([id, neighbours]) =>
    [id, [...neighbours].filter((peerId) => seeds.has(peerId)).sort()] as const));
  function repeated(component: SLDComponent, candidate: Ranked): string[] {
    const adjacent = adjacency.get(component.id);
    if (!adjacent?.size || adjacent.size > 4 || !validPoint(component)) return [];
    const anchors = new Set<string>(), anchorPositions = new Set<string>();
    for (const busId of adjacent) {
      const bus = byId.get(busId);
      if (!bus || !['bus', 'panel'].includes(bus.type)) continue;
      for (const peerId of seededNeighbours.get(busId) ?? []) {
        const ref = seeds.get(peerId), peer = byId.get(peerId);
        if (!ref || !peer || peerId === component.id || ref.type !== candidate.type || !candidate.keys.includes(ref.key)
          || adjacency.get(peerId)?.size !== adjacent.size || !validPoint(peer)
          || (peer.properties?.layer ?? '') !== (component.properties?.layer ?? '')
          || (peer.properties?.symbolRotation ?? '0') !== (component.properties?.symbolRotation ?? '0')) continue;
        const dx = Math.abs(peer.position.x - component.position.x), dy = Math.abs(peer.position.y - component.position.y);
        if (dx + dy === 0 || Math.min(dx, dy) > Math.hypot(dx, dy) * 0.02) continue;
        if (peer.voltage && component.voltage && peer.voltage !== component.voltage) continue;
        const position = `${peer.position.x}:${peer.position.y}`;
        if (anchorPositions.has(position)) continue;
        anchorPositions.add(position); anchors.add(peerId);
      }
    }
    return [...anchors].sort();
  }
  for (const component of [...components].sort((a, b) => symbolKey(a).localeCompare(symbolKey(b)) || a.id.localeCompare(b.id))) {
    if (component.properties?.synthetic || component.type !== 'unknown') continue;
    const shape = shapeById.get(component.id), raw = rawText(component);
    if ((options.texts.get(component.id) ?? []).includes('__ESA_CONTEXT_TRUNCATED__')) { component.classification = base({ status: 'review', reasons: ['BUDGET_LIMIT'] }); continue; }
    if (conflicts.has(component.id)) { component.classification = base({ status: 'review', reasons: ['LIBRARY_CONFLICT'] }); continue; }
    if (special.test(raw)) { component.classification = base({ status: 'review', reasons: ['SPECIAL_MARKING'] }); continue; }
    if (!shape) { component.classification = base({ reasons: ['UNSUPPORTED_GEOMETRY'] }); continue; }
    const ranked = rank(shape), best = ranked.ranked[0];
    const candidates = ranked.ranked.slice(0, 3).map(({ type, similarity }) => ({ type, similarity }));
    if (ranked.limited) { component.classification = base({ status: 'review', candidates, reasons: ['BUDGET_LIMIT'] }); continue; }
    if (!best) { component.classification = base({ reasons: ['NO_REFERENCE'] }); continue; }
    const evidence: SymbolClassification['reasons'] = ['SHAPE_MATCH'];
    const declarations = textTypes(raw);
    const conflict = declarations.some((type) => type !== best.type);
    const textSupport = declarations.length === 1 && declarations[0] === best.type;
    const peers = repeated(component, best);
    const repeatSupport = peers.length >= SYMBOL_CLASSIFIER_POLICY.minimumRepeatedAnchors;
    if (textSupport) evidence.push('TEXT_SUPPORT');
    if (repeatSupport) evidence.push('REPEATED_ROLE');
    const ambiguous = ranked.ranked.length > 1 && best.similarity - ranked.ranked[1].similarity < SYMBOL_CLASSIFIER_POLICY.minimumTypeMargin;
    const sufficientlyComplex = shape.lines.length + shape.circles.length + shape.arcs.length >= SYMBOL_CLASSIFIER_POLICY.minimumStrokes;
    const automatic = !conflict && !ambiguous && sufficientlyComplex && best.similarity >= SYMBOL_CLASSIFIER_POLICY.automaticMinimum
      && (repeatSupport || textSupport);
    if (!automatic) evidence.push(conflict ? 'TEXT_CONFLICT' : ambiguous ? 'AMBIGUOUS_FAMILY' : 'INSUFFICIENT_CONTEXT');
    component.classification = base({ status: automatic ? 'classified' : 'review', method: automatic ? 'family-context' : 'unresolved',
      ...(automatic ? { selectedType: best.type } : {}), candidates, reasons: evidence, referenceKeys: best.keys });
  }
  stats.uniqueBlockShapes = shapeKeys.size;
  for (const component of components) {
    if (!component.classification) continue;
    stats[component.classification.status]++;
    if (component.classification.method === 'family-context' && component.classification.status === 'classified') stats.inferred++;
  }
  return stats;
}
