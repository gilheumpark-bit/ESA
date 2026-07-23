import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

describe('pdf.js browser asset preparation contract', () => {
  it.each([
    ['pdf.worker.min.mjs'],
    ['wasm', 'jbig2.wasm'],
    ['wasm', 'openjpeg.wasm'],
    ['wasm', 'qcms_bg.wasm'],
    ['standard_fonts', 'FoxitFixed.pfb'],
    ['cmaps', '78-H.bcmap'],
    ['image_decoders', 'pdf.image_decoders.min.mjs'],
  ])('contains a non-empty %s asset', (...segments) => {
    const prepared = join(process.cwd(), 'public', 'vendor', 'pdfjs', ...segments);
    const installed = segments[0] === 'pdf.worker.min.mjs'
      ? join(process.cwd(), 'node_modules', 'pdfjs-dist', 'legacy', 'build', segments[0])
      : join(process.cwd(), 'node_modules', 'pdfjs-dist', ...segments);
    const info = statSync(existsSync(prepared) ? prepared : installed);
    expect(info.isFile()).toBe(true);
    expect(info.size).toBeGreaterThan(0);
  });

  it('copies every required directory into the public pdfjs namespace', () => {
    const script = readFileSync(join(process.cwd(), 'scripts', 'prepare-pdf-worker.mjs'), 'utf8');
    expect(script).toContain("['wasm', 'cmaps', 'standard_fonts', 'image_decoders']");
    expect(script).toContain("../public/vendor/pdfjs/");
    expect(script).toContain('PDF_ASSET_INVALID');
  });

  it('includes server-loaded binary assets in standalone deployments', () => {
    const config = readFileSync(join(process.cwd(), 'next.config.ts'), 'utf8');
    expect(config).toContain('outputFileTracingIncludes');
    expect(config).toContain("./node_modules/pdfjs-dist/wasm/**/*");
    expect(config).toContain("./node_modules/pdfjs-dist/standard_fonts/**/*");
    expect(config).toContain("./node_modules/pdfjs-dist/cmaps/**/*");
  });
});
