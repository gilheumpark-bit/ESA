import { copyTextWithFallback } from '../clipboard';

const oldNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
const oldWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
function globals(clipboard: unknown, prompt = jest.fn()) {
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { clipboard } });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { prompt } });
  return prompt;
}
afterEach(() => {
  if (oldNavigator) Object.defineProperty(globalThis, 'navigator', oldNavigator);
  else Reflect.deleteProperty(globalThis, 'navigator');
  if (oldWindow) Object.defineProperty(globalThis, 'window', oldWindow);
  else Reflect.deleteProperty(globalThis, 'window');
});

it('reports success only after the clipboard promise resolves', async () => {
  const writeText = jest.fn().mockResolvedValue(undefined);
  const prompt = globals({ writeText });
  expect(await copyTextWithFallback('sample')).toBe(true);
  expect(writeText).toHaveBeenCalledWith('sample');
  expect(prompt).not.toHaveBeenCalled();
});
it('offers manual text on a denied clipboard without claiming a copy', async () => {
  const prompt = globals({ writeText: jest.fn().mockRejectedValue(new Error('denied')) });
  expect(await copyTextWithFallback('sample', '공유 링크:')).toBe(false);
  expect(prompt).toHaveBeenCalledWith('공유 링크:', 'sample');
});
it.each([undefined, {}, { writeText: null }])('handles an unavailable clipboard %p', async (clipboard) => {
  const prompt = globals(clipboard);
  expect(await copyTextWithFallback('sample')).toBe(false);
  expect(prompt).toHaveBeenCalledWith('복사할 내용:', 'sample');
});
it('does not throw if the browser sandbox denies both copying and dialogs', async () => {
  globals(undefined, jest.fn(() => { throw new Error('sandbox'); }));
  expect(await copyTextWithFallback('sample')).toBe(false);
});
it('is safe outside a browser', async () => {
  Reflect.deleteProperty(globalThis, 'navigator');
  Reflect.deleteProperty(globalThis, 'window');
  expect(await copyTextWithFallback('sample')).toBe(false);
});
