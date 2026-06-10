import type { GradeState, Segment } from '~/fs/clipSidecar';

import type { FramePlan } from '../frameSource';
import { buildFramePlan } from '../frameSource';
import type { Mp4WriterQuality } from './mp4Writer';
import { createMp4Writer } from './mp4Writer';

export type EncodePhase = 'plan' | 'grab' | 'encode' | 'finalize';

export interface EncodeProgress {
  frameCurrent?: number;
  framesDone?: number;
  framesTotal?: number;
  phase: EncodePhase;
  ratio: number;
}

export interface EncodeGradedOptions {
  bakeSpeed?: boolean;
  bakeTrim?: boolean;
  baseGrade: GradeState;
  codec: 'avc' | 'hevc';
  duration: number;
  fps: number;
  grabFrame: (
    sourceTime: number,
    effectiveGrade: GradeState | undefined,
  ) => Promise<{ height: number; rgba: Uint8Array; width: number }>;
  height: number;
  onProgress?: (progress: EncodeProgress) => void;
  quality?: Mp4WriterQuality;
  segments: readonly Segment[];
  signal?: AbortSignal;
  width: number;
  writable: FileSystemWritableFileStream;
}

export interface EncodeGradedResult {
  frameCount: number;
}

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

export async function encodeGraded(
  opts: EncodeGradedOptions,
): Promise<EncodeGradedResult> {
  const {
    bakeSpeed = true,
    bakeTrim = true,
    baseGrade,
    codec,
    duration,
    fps,
    grabFrame,
    height,
    onProgress,
    quality,
    segments,
    signal,
    width,
    writable,
  } = opts;

  if (!(width > 0 && height > 0)) {
    throw new Error(`encodeGraded: invalid size ${width}x${height}`);
  }
  if (!(fps > 0)) {
    throw new Error(`encodeGraded: invalid fps ${fps}`);
  }

  const plan: FramePlan[] = buildFramePlan({
    bakeSpeed,
    duration,
    fps,
    segments: bakeTrim ? segments : [],
  });
  if (plan.length === 0) {
    throw new Error('encodeGraded: no frames to encode');
  }

  signal?.throwIfAborted?.();
  onProgress?.({
    framesDone: 0,
    framesTotal: plan.length,
    phase: 'plan',
    ratio: 0,
  });

  const writer = await createMp4Writer({
    ...(quality ? { quality } : {}),
    codec,
    fps,
    height,
    width,
    writable,
  });

  const frameBytes = width * height * 4;
  const frameDurationSec = 1 / fps;

  try {
    for (const [i, planned] of plan.entries()) {
      signal?.throwIfAborted?.();
      const grade = effectiveGradeFor(baseGrade, segments, planned.sourceTime);
      onProgress?.({
        frameCurrent: i + 1,
        framesDone: i,
        framesTotal: plan.length,
        phase: 'grab',
        ratio: i / plan.length,
      });
      const grabbed = await grabFrame(planned.sourceTime, grade);
      signal?.throwIfAborted?.();
      if (grabbed.rgba.byteLength !== frameBytes) {
        throw new Error(
          `encodeGraded: frame ${i} unexpected size ${grabbed.rgba.byteLength} (expected ${frameBytes})`,
        );
      }
      const timestampSec = planned.outputFrameIndex / fps;
      const frame = new VideoFrame(grabbed.rgba, {
        codedHeight: height,
        codedWidth: width,
        duration: Math.round(frameDurationSec * 1e6),
        format: 'RGBA',
        timestamp: Math.round(timestampSec * 1e6),
      });
      await writer.addFrame(frame, timestampSec, frameDurationSec);
      onProgress?.({
        framesDone: i + 1,
        framesTotal: plan.length,
        phase: 'encode',
        ratio: (i + 1) / plan.length,
      });
    }

    signal?.throwIfAborted?.();
    onProgress?.({ framesTotal: plan.length, phase: 'finalize', ratio: 1 });
    await writer.finalize();
  } catch (error) {
    await writer.cancel().catch(() => undefined);
    throw error;
  }

  return { frameCount: plan.length };
}
