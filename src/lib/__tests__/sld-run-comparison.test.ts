import { compareSLDAnalysisRuns } from '../sld-run-comparison';

const run = (components: string[], connections: number, suggestions: number) => ({
  components: components.map((label, index) => ({ id: `c${index}`, type: label.split(':')[0], label: label.split(':')[1] })),
  connections: Array.from({ length: connections }, (_, index) => ({ id: `e${index}`, from: 'c0', to: 'c1' })),
  suggestedCalculations: Array.from({ length: suggestions }, (_, index) => ({ calculatorId: `calc${index}` })),
});

describe('compareSLDAnalysisRuns', () => {
  it('flags count and identity drift between repeated readings of the same drawing', () => {
    const result = compareSLDAnalysisRuns(
      run(['bus:Left Bus', 'breaker:CB-1', 'load:Infeed'], 2, 2),
      run(['bus:Left Main Bus', 'breaker:CB-1'], 1, 1),
    );

    expect(result.changed).toBe(true);
    expect(result.componentCounts).toEqual([3, 2]);
    expect(result.connectionCounts).toEqual([2, 1]);
    expect(result.suggestionCounts).toEqual([2, 1]);
    expect(result.addedComponents).toContain('bus:Left Main Bus');
    expect(result.removedComponents).toEqual(expect.arrayContaining(['bus:Left Bus', 'load:Infeed']));
  });

  it('does not raise a hold when only order and ids change', () => {
    const result = compareSLDAnalysisRuns(
      run(['bus:Main Bus', 'breaker:VCB-1'], 1, 1),
      run(['breaker:VCB-1', 'bus:Main Bus'], 1, 1),
    );

    expect(result.changed).toBe(false);
  });

  it('uses the visible calculation-chain counts when the caller supplies them', () => {
    const result = compareSLDAnalysisRuns(
      run(['bus:Main Bus', 'breaker:VCB-1'], 1, 7),
      run(['breaker:VCB-1', 'bus:Main Bus'], 1, 9),
      [3, 3],
    );

    expect(result.suggestionCounts).toEqual([3, 3]);
    expect(result.changed).toBe(false);
  });
});
