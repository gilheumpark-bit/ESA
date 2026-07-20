import { NextRequest } from 'next/server';
import { extractVerifiedUserId } from '@/lib/auth-helpers';
import { listUserCalculations } from '@/lib/supabase';
import * as calculateRoute from '../route';

jest.mock('@/lib/auth-helpers', () => ({ extractVerifiedUserId: jest.fn() }));
jest.mock('@/lib/supabase', () => ({
  saveCalculation: jest.fn(),
  listUserCalculations: jest.fn(),
}));

const mockUser = jest.mocked(extractVerifiedUserId);
const mockList = jest.mocked(listUserCalculations);

describe('GET /api/calculate history', () => {
  test('exposes authenticated persistent calculation history', async () => {
    const get = (calculateRoute as unknown as {
      GET?: (request: NextRequest) => Promise<Response>;
    }).GET;
    expect(typeof get).toBe('function');

    mockUser.mockResolvedValue('firebase-user-a');
    mockList.mockResolvedValue({
      data: [],
      count: 0,
      page: 1,
      pageSize: 20,
      totalPages: 0,
    });

    const response = await get!(new NextRequest('http://localhost:3000/api/calculate?page=1&pageSize=20', {
      headers: { Authorization: 'Bearer token', 'X-Forwarded-For': '198.51.100.81' },
    }));

    expect(response.status).toBe(200);
    expect(mockList).toHaveBeenCalledWith('firebase-user-a', { page: 1, pageSize: 20 });
  });
});
