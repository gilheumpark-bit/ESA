import { NextRequest } from 'next/server';
import { extractVerifiedUserId } from '@/lib/auth-helpers';
import { loadReport } from '@/lib/report-store';
import { GET } from '../route';

jest.mock('@/lib/auth-helpers', () => ({ extractVerifiedUserId: jest.fn() }));
jest.mock('@/lib/rate-limit', () => ({ applyRateLimit: jest.fn(() => null) }));
jest.mock('@/lib/report-store', () => ({ loadReport: jest.fn() }));

const mockUser = jest.mocked(extractVerifiedUserId);
const mockLoad = jest.mocked(loadReport);

describe('GET /api/reports/[id]', () => {
  beforeEach(() => jest.clearAllMocks());

  test('requires a verified Firebase user', async () => {
    mockUser.mockResolvedValue(null);

    const response = await GET(
      new NextRequest('http://localhost:3000/api/reports/RPT-OWNED-1234'),
      { params: Promise.resolve({ id: 'RPT-OWNED-1234' }) },
    );

    expect(response.status).toBe(401);
    expect(mockLoad).not.toHaveBeenCalled();
  });

  test('loads through the authenticated ownership filter', async () => {
    mockUser.mockResolvedValue('firebase-user-a');
    mockLoad.mockResolvedValue({ reportId: 'RPT-OWNED-1234' } as never);

    const response = await GET(
      new NextRequest('http://localhost:3000/api/reports/RPT-OWNED-1234'),
      { params: Promise.resolve({ id: 'RPT-OWNED-1234' }) },
    );

    expect(response.status).toBe(200);
    expect(mockLoad).toHaveBeenCalledWith('RPT-OWNED-1234', 'firebase-user-a');
  });
});
