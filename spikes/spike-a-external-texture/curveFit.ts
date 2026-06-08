export interface CurveFit {
  intercept: number;
  maxError: number;
  name: string;
  rmse: number;
  slope: number;
}

export interface RowSample {
  canvas: number | null;
  expected: number;
  observed: number;
  x: number;
}

export interface CurveReport {
  best: CurveFit | null;
  fits: CurveFit[];
  samples: RowSample[];
}

const POINTS = [0.02, 0.05, 0.1, 0.18, 0.25, 0.38, 0.5, 0.62, 0.75, 0.9, 0.95, 0.98];

function srgbOetf(x: number): number {
  if (x <= 0.0031308) return 12.92 * x;
  return 1.055 * x ** (1 / 2.4) - 0.055;
}

function srgbEotf(x: number): number {
  if (x <= 0.04045) return x / 12.92;
  return ((x + 0.055) / 1.055) ** 2.4;
}

function bt709Eotf(x: number): number {
  if (x < 0.081) return x / 4.5;
  return ((x + 0.099) / 1.099) ** (1 / 0.45);
}

function bt709Oetf(x: number): number {
  if (x < 0.018) return 4.5 * x;
  return 1.099 * x ** 0.45 - 0.099;
}

function luma(pixels: Float32Array, idx: number): number {
  return (pixels[idx] ?? 0) * 0.2126 + (pixels[idx + 1] ?? 0) * 0.7152 + (pixels[idx + 2] ?? 0) * 0.0722;
}

function canvasLuma(pixels: Uint8ClampedArray | null, idx: number): number | null {
  if (!pixels) return null;
  return ((pixels[idx] ?? 0) * 0.2126 + (pixels[idx + 1] ?? 0) * 0.7152 + (pixels[idx + 2] ?? 0) * 0.0722) / 255;
}

function fit(samples: RowSample[], name: string, fn: (x: number) => number): CurveFit {
  const predicted = samples.map((s) => fn(s.expected));
  const observed = samples.map((s) => s.observed);
  const meanX = predicted.reduce((sum, value) => sum + value, 0) / predicted.length;
  const meanY = observed.reduce((sum, value) => sum + value, 0) / observed.length;
  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < predicted.length; i += 1) {
    numerator += (predicted[i]! - meanX) * (observed[i]! - meanY);
    denominator += (predicted[i]! - meanX) ** 2;
  }
  const slope = denominator > 0 ? numerator / denominator : 0;
  const intercept = meanY - slope * meanX;
  let sumSq = 0;
  let maxError = 0;
  for (let i = 0; i < predicted.length; i += 1) {
    const error = Math.abs(slope * predicted[i]! + intercept - observed[i]!);
    sumSq += error * error;
    maxError = Math.max(maxError, error);
  }
  return {
    name,
    slope,
    intercept,
    rmse: Math.sqrt(sumSq / predicted.length),
    maxError,
  };
}

export function analyzeRampRow(
  pixels: Float32Array,
  canvasPixels: Uint8ClampedArray | null,
  width: number,
  height: number,
): CurveReport {
  const y = Math.floor(height / 2);
  const samples = POINTS.map((point) => {
    const x = Math.max(0, Math.min(width - 1, Math.round(point * (width - 1))));
    const idx = (y * width + x) * 4;
    return {
      x,
      expected: (x + 0.5) / width,
      observed: luma(pixels, idx),
      canvas: canvasLuma(canvasPixels, idx),
    };
  });
  const fits = [
    fit(samples, 'identity', (x) => x),
    fit(samples, 'bt709_eotf', bt709Eotf),
    fit(samples, 'srgb_eotf', srgbEotf),
    fit(samples, 'bt709_eotf_to_srgb_oetf', (x) => srgbOetf(bt709Eotf(x))),
    fit(samples, 'srgb_oetf', srgbOetf),
    fit(samples, 'bt709_oetf', bt709Oetf),
  ].sort((a, b) => a.rmse - b.rmse);
  return {
    samples,
    fits,
    best: fits[0] ?? null,
  };
}
