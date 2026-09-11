/** Open only an owned same-origin blank window; never navigate to user URLs. */
export async function openDrawingPrintWindow(render: () => Promise<string>): Promise<void> {
  // Must run inside the click activation, before a dynamic import yields.
  // `noopener` in window.open returns null even when a window was opened, so
  // detach the new about:blank window immediately instead of using that flag.
  const popup = window.open('about:blank', '_blank');
  if (!popup) throw new Error('팝업이 차단되어 인쇄용 보고서를 열 수 없습니다. 팝업을 허용해 주세요.');
  try {
    popup.opener = null;
    popup.document.title = 'ESA 보고서 준비 중';
    popup.document.body.textContent = '보고서를 준비하고 있습니다.';
    const html = await render();
    if (popup.closed) throw new Error('보고서 창이 닫혔습니다. 인쇄용 보고서를 다시 열어주세요.');
    popup.document.open();
    popup.document.write(html);
    popup.document.close();
  } catch (error) {
    if (!popup.closed) popup.close();
    throw error;
  }
}
