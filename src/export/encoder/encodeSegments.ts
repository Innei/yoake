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

const RAW_INPUT_NAME = 'chunk_in.raw';
const CONCAT_LIST_NAME = 'concat_list.txt';
const TARGET_CHUNK_BYTES = 64 * 1024 * 1024;

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

function buildEncodeArgs(
  width: number,
  height: number,
  fps: number,
  inputName: string,
  outputName: string,
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
    inputName,
    '-c:v',
    'libx264',
    '-preset',
    'fast',
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    outputName,
  ];
}

function chunkMp4Name(index: number): string {
  return `chunk_${index.toString().padStart(6, '0')}.mp4`;
}

async function safeDelete(ff: FFmpeg, name: string): Promise<void> {
  try {
    await ff.deleteFile(name);
  } catch {
    /* ignore missing file */
  }
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
  onProgress?.({
    phase: 'plan',
    ratio: 0,
    framesDone: 0,
    framesTotal: plan.length,
  });

  const ff = await getFfmpeg();
  signal?.throwIfAborted?.();

  const frameBytes = width * height * 4;
  const framesPerChunk = Math.max(1, Math.floor(TARGET_CHUNK_BYTES / frameBytes));
  const chunkBuf = new Uint8Array(framesPerChunk * frameBytes);
  const chunkFiles: string[] = [];

  for (let start = 0; start < plan.length; start += framesPerChunk) {
    signal?.throwIfAborted?.();
    const end = Math.min(start + framesPerChunk, plan.length);
    const len = end - start;

    for (let i = 0; i < len; i += 1) {
      signal?.throwIfAborted?.();
      const frame = plan[start + i]!;
      const grade = effectiveGradeFor(baseGrade, segments, frame.sourceTime);
      const grabbed = await grabFrame(frame.sourceTime, grade);
      if (grabbed.rgba.byteLength !== frameBytes) {
        throw new Error(
          `encodeSegments: frame ${start + i} unexpected size ${grabbed.rgba.byteLength} (expected ${frameBytes})`,
        );
      }
      chunkBuf.set(grabbed.rgba, i * frameBytes);
      onProgress?.({
        phase: 'grab',
        ratio: (start + i + 1) / plan.length,
        framesDone: start + i + 1,
        framesTotal: plan.length,
      });
    }

    const sliceCopy = chunkBuf.slice(0, len * frameBytes);

    await ff.writeFile(RAW_INPUT_NAME, sliceCopy);
    const mp4Name = chunkMp4Name(chunkFiles.length);
    const encodeExit = await ff.exec(
      buildEncodeArgs(width, height, fps, RAW_INPUT_NAME, mp4Name),
    );
    if (typeof encodeExit === 'number' && encodeExit !== 0) {
      throw new Error(
        `encodeSegments: ffmpeg chunk ${chunkFiles.length} exited with code ${encodeExit}`,
      );
    }
    await safeDelete(ff, RAW_INPUT_NAME);
    chunkFiles.push(mp4Name);

    onProgress?.({
      phase: 'encode',
      ratio: end / plan.length,
      framesTotal: plan.length,
    });
  }

  signal?.throwIfAborted?.();

  let finalName: string;
  if (chunkFiles.length === 1) {
    finalName = chunkFiles[0]!;
  } else {
    const listText = chunkFiles.map((f) => `file '${f}'`).join('\n');
    await ff.writeFile(
      CONCAT_LIST_NAME,
      new TextEncoder().encode(listText),
    );
    const concatExit = await ff.exec([
      '-y',
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      CONCAT_LIST_NAME,
      '-c',
      'copy',
      '-movflags',
      '+faststart',
      filename,
    ]);
    if (typeof concatExit === 'number' && concatExit !== 0) {
      throw new Error(
        `encodeSegments: ffmpeg concat exited with code ${concatExit}`,
      );
    }
    await safeDelete(ff, CONCAT_LIST_NAME);
    finalName = filename;
  }

  onProgress?.({ phase: 'finalize', ratio: 1, framesTotal: plan.length });
  const data = await ff.readFile(finalName);
  if (typeof data === 'string') {
    throw new Error('encodeSegments: unexpected string read from ffmpeg memfs');
  }
  const owned = new Uint8Array(data.byteLength);
  owned.set(data);
  const blob = new Blob([owned], { type: 'video/mp4' });

  for (const f of chunkFiles) {
    await safeDelete(ff, f);
  }
  if (chunkFiles.length > 1) {
    await safeDelete(ff, filename);
  }

  return { blob, filename, frameCount: plan.length };
}
