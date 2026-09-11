import { SLD_COMPONENT_TYPES, type SLDComponentType } from './sld-component-types';
import { SYMBOL_CLASSIFICATION_VERSION, symbolReferenceKey, unresolvedClassification, type SymbolClassification } from './symbol-classification';
import type { SymbolNode } from '@/agent/drawing/types-v3';

const knownTypes = new Set<string>(SLD_COMPONENT_TYPES.filter((type) => type !== 'unknown'));
/** Mutates only the already-cloned graph's classification metadata. Engineering
 * certainty/counts and independent original evidence remain owned by V3. */
export function updateClassificationsAfterCorrection(symbols: SymbolNode[], input: {
  targetDisplayId: string; correctionKind: 'type' | 'text' | 'label'; selectedValue: string;
}, pageIndex: number): void {
  const target = symbols.find((symbol) => symbol.displayId === input.targetDisplayId);
  const ref = target?.sourceSymbol ? symbolReferenceKey(target.sourceSymbol.blockName, target.sourceSymbol.fingerprint) : undefined;
  for (const symbol of symbols) {
    const previous = symbol.classification;
    if (symbol.displayId === input.targetDisplayId && input.correctionKind === 'type') {
      const type = input.selectedValue.trim();
      const classification: SymbolClassification = knownTypes.has(type) ? {
        version: SYMBOL_CLASSIFICATION_VERSION, status: 'classified', method: 'human-correction', selectedType: type as SLDComponentType,
        candidates: [], reasons: ['HUMAN_CORRECTION'], referenceKeys: [], independentVerification: false,
      } : { ...unresolvedClassification('REFERENCE_CHANGED', previous), status: 'unread' };
      // Do not inject a new derived field into unrelated legacy documents.
      if (previous) symbol.classification = classification;
    } else if (previous?.method === 'family-context' && previous.status === 'classified') {
      const onPage = symbol.evidence.some((item) => item.pageIndex === pageIndex);
      if ((input.correctionKind === 'type' && ref && previous.referenceKeys.includes(ref))
        || (input.correctionKind !== 'type' && onPage)) {
        symbol.classification = unresolvedClassification('REFERENCE_CHANGED', previous);
      }
    }
  }
}
