import { CorrectionRequestError, parseDrawingCorrectionRequest, readDrawingCorrectionRequest, matchesCorrectionReplay } from '../drawing-correction-request';
import { createDrawingWorkspaceGuard } from '../drawing-workspace-guard';
const body = { targetDisplayId: 'P01-S001', selectedValue: 'breaker', correctionKind: 'type' as const,
  expectedUpdatedAt: '2026-09-10T00:00:00.000Z', idempotencyKey: 'request-00001' };
function request(raw: BodyInit, headers?: Record<string, string>, signal?: AbortSignal) {
  return new Request('http://localhost/corrections', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: raw, signal,
    ...({ duplex: 'half' } as RequestInit) });
}
it('reconstructs fields and removes caller authority including candidates', () => {
  expect(parseDrawingCorrectionRequest({ ...body, selectedValue: ' breaker ', originalCandidates: ['forced'], correctedBy: 'admin' })).toEqual(body);
});
it.each([null, [], false, 123, { ...body, selectedValue: 123 }, { ...body, selectedValue: [] }, { ...body, selectedValue: ' ' },
  { ...body, targetDisplayId: {} }, { ...body, correctionKind: ['type'] }, { ...body, expectedUpdatedAt: 0 },
  { ...body, selectedValue: 'x\u007f' }, { ...body, idempotencyKey: {} }, { ...body, selectedValue: 'x'.repeat(201) }])('rejects untrusted payload %#', (value) => {
  expect(() => parseDrawingCorrectionRequest(value)).toThrow(CorrectionRequestError);
});
it('supports page and symbol numbering beyond the initial width', () => {
  expect(parseDrawingCorrectionRequest({ ...body, targetDisplayId: 'P1000-S12000' }).targetDisplayId).toBe('P1000-S12000');
});
it('reads multibyte JSON across byte-sized chunks', async () => {
  const bytes = new TextEncoder().encode(JSON.stringify({ ...body, selectedValue: '차단기' }));
  const stream = new ReadableStream<Uint8Array>({ start(controller) { for (const byte of bytes) controller.enqueue(new Uint8Array([byte])); controller.close(); } });
  expect((await readDrawingCorrectionRequest(request(stream))).selectedValue).toBe('차단기');
});
it('bounds actual bytes without trusting a smaller declared length', async () => {
  await expect(readDrawingCorrectionRequest(request(JSON.stringify(body), { 'content-length': '1' }), 20)).rejects.toMatchObject({ status: 413 });
});
it('rejects oversize declared bodies before consuming the stream', async () => {
  const read = jest.fn();
  const req = request('x', { 'content-length': '17000' });
  jest.spyOn(req.body!, 'getReader').mockImplementation(read);
  await expect(readDrawingCorrectionRequest(req)).rejects.toMatchObject({ status: 413 });
  expect(read).not.toHaveBeenCalled();
});
it.each(['text/plain', 'application/x-www-form-urlencoded'])('requires JSON for %s', async (type) => {
  await expect(readDrawingCorrectionRequest(request(JSON.stringify(body), { 'content-type': type }))).rejects.toMatchObject({ status: 415 });
});
it.each(['{broken', ''])('rejects malformed JSON %p', async (raw) => {
  await expect(readDrawingCorrectionRequest(request(raw))).rejects.toMatchObject({ status: 400 });
});
it('rejects malformed UTF-8 instead of substituting codepoints', async () => {
  await expect(readDrawingCorrectionRequest(request(new Uint8Array([255])))).rejects.toMatchObject({ status: 400 });
});
it('bounds a stalled body, cancels it and releases its reader', async () => {
  const cancelled = jest.fn(); const req = request(new ReadableStream({ cancel: cancelled }));
  await expect(readDrawingCorrectionRequest(req, 16384, 10)).rejects.toMatchObject({ status: 408 });
  expect(cancelled).toHaveBeenCalledTimes(1); expect(req.body!.locked).toBe(false);
});
it('an aborted body cannot be applied', async () => {
  const controller = new AbortController(); const req = request(new ReadableStream(), undefined, controller.signal);
  const pending = readDrawingCorrectionRequest(req); controller.abort();
  await expect(pending).rejects.toMatchObject({ status: 408 });
});
it('transport exceptions become safe input failures without exposing internals', async () => {
  const req = request(new ReadableStream({ start(c) { c.error(new Error('private implementation detail')); } }));
  await expect(readDrawingCorrectionRequest(req)).rejects.toMatchObject({ status: 400 });
});
it('same key can replay only the same normalized action', () => {
  expect(matchesCorrectionReplay({ ...body, selectedValue: ' breaker ' }, body)).toBe(true);
  for (const changed of [{ ...body, selectedValue: 'fuse' }, { ...body, targetDisplayId: 'P02-S001' }, { ...body, correctionKind: 'label' }]) {
    expect(matchesCorrectionReplay(changed, body)).toBe(false);
  }
  expect(matchesCorrectionReplay({}, body)).toBe(false);
});
it('workspace replacement invalidates all old readers, never a new one', () => {
  const scope = createDrawingWorkspaceGuard(), old = scope.lease(), correction = scope.lease();
  scope.invalidate(); const next = scope.lease();
  expect(old.isCurrent()).toBe(false); expect(correction.signal.aborted).toBe(true); expect(next.isCurrent()).toBe(true);
  old.release(); correction.release(); expect(next.isCurrent()).toBe(true);
  next.cancel(); expect(next.isCurrent()).toBe(false);
});
