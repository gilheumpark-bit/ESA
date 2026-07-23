import path from 'node:path';

interface DrawingCalibrationFixture {
  fileName: string;
  mimeType: string;
  path: string;
}

const PUBLIC_FIXTURES = {
  'wiki-oneline': {
    fileName: 'wiki-oneline.png',
    mimeType: 'image/png',
    segments: ['fixtures', 'drawings', 'external', 'wiki-oneline.png'],
  },
} as const;

export function getDrawingCalibrationFixture(
  id: string,
  repositoryRoot = process.cwd(),
): DrawingCalibrationFixture | null {
  const fixture = PUBLIC_FIXTURES[id as keyof typeof PUBLIC_FIXTURES];
  if (!fixture) return null;

  return {
    fileName: fixture.fileName,
    mimeType: fixture.mimeType,
    path: path.resolve(repositoryRoot, ...fixture.segments),
  };
}
