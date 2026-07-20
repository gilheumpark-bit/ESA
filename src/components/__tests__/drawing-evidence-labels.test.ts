import {
  buildEvidenceNumbers,
  describeEquipmentType,
} from '@/components/drawing-evidence-labels';

describe('drawing evidence labels', () => {
  it('assigns stable page-and-position numbers to every symbol and line', () => {
    const numbers = buildEvidenceNumbers(
      [
        { id: 'right', bounds: { page: 1, x: 700, y: 100 } },
        { id: 'page-two', bounds: { page: 2, x: 0, y: 0 } },
        { id: 'left', bounds: { page: 1, x: 100, y: 100 } },
      ],
      [
        { id: 'lower', pages: [1], path: [{ x: 10, y: 500 }] },
        { id: 'upper', pages: [1], path: [{ x: 10, y: 50 }] },
      ],
    );

    expect(numbers.symbols).toEqual({ left: 'S01', right: 'S02', 'page-two': 'S03' });
    expect(numbers.lines).toEqual({ upper: 'L01', lower: 'L02' });
  });

  it('shows a professional full name while preserving the drawing abbreviation', () => {
    expect(describeEquipmentType('VCB')).toBe('VCB · 진공차단기');
    expect(describeEquipmentType('transformer')).toBe('TR · 변압기');
    expect(describeEquipmentType('custom-device')).toBe('CUSTOM-DEVICE');
  });
});
