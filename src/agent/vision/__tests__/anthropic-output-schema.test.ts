import { toAnthropicOutputSchema } from '../vlm-client';

describe('toAnthropicOutputSchema', () => {
  it('수치 제약을 떼어 낸다', () => {
    // Anthropic structured outputs 는 minimum/maximum/multipleOf 를 지원하지
    // 않는다. 남겨 보내면 스키마 자체가 거부된다.
    expect(toAnthropicOutputSchema({
      type: 'number',
      minimum: 0,
      maximum: 1000,
      multipleOf: 0.5,
    })).toEqual({ type: 'number' });
  });

  it('문자열·배열 길이 제약도 뗀다', () => {
    expect(toAnthropicOutputSchema({
      type: 'array',
      minItems: 1,
      maxItems: 10,
      items: { type: 'string', minLength: 2, maxLength: 8, pattern: '^[a-z]+$' },
    })).toEqual({ type: 'array', items: { type: 'string' } });
  });

  it('nullable union 을 anyOf 로 편다', () => {
    expect(toAnthropicOutputSchema({ type: ['string', 'null'] }))
      .toEqual({ anyOf: [{ type: 'string' }, { type: 'null' }] });
    expect(toAnthropicOutputSchema({ type: ['number', 'null'] }))
      .toEqual({ anyOf: [{ type: 'number' }, { type: 'null' }] });
  });

  it('단일 원소 union 은 그냥 type 으로 되돌린다', () => {
    expect(toAnthropicOutputSchema({ type: ['string'] })).toEqual({ type: 'string' });
  });

  it('additionalProperties: false 는 남기고, 없으면 채운다', () => {
    // Google 방언과 정반대다 — Google 은 이 키를 거부해서 지웠지만
    // Anthropic 은 객체마다 이 키를 요구한다.
    expect(toAnthropicOutputSchema({
      type: 'object',
      properties: { a: { type: 'string' } },
      additionalProperties: false,
    })).toEqual({
      type: 'object',
      properties: { a: { type: 'string' } },
      additionalProperties: false,
    });

    expect(toAnthropicOutputSchema({ type: 'object', properties: {} }))
      .toEqual({ type: 'object', properties: {}, additionalProperties: false });
  });

  it('중첩된 객체·배열까지 재귀로 변환한다', () => {
    const source = {
      $schema: 'https://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: {
        components: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              rating: { type: ['string', 'null'] },
              confidence: { type: 'number', minimum: 0, maximum: 1 },
            },
            required: ['id', 'rating', 'confidence'],
            additionalProperties: false,
          },
        },
      },
      required: ['components'],
      additionalProperties: false,
    };

    expect(toAnthropicOutputSchema(source)).toEqual({
      type: 'object',
      properties: {
        components: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              rating: { anyOf: [{ type: 'string' }, { type: 'null' }] },
              confidence: { type: 'number' },
            },
            required: ['id', 'rating', 'confidence'],
            additionalProperties: false,
          },
        },
      },
      required: ['components'],
      additionalProperties: false,
    });
  });

  it('enum 과 required 는 그대로 보존한다', () => {
    expect(toAnthropicOutputSchema({
      type: 'string',
      enum: ['breaker', 'transformer'],
    })).toEqual({ type: 'string', enum: ['breaker', 'transformer'] });
  });
});
