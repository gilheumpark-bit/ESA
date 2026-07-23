import path from 'node:path';
import { getDrawingCalibrationFixture } from '../drawing-calibration-fixtures';

describe('drawing calibration fixture allowlist', () => {
  test('resolves the public one-line teaching fixture inside the repository', () => {
    const fixture = getDrawingCalibrationFixture('wiki-oneline', 'C:\\repo');

    expect(fixture).toEqual({
      fileName: 'wiki-oneline.png',
      mimeType: 'image/png',
      path: path.resolve('C:\\repo', 'fixtures', 'drawings', 'external', 'wiki-oneline.png'),
    });
  });

  test('rejects unknown names and path traversal input', () => {
    expect(getDrawingCalibrationFixture('../../.env', 'C:\\repo')).toBeNull();
    expect(getDrawingCalibrationFixture('company-drawing', 'C:\\repo')).toBeNull();
  });
});
