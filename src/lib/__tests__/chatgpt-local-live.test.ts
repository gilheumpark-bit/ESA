import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ChatGPTLocalService } from '@/lib/chatgpt-local';
import { CodexAppServerClient } from '@/lib/chatgpt-local-protocol';

const describeLive = process.env.CHATGPT_LOCAL_LIVE === '1' ? describe : describe.skip;

describeLive('ChatGPT local account live gate', () => {
  let rpc: CodexAppServerClient;
  let service: ChatGPTLocalService;

  beforeAll(() => {
    rpc = new CodexAppServerClient({ defaultTimeoutMs: 180_000 });
    service = new ChatGPTLocalService(rpc);
  });

  afterAll(() => {
    rpc?.close();
  });

  it('reads the account and completes text and image turns without exposing credentials', async () => {
    const status = await service.getStatus();
    expect(status.available).toBe(true);
    expect(status.connected).toBe(true);
    expect(status.account?.email).toMatch(/^.\*\*\*@/);

    const model = status.models.find((candidate) => (
      candidate.id === 'gpt-5.4-mini'
      && candidate.inputModalities.includes('image')
    )) ?? status.models.find((candidate) => candidate.inputModalities.includes('image'));
    expect(model).toBeDefined();

    const text = await service.runTurn({
      model: model!.id,
      developerInstructions: '도구를 사용하지 말고 두 문장으로만 답하세요.',
      input: [{ type: 'text', text: 'VCB의 역할을 설명하세요.' }],
      timeoutMs: 180_000,
    });
    expect(text.text.trim().length).toBeGreaterThan(10);

    const bytes = await readFile(join(
      process.cwd(),
      'fixtures',
      'drawings',
      'external',
      'wiki-oneline.png',
    ));
    const image = await service.runTurn({
      model: model!.id,
      developerInstructions: '이미지에서 보이는 전기 기기 종류를 JSON으로만 반환하세요.',
      input: [
        {
          type: 'image',
          url: `data:image/png;base64,${bytes.toString('base64')}`,
          detail: 'original',
        },
        {
          type: 'text',
          text: 'Return {"devices": string[]} and do not use tools.',
        },
      ],
      outputSchema: {
        type: 'object',
        properties: {
          devices: {
            type: 'array',
            items: { type: 'string' },
          },
        },
        required: ['devices'],
        additionalProperties: false,
      },
      timeoutMs: 180_000,
    });
    const parsed = JSON.parse(image.text) as { devices?: unknown };
    expect(Array.isArray(parsed.devices)).toBe(true);
  }, 360_000);
});
