import sharp from 'sharp';
import type { ImageQualityProfile } from './evidence-types';

const MAX_PROFILE_SIDE = 1024;
const MAX_INPUT_PIXELS = 64_000_000;
const EDGE_THRESHOLD = 32;
const FOCUSED_GRADIENT_THRESHOLD = 128;
const MIN_FOCUSED_GRADIENT_RATIO = 0.05;
const MAX_SPARSE_WEAK_GRADIENT_DENSITY = 0.05;
const MIN_BLUR_SIGNAL_GRADIENT = 4;
const NOISE_FLOOR_MARGIN = 4;

type RunningStatistics = {
  count: number;
  mean: number;
  sumOfSquares: number;
};

function addSample(statistics: RunningStatistics, value: number): void {
  statistics.count += 1;
  const delta = value - statistics.mean;
  statistics.mean += delta / statistics.count;
  statistics.sumOfSquares += delta * (value - statistics.mean);
}

function variance(statistics: RunningStatistics): number {
  return statistics.count === 0 ? 0 : statistics.sumOfSquares / statistics.count;
}

function countAtOrAbove(histogram: readonly number[], threshold: number): number {
  return histogram.slice(Math.min(histogram.length, threshold)).reduce((total, count) => total + count, 0);
}

function percentileFromHistogram(histogram: readonly number[], count: number, percentile: number): number {
  const target = Math.max(1, Math.ceil(count * percentile));
  let accumulated = 0;

  for (let value = 0; value < histogram.length; value += 1) {
    accumulated += histogram[value];
    if (accumulated >= target) {
      return value;
    }
  }

  return 0;
}

function orientedDimensions(
  width: number | undefined,
  height: number | undefined,
  orientation: number | undefined,
  fallbackWidth: number,
  fallbackHeight: number,
): { width: number; height: number } {
  const sourceWidth = width ?? fallbackWidth;
  const sourceHeight = height ?? fallbackHeight;
  const swapsDimensions = orientation === 5 || orientation === 6 || orientation === 7 || orientation === 8;

  return swapsDimensions
    ? { width: sourceHeight, height: sourceWidth }
    : { width: sourceWidth, height: sourceHeight };
}

export async function profileImage(buffer: ArrayBuffer): Promise<ImageQualityProfile> {
  if (buffer.byteLength === 0) {
    throw new Error('빈 도면 이미지는 분석할 수 없습니다.');
  }

  const input = Buffer.from(buffer);
  const metadata = await sharp(input, { animated: false, limitInputPixels: MAX_INPUT_PIXELS }).metadata();
  const { data, info } = await sharp(input, { animated: false, limitInputPixels: MAX_INPUT_PIXELS })
    .rotate()
    .resize({
      width: MAX_PROFILE_SIDE,
      height: MAX_PROFILE_SIDE,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pixels: RunningStatistics = { count: 0, mean: 0, sumOfSquares: 0 };
  for (const value of data) {
    addSample(pixels, value);
  }

  const gradients: RunningStatistics = { count: 0, mean: 0, sumOfSquares: 0 };
  const gradientHistogram = Array.from({ length: 511 }, () => 0);
  let edgeCount = 0;
  for (let y = 1; y < info.height; y += 1) {
    for (let x = 1; x < info.width; x += 1) {
      const index = y * info.width + x;
      const gradient = Math.abs(data[index] - data[index - 1])
        + Math.abs(data[index] - data[index - info.width]);
      addSample(gradients, gradient);
      gradientHistogram[gradient] += 1;
      if (gradient >= EDGE_THRESHOLD) {
        edgeCount += 1;
      }
    }
  }

  const contrast = Math.min(1, Math.sqrt(variance(pixels)) / 128);
  const edgeDensity = edgeCount / Math.max(1, gradients.count);
  const gradientVariance = variance(gradients);
  const lowContrast = contrast < 0.08;
  const noiseFloor = percentileFromHistogram(gradientHistogram, gradients.count, 0.9);
  const blurSignalThreshold = Math.max(MIN_BLUR_SIGNAL_GRADIENT, noiseFloor + NOISE_FLOOR_MARGIN);
  const meaningfulGradientCount = countAtOrAbove(gradientHistogram, blurSignalThreshold);
  const focusedGradientCount = countAtOrAbove(
    gradientHistogram,
    Math.max(FOCUSED_GRADIENT_THRESHOLD, blurSignalThreshold),
  );
  const focusedGradientRatio = focusedGradientCount / Math.max(1, meaningfulGradientCount);
  const hasFocusedEdges = meaningfulGradientCount > 0 && focusedGradientRatio >= MIN_FOCUSED_GRADIENT_RATIO;
  const weakGradientDensity = meaningfulGradientCount / Math.max(1, gradients.count);
  const blurry = !hasFocusedEdges
    && weakGradientDensity > 0
    && weakGradientDensity < MAX_SPARSE_WEAK_GRADIENT_DENSITY;
  const warnings = [lowContrast ? 'LOW_CONTRAST' : '', blurry ? 'BLURRY' : ''].filter(Boolean);
  const dimensions = orientedDimensions(metadata.width, metadata.height, metadata.orientation, info.width, info.height);

  return {
    width: dimensions.width,
    height: dimensions.height,
    channels: metadata.channels ?? info.channels,
    contrast,
    edgeDensity,
    gradientVariance,
    lowContrast,
    blurry,
    recommendedScale: lowContrast || blurry ? 4 : Math.min(dimensions.width, dimensions.height) < 1200 ? 2 : 1,
    warnings,
  };
}
