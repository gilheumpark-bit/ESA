export interface ComparableSLDRun {
  components: Array<{ type: string; label?: string }>;
  connections: Array<unknown>;
  suggestedCalculations: Array<unknown>;
}

export interface SLDRunComparison {
  changed: boolean;
  componentCounts: [number, number];
  connectionCounts: [number, number];
  suggestionCounts: [number, number];
  addedComponents: string[];
  removedComponents: string[];
}

function componentSignature(component: ComparableSLDRun['components'][number]): string {
  const label = component.label?.trim().replace(/\s+/g, ' ') || '(label 없음)';
  return `${component.type.toLowerCase()}:${label}`;
}

export function compareSLDAnalysisRuns(
  previous: ComparableSLDRun,
  current: ComparableSLDRun,
  visibleSuggestionCounts?: [number, number],
): SLDRunComparison {
  const previousComponents = new Set(previous.components.map(componentSignature));
  const currentComponents = new Set(current.components.map(componentSignature));
  const addedComponents = [...currentComponents].filter((item) => !previousComponents.has(item)).sort();
  const removedComponents = [...previousComponents].filter((item) => !currentComponents.has(item)).sort();
  const componentCounts: [number, number] = [previous.components.length, current.components.length];
  const connectionCounts: [number, number] = [previous.connections.length, current.connections.length];
  const suggestionCounts: [number, number] = visibleSuggestionCounts ?? [
    previous.suggestedCalculations.length,
    current.suggestedCalculations.length,
  ];

  return {
    changed: addedComponents.length > 0
      || removedComponents.length > 0
      || componentCounts[0] !== componentCounts[1]
      || connectionCounts[0] !== connectionCounts[1]
      || suggestionCounts[0] !== suggestionCounts[1],
    componentCounts,
    connectionCounts,
    suggestionCounts,
    addedComponents,
    removedComponents,
  };
}
