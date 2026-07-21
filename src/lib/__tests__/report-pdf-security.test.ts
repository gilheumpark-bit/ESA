import { generatePDFResponse } from '../report-pdf';

describe('team report printable HTML', () => {
  test('escapes report-controlled fields before document.write', () => {
    const payload = {
      title: '</title><script>window.opener.location="https://attacker.example"</script>',
      reportId: '<img src=x onerror=alert(1)>',
      projectName: '</pre><svg onload=alert(1)>',
    };

    const html = generatePDFResponse(payload);

    expect(html).not.toContain('<script>window.opener');
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('<svg onload');
    expect(html).toContain('&lt;script&gt;window.opener');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).toContain('&lt;/pre&gt;&lt;svg onload=alert(1)&gt;');
  });

  test('ships a restrictive CSP for the standalone print document', () => {
    const html = generatePDFResponse({ title: 'Safe report' });

    expect(html).toContain("default-src 'none'");
    expect(html).toContain("style-src 'unsafe-inline'");
  });
});
