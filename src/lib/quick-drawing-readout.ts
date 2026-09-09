import type { SLDAnalysis, SLDComponent, SLDConnection } from './sld-recognition';
import { hasReadValue, tallyReadings, type DrawingCertainty, type ReadingTally } from './drawing-certainty';

export type QuickReadReason = 'QUICK_NOT_VERIFIED' | 'VALUE_NOT_READ' | 'TYPE_UNKNOWN'
  | 'MULTIPLE_TYPE_CANDIDATES' | 'ENDPOINT_UNREAD' | 'SYNTHETIC_JUNCTION';
export interface QuickFieldRead {
  certainty: DrawingCertainty;
  reason: QuickReadReason;
}
export interface QuickComponentRead {
  id: string;
  type: QuickFieldRead;
  fields: Record<'label' | 'rating' | 'voltage' | 'current', QuickFieldRead>;
}
export interface QuickConnectionRead {
  id: string;
  relation: QuickFieldRead;
  fields: Record<'cableType' | 'length' | 'conductorSize' | 'flowDirection', QuickFieldRead>;
}
export interface QuickDrawingReadout {
  schemaVersion: 1;
  source: 'quick-extraction';
  /** This is NOT the population of all objects in the drawing. */
  scope: 'observed-records-only';
  completeness: 'partial' | 'not-verified';
  components: QuickComponentRead[];
  connections: QuickConnectionRead[];
  counts: { components: ReadingTally; connections: ReadingTally };
}
export const QUICK_READ_REASON_LABELS: Record<QuickReadReason, string> = {
  QUICK_NOT_VERIFIED: '빠른 추출값: 원본 대조 또는 정밀 판독 필요',
  VALUE_NOT_READ: '미기재 또는 미판독: 값이 0이라는 뜻이 아닙니다',
  TYPE_UNKNOWN: '현재 근거로 기기 종류를 분류하지 못했습니다',
  MULTIPLE_TYPE_CANDIDATES: '기기 종류 후보가 복수이며 현재 근거만으로 확정할 수 없습니다',
  ENDPOINT_UNREAD: '연결된 기기 중 종류가 미확정인 항목이 있습니다',
  SYNTHETIC_JUNCTION: '파서가 생성한 연결점이며 실물 기기 확정이 아닙니다',
};
export function quickFieldRead(value: unknown): QuickFieldRead {
  return hasReadValue(value)
    ? { certainty: 'ambiguous', reason: 'QUICK_NOT_VERIFIED' }
    : { certainty: 'unread', reason: 'VALUE_NOT_READ' };
}

/** Source fields are preserved; global confidence and model-supplied certainty
 * cannot turn a quick extraction into an independently verified claim. Competing
 * type candidates are kept as REVIEW rather than silently promoting typeCandidates[0].
 * Older DXF results that used load as the fallback are also read as unknown here. */
export function buildQuickDrawingReadout(analysis: Pick<SLDAnalysis,
  'components' | 'connections' | 'unknownSymbols' | 'partial'>): QuickDrawingReadout {
  const unregistered = new Set((analysis.unknownSymbols ?? []).map((item) => item.blockName));
  const isUnknown = (component: SLDComponent) => component.type === 'unknown'
    || !hasReadValue(component.type)
    || unregistered.has(component.properties?.blockName ?? component.label ?? '');
  const hasCompetingCandidates = (component: SLDComponent) => new Set(
    (component.typeCandidates ?? []).map((candidate) => candidate.trim()).filter(Boolean),
  ).size > 1;
  const byId = new Map(analysis.components.map((item) => [item.id, item]));
  const components: QuickComponentRead[] = analysis.components.map((item) => ({
    id: item.id,
    type: isUnknown(item) ? { certainty: 'unread', reason: 'TYPE_UNKNOWN' }
      : hasCompetingCandidates(item) ? { certainty: 'ambiguous', reason: 'MULTIPLE_TYPE_CANDIDATES' }
      : item.properties?.synthetic ? { certainty: 'ambiguous', reason: 'SYNTHETIC_JUNCTION' }
        : quickFieldRead(item.type),
    fields: { label: quickFieldRead(item.label), rating: quickFieldRead(item.rating),
      voltage: quickFieldRead(item.voltage), current: quickFieldRead(item.current) },
  }));
  const connections: QuickConnectionRead[] = analysis.connections.map((item: SLDConnection) => {
    const from = byId.get(item.from), to = byId.get(item.to);
    return {
      id: item.id,
      relation: !from || !to ? { certainty: 'unread', reason: 'ENDPOINT_UNREAD' }
        : isUnknown(from) || isUnknown(to) || hasCompetingCandidates(from) || hasCompetingCandidates(to)
          ? { certainty: 'ambiguous', reason: 'ENDPOINT_UNREAD' }
          : quickFieldRead(item.id),
      fields: { cableType: quickFieldRead(item.cableType), length: quickFieldRead(item.length),
        conductorSize: quickFieldRead(item.conductorSize),
        flowDirection: quickFieldRead(item.flowDirection === 'unknown' ? undefined : item.flowDirection) },
    };
  });
  return { schemaVersion: 1, source: 'quick-extraction', scope: 'observed-records-only',
    completeness: analysis.partial ? 'partial' : 'not-verified', components, connections,
    counts: { components: tallyReadings(components.map((item) => item.type.certainty)),
      connections: tallyReadings(connections.map((item) => item.relation.certainty)) } };
}
