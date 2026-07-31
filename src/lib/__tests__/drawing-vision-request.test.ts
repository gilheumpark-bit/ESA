import { getChatGPTLocalStatus } from '@/lib/chatgpt-local';

import {
  DrawingVisionRequestError,
  resolveDrawingVisionRequest,
} from '../drawing-vision-request';

jest.mock('@/lib/chatgpt-local', () => ({
  getChatGPTLocalStatus: jest.fn(),
}));

const statusMock = getChatGPTLocalStatus as jest.MockedFunction<typeof getChatGPTLocalStatus>;

function request(host = 'localhost:3000'): Request {
  return new Request(`http://${host}/api/drawing-jobs`, {
    headers: { Host: host, Origin: `http://${host}` },
  });
}

function form(values: Record<string, string>): FormData {
  const result = new FormData();
  for (const [key, value] of Object.entries(values)) result.set(key, value);
  return result;
}

describe('drawing Vision request resolution', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    statusMock.mockResolvedValue({
      available: true,
      connected: true,
      account: { email: 'g***@example.com', planType: 'pro' },
      models: [{
        id: 'gpt-5.6-terra',
        name: 'GPT-5.6 Terra',
        inputModalities: ['text', 'image'],
      }],
    });
  });

  it('returns a keyless local Vision request on loopback even without an ESA login', async () => {
    await expect(resolveDrawingVisionRequest(
      form({ provider: 'chatgpt-local', model: 'gpt-5.6-terra' }),
      request(),
      false,
    )).resolves.toEqual({
      provider: 'chatgpt-local',
      model: 'gpt-5.6-terra',
    });
  });

  it('hides the local provider from a non-loopback request', async () => {
    await expect(resolveDrawingVisionRequest(
      form({ provider: 'chatgpt-local', model: 'gpt-5.6-terra' }),
      request('esa.example.com'),
      true,
    )).rejects.toMatchObject<Partial<DrawingVisionRequestError>>({
      status: 404,
    });
    expect(statusMock).not.toHaveBeenCalled();
  });

  it('rejects a local model that is not in the signed-in account image catalog', async () => {
    await expect(resolveDrawingVisionRequest(
      form({ provider: 'chatgpt-local', model: 'unknown-local-model' }),
      request(),
      true,
    )).rejects.toMatchObject<Partial<DrawingVisionRequestError>>({
      status: 400,
    });
  });

  it('preserves the remote anonymous BYOK requirement', async () => {
    await expect(resolveDrawingVisionRequest(
      form({ provider: 'openai' }),
      request(),
      false,
    )).rejects.toMatchObject<Partial<DrawingVisionRequestError>>({
      status: 401,
    });
  });
});
