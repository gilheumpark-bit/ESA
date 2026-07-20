import sharp from 'sharp';
import type {
  ImageQualityProfile,
  ImageVariant,
  ImageVariantKind,
} from './evidence-types';

const MAX_VARIANT_PIXELS = 64_000_000;

type VariantSpec = {
  kind: ImageVariantKind;
  scale: 1 | 2 | 4;
};

type RenderedImage = {
  data: Buffer;
  width: number;
  height: number;
};

const VARIANT_SPECS: readonly VariantSpec[] = [
  { kind: 'original', scale: 1 },
  { kind: 'upscale-2x', scale: 2 },
  { kind: 'upscale-4x', scale: 4 },
  { kind: 'text-high-contrast', scale: 4 },
  { kind: 'line-enhanced', scale: 2 },
];

function toArrayBuffer(buffer: Uint8Array): ArrayBuffer {
  return Uint8Array.from(buffer).buffer;
}

function dimensionsFromInfo(info: { width?: number; height?: number }): {
  width: number;
  height: number;
} {
  if (!info.width || !info.height) {
    throw new Error('도면 이미지 치수를 확인할 수 없습니다.');
  }

  return { width: info.width, height: info.height };
}

function boundedDimensions(
  sourceWidth: number,
  sourceHeight: number,
  requestedScale: number,
): { width: number; height: number } {
  const sourcePixels = sourceWidth * sourceHeight;
  const scale = Math.min(
    requestedScale,
    Math.sqrt(MAX_VARIANT_PIXELS / sourcePixels),
  );
  let width = Math.max(1, Math.floor(sourceWidth * scale));
  let height = Math.max(1, Math.floor(sourceHeight * scale));

  if (width * height > MAX_VARIANT_PIXELS) {
    const reduction = Math.sqrt(MAX_VARIANT_PIXELS / (width * height));
    width = Math.max(1, Math.floor(width * reduction));
    height = Math.max(1, Math.floor(height * reduction));
  }

  return { width, height };
}

function toVariant(
  kind: ImageVariantKind,
  rendered: RenderedImage,
  sourceWidth: number,
  sourceHeight: number,
): ImageVariant {
  return {
    id: `variant:${kind}`,
    kind,
    buffer: toArrayBuffer(rendered.data),
    width: rendered.width,
    height: rendered.height,
    transform: {
      scaleX: rendered.width / sourceWidth,
      scaleY: rendered.height / sourceHeight,
      offsetX: 0,
      offsetY: 0,
    },
  };
}

async function normalizeSource(source: Buffer): Promise<RenderedImage> {
  const { data, info } = await sharp(source, {
    animated: false,
    limitInputPixels: MAX_VARIANT_PIXELS,
  })
    .rotate()
    .png()
    .toBuffer({ resolveWithObject: true });
  const { width, height } = dimensionsFromInfo(info);

  return { data, width, height };
}

async function renderVariant(
  source: Buffer,
  sourceWidth: number,
  sourceHeight: number,
  spec: VariantSpec,
): Promise<ImageVariant> {
  const { width, height } = boundedDimensions(
    sourceWidth,
    sourceHeight,
    spec.scale,
  );
  let pipeline = sharp(source, {
    animated: false,
    limitInputPixels: MAX_VARIANT_PIXELS,
  });

  if (width !== sourceWidth || height !== sourceHeight) {
    pipeline = pipeline.resize({
      width,
      height,
      kernel: sharp.kernel.lanczos3,
    });
  }
  if (spec.kind === 'text-high-contrast') {
    pipeline = pipeline.greyscale().normalise().sharpen().threshold(180);
  }
  if (spec.kind === 'line-enhanced') {
    pipeline = pipeline.greyscale().normalise().sharpen({ sigma: 1 });
  }

  const { data, info } = await pipeline.png().toBuffer({ resolveWithObject: true });
  const actualDimensions = dimensionsFromInfo(info);

  return toVariant(
    spec.kind,
    { data, ...actualDimensions },
    sourceWidth,
    sourceHeight,
  );
}

export async function createImageVariants(
  buffer: ArrayBuffer,
  _profile: ImageQualityProfile,
): Promise<ImageVariant[]> {
  if (buffer.byteLength === 0) {
    throw new Error('빈 도면 이미지는 분석할 수 없습니다.');
  }

  const normalized = await normalizeSource(Buffer.from(buffer));
  const variants = [
    toVariant('original', normalized, normalized.width, normalized.height),
  ];

  for (const spec of VARIANT_SPECS.slice(1)) {
    variants.push(
      await renderVariant(
        normalized.data,
        normalized.width,
        normalized.height,
        spec,
      ),
    );
  }

  return variants;
}
