import { formatApiError, getUserMessage, readApiErrorMessage } from '../error-messages';

const fallback = 'DXF 파싱 실패';

describe('API error envelope messages', () => {
  it('preserves a legacy drawing error string', () => {
    expect(readApiErrorMessage({ success: false, error: '지원하지 않는 DXF 형식입니다.' }, fallback))
      .toBe('지원하지 않는 DXF 형식입니다.');
  });

  it('reads the structured handler message without stringifying the object', () => {
    expect(readApiErrorMessage({ error: { code: 'ESVA-4010', message: '전압을 확인하세요.', field: 'voltage' } }, fallback))
      .toBe('전압을 확인하세요.');
  });

  it('uses a top-level message when the error has no readable message', () => {
    expect(readApiErrorMessage({ error: { code: 'UNKNOWN' }, message: '서버 준비 중입니다.' }, fallback))
      .toBe('서버 준비 중입니다.');
  });

  it('shows the actual numeric retry guidance without automatically retrying', () => {
    expect(readApiErrorMessage({ error: { code: 'ESVA-9429', message: 'Too many requests', retryAfter: 17.2 } }, fallback))
      .toBe('요청이 너무 많습니다. 18초 후 다시 시도해주세요.');
  });

  it.each([undefined, null, -1, 0, NaN, Infinity, '17', {}, 86_401])(
    'does not coerce invalid retryAfter %p into user guidance', (retryAfter) => {
      expect(readApiErrorMessage({ error: { code: 'ESVA-9429', retryAfter } }, fallback))
        .toBe('요청이 너무 많습니다. 잠시 후 다시 시도해주세요.');
    },
  );

  it.each([undefined, null, '', 0, true, [], {}, { error: {} }, { error: [] },
    { error: { message: {} } }, { error: { message: 429 } }, { error: ' ', message: '\n' }])(
    'uses the supplied fallback for malformed envelope %p', (body) => {
      expect(readApiErrorMessage(body, fallback)).toBe(fallback);
    },
  );

  it('does not disclose arbitrary diagnostic fields or mutate the response', () => {
    const body = Object.freeze({ error: Object.freeze({ stack: 'PRIVATE_STACK', details: 'PRIVATE_DETAILS' }) });
    expect(readApiErrorMessage(body, fallback)).toBe(fallback);
    expect(body.error.stack).toBe('PRIVATE_STACK');
  });

  it('registers the actual rate-limiter code for existing message consumers too', () => {
    expect(formatApiError({ code: 'ESVA-9429', message: 'Too many requests' }))
      .toBe(getUserMessage('ESVA-9429'));
  });
});
