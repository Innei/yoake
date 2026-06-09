import type { FFmpeg } from '@ffmpeg/ffmpeg';

import type { GradeState, Segment } from '~/fs/clipSidecar';

import { buildFramePlan, type FramePlan } from './frameSource';

export interface EncodeSegmentsOptions {
  baseGrade: GradeState;
  duration: number;
  exposureBase: number;
  filename: string;
  fps: number;
  getFfmpeg: () => Promise<FFmpeg>;
  grabFrame: (
    sourceTime: number,
    effectiveGrade: GradeState | undefined,
  ) => Promise<{ height: number; rgba: Uint8Array; width: number }>;
  height: number;
  onProgress?: (progress: EncodeProgress) => void;
  segments: readonly Segment[];
  signal?: AbortSignal;
  width: number;
}

export type EncodePhase = 'plan' | 'grab' | 'encode' | 'finalize';

export interface EncodeProgress {
  framesDone?: number;
  framesTotal?: number;
  phase: EncodePhase;
  ratio: number;
}

export interface EncodeSegmentsResult {
  blob: Blob;
  filename: string;
  frameCount: number;
}

const INPUT_FILE = 'in.raw';

function effectiveGradeFor(
  baseGrade: GradeState,
  segments: readonly Segment[],
  sourceTime: number,
): GradeState {
  const segment = segments.find(
    (s) => sourceTime >= s.in && sourceTime < s.out,
  );
  if (!segment || segment.gradeOverride === undefined) return baseGrade;
  return { ...baseGrade, ...segment.gradeOverride };
}

function buildFfmpegArgs(
  width: number,
  height: number,
  fps: number,
  outputFilename: string,
): string[] {
  return [
    '-y',
    '-f',
    'rawvideo',
    '-pix_fmt',
    'rgba',
    '-s',
    `${width}x${height}`,
    '-r',
    String(fps),
    '-i',
    INPUT_FILE,
    '-c:v',
    'libx264',
    '-preset',
    'fast',
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    outputFilename,
  ];
}

export async function encodeSegments(
  opts: EncodeSegmentsOptions,
): Promise<EncodeSegmentsResult> {
  const {
    baseGrade,
    duration,
    filename,
    fps,
    getFfmpeg,
    grabFrame,
    height,
    onProgress,
    segments,
    signal,
    width,
  } = opts;

  if (!(width > 0 && height > 0)) {
    throw new Error(`encodeSegments: invalid size ${width}x${height}`);
  }
  if (!(fps > 0)) {
    throw new Error(`encodeSegments: invalid fps ${fps}`);
  }

  const plan: FramePlan[] = buildFramePlan({ duration, fps, segments });
  if (plan.length === 0) {
    throw new Error('encodeSegments: no frames to encode');
  }

  signal?.throwIfAborted?.();
  onProgress?.({ phase: 'plan', ratio: 0, framesDone: 0, framesTotal: plan.length });

  const ff = await getFfmpeg();
  signal?.throwIfAborted?.();

  const frameBytes = width * height * 4;
  const totalBytes = frameBytes * plan.length;
  const buffer = new Uint8Array(totalBytes);

  for (let i = 0; i < plan.length; i += 1) {
    signal?.throwIfAborted?.();
    const frame = plan[i]!;
    const grade = effectiveGradeFor(baseGrade, segments, frame.sourceTime);
    const grabbed = await grabFrame(frame.sourceTime, grade);
    if (grabbed.rgba.byteLength !== frameBytes) {
      throw new Error(
        `encodeSegments: frame ${i} unexpected size ${grabbed.rgba.byteLength} (expected ${frameBytes})`,
      );
    }
    buffer.set(grabbed.rgba, i * frameBytes);
    onProgress?.({
      phase: 'grab',
      ratio: (i + 1) / plan.length,
      framesDone: i + 1,
      framesTotal: plan.length,
    });
  }

  signal?.throwIfAborted?.();
  await ff.writeFile(INPUT_FILE, buffer);

  onProgress?.({ phase: 'encode', ratio: 0, framesTotal: plan.length });

  const progressHandler = ({ progress }: { progress: number }) => {
    if (Number.isFinite(progress) && progress >= 0 && progress <= 1) {
      onProgress?.({ phase: 'encode', ratio: progress, framesTotal: plan.length });
    }
  };
  ff.on('progress', progressHandler);

  let exitCode: unknown;
  try {
    exitCode = await ff.exec(buildFfmpegArgs(width, height, fps, filename));
  } finally {
    ff.off('progress', progressHandler);
  }
  if (typeof exitCode === 'number' && exitCode !== 0) {
    throw new Error(`encodeSegments: ffmpeg exited with code ${exitCode}`);
  }

  onProgress?.({ phase: 'finalize', ratio: 1, framesTotal: plan.length });
  const data = await ff.readFile(filename);
  if (typeof data === 'string') {
    throw new Error('encodeSegments: unexpected string read from ffmpeg memfs');
  }
  const owned = new Uint8Array(data.byteLength);
  owned.set(data);
  const blob = new Blob([owned], { type: 'video/mp4' });

  try {
    await ff.deleteFile(INPUT_FILE);
  } catch {
    /* ignore */
  }
  try {
    await ff.deleteFile(filename);
  } catch {
    /* ignore */
  }

  return { blob, filename, frameCount: plan.length };
}
