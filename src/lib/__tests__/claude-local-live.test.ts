/**
 * 로컬 Claude CLI 실호출 게이트.
 *
 * 기본은 건너뛴다. 로그인된 CLI가 있는 기계에서만 의미가 있고, 실행하면
 * 사용자 계정의 사용량을 쓴다. 켜려면 `ESA_CLAUDE_LOCAL_LIVE=1`.
 *
 *   ESA_CLAUDE_LOCAL_LIVE=1 npx jest src/lib/__tests__/claude-local-live.test.ts
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { getClaudeLocalStatus, runClaudeLocalTurn } from '../claude-local';

const live = process.env.ESA_CLAUDE_LOCAL_LIVE === '1';
const describeLive = live ? describe : describe.skip;

describeLive('claude-local 실호출', () => {
  jest.setTimeout(300_000);

  it('로그인 상태를 계정 원문 없이 보고한다', async () => {
    const status = await getClaudeLocalStatus();
    expect(status.available).toBe(true);
    expect(status.connected).toBe(true);
    // 첫 글자 하나만 남기고 가린 형태여야 한다.
    expect(status.account?.email ?? '').toMatch(/^.\*\*\*@/);
    expect(status.models.some((model) => model.inputModalities.includes('image'))).toBe(true);
  });

  it('공개 단선도에서 역할 스키마에 맞는 JSON을 돌려준다', async () => {
    const image = readFileSync(join(process.cwd(), 'fixtures/drawings/external/wiki-oneline.png'));
    const outputSchema = {
      type: 'object',
      properties: {
        symbols: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              type: { type: 'string' },
              label: { type: ['string', 'null'] },
            },
            required: ['id', 'type', 'label'],
            additionalProperties: false,
          },
        },
      },
      required: ['symbols'],
      additionalProperties: false,
    };

    const result = await runClaudeLocalTurn({
      model: 'claude-sonnet-5',
      developerInstructions:
        'You are reading an electrical single-line diagram. List every distinct device symbol you can see. '
        + 'Use one entry per physical device; do not merge repeated symbols.',
      image: { base64: image.toString('base64'), mimeType: 'image/png' },
      outputSchema,
      effort: 'medium',
      timeoutMs: 240_000,
    });

    expect(result.model).toBe('claude-sonnet-5');
    expect(result.durationMs).toBeGreaterThan(0);
    const parsed = JSON.parse(result.text) as { symbols: Array<{ id: string; type: string }> };
    expect(Array.isArray(parsed.symbols)).toBe(true);
    expect(parsed.symbols.length).toBeGreaterThan(0);
    console.log(`[claude-local] ${result.durationMs}ms · symbols=${parsed.symbols.length} · `
      + JSON.stringify(parsed.symbols.reduce<Record<string, number>>((counts, symbol) => {
        counts[symbol.type] = (counts[symbol.type] ?? 0) + 1;
        return counts;
      }, {})));
  });

  it('취소 신호를 즉시 존중한다', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(runClaudeLocalTurn({
      model: 'claude-sonnet-5',
      developerInstructions: 'noop',
      image: { base64: 'iVBORw0KGgo=', mimeType: 'image/png' },
      signal: controller.signal,
    })).rejects.toThrow('CLAUDE_LOCAL_ABORTED');
  });
});
