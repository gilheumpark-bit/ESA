import { openDrawingPrintWindow } from '../drawing-print-window';

describe('owned drawing print window', () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const setup = () => {
    const popup = {
      opener: { main: true } as unknown, closed: false,
      document: { title: '', body: { textContent: '' }, open: jest.fn(), write: jest.fn(), close: jest.fn() },
      close: jest.fn(),
    };
    const open = jest.fn(() => popup);
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { open } });
    return { popup, open };
  };
  afterEach(() => {
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
    else Reflect.deleteProperty(globalThis, 'window');
  });

  it('opens inside user activation before loading the renderer and immediately detaches opener', async () => {
    const { popup, open } = setup();
    let finish!: (html: string) => void;
    const render = jest.fn(() => new Promise<string>((resolve) => { finish = resolve; }));
    const result = openDrawingPrintWindow(render);
    expect(open).toHaveBeenCalledWith('about:blank', '_blank');
    expect(popup.opener).toBeNull();
    expect(popup.document.write).not.toHaveBeenCalled();
    finish('<!doctype html><title>Safe report</title>');
    await result;
    expect(popup.document.write).toHaveBeenCalledWith('<!doctype html><title>Safe report</title>');
    expect(popup.document.close).toHaveBeenCalledTimes(1);
  });

  it('does not generate a report when the popup is blocked', async () => {
    setup();
    (window.open as jest.Mock).mockReturnValue(null);
    const render = jest.fn();
    await expect(openDrawingPrintWindow(render)).rejects.toThrow('팝업이 차단');
    expect(render).not.toHaveBeenCalled();
  });

  it('closes a blank window and surfaces a report-limit error', async () => {
    const { popup } = setup();
    await expect(openDrawingPrintWindow(async () => { throw new Error('50,000행 초과'); })).rejects.toThrow('50,000행 초과');
    expect(popup.close).toHaveBeenCalledTimes(1);
    expect(popup.document.write).not.toHaveBeenCalled();
  });

  it('does not write into a window the user closed while preparing', async () => {
    const { popup } = setup();
    await expect(openDrawingPrintWindow(async () => { popup.closed = true; return '<html></html>'; }))
      .rejects.toThrow('보고서 창이 닫혔습니다');
    expect(popup.document.write).not.toHaveBeenCalled();
  });
});
