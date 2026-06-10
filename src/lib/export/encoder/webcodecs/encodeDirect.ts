import type { AudioCodec } from 'mediabunny';
import {
  ALL_FORMATS,
  BlobSource,
  EncodedPacketSink,
  Input,
  Mp4OutputFormat,
  VideoSampleSink,
} from 'mediabunny';

import type { Segment } from '~/lib/fs/clipSidecar';

import type { EncodeProgress } from './encodeGraded';
import type { Mp4WriterQuality } from './mp4Writer';
import { createMp4Writer } from './mp4Writer';

export interface DirectExportCapabilityOptions {
  bakeGrade: boolean;
  bakeSpeed: boolean;
  bakeTrim: boolean;
  resolution: string;
  segments: readonly Segment[];
}

export interface EncodeDirectOptions {
  bakeSpeed?: boolean;
  bakeTrim?: boolean;
  codec: 'avc' | 'hevc';
  onProgress?: (progress: EncodeProgress) => void;
  quality?: Mp4WriterQuality;
  segments: readonly Segment[];
  signal?: AbortSignal;
  sourceHandle: FileSystemFileHandle;
  writable: FileSystemWritableFileStream;
}

export interface EncodeDirectResult {
  audioDropReason?: string;
  audioIncluded: boolean;
  frameCount: number;
}

const SPEED_EPSILON = 1e-6;
const FPS_PROBE_PACKET_COUNT = 120;

function isNormalSpeedSegment(segment: Segment): boolean {
  return (
    segment.playMode === 'normal' &&
    Math.abs((segment.speed ?? 1) - 1) <= SPEED_EPSILON
  );
}

export function canUseDirectExport(
  opts: DirectExportCapabilityOptions,
): boolean {
  if (opts.bakeGrade) return false;
  if (opts.resolution !== 'source') return false;
  if (!opts.bakeTrim) return true;
  if (!opts.bakeSpeed) return true;
  return opts.segments.every(isNormalSpeedSegment);
}

interface TimeRange {
  in: number;
  out: number;
}

function resolveRanges(
  bakeTrim: boolean,
  segments: readonly Segment[],
  duration: number,
): TimeRange[] {
  if (bakeTrim && segments.length > 0) {
    return [...segments]
      .sort((a, b) => a.in - b.in)
      .map((segment) => ({ in: segment.in, out: segment.out }));
  }
  return [{ in: 0, out: duration }];
}

interface AudioPlan {
  config: { codec: AudioCodec; decoderConfig: AudioDecoderConfig } | null;
  dropReason?: string;
  sink: EncodedPacketSink | null;
}

async function planAudio(input: Input): Promise<AudioPlan> {
  const track = await input.getPrimaryAudioTrack();
  if (!track) return { config: null, sink: null };

  const codec = await track.getCodec();
  if (!codec || !new Mp4OutputFormat().getSupportedAudioCodecs().includes(codec)) {
    return {
      config: null,
      dropReason: `audio codec ${codec ?? 'unknown'} cannot be muxed into mp4`,
      sink: null,
    };
  }

  const decoderConfig = await track.getDecoderConfig();
  if (!decoderConfig) {
    return {
      config: null,
      dropReason: 'audio decoder configuration is unavailable',
      sink: null,
    };
  }

  return {
    config: { codec, decoderConfig },
    sink: new EncodedPacketSink(track),
  };
}

export async function encodeDirect(
  opts: EncodeDirectOptions,
): Promise<EncodeDirectResult> {
  const {
    bakeSpeed = true,
    bakeTrim = true,
    codec,
    onProgress,
    quality,
    segments,
    signal,
    sourceHandle,
    writable,
  } = opts;

  if (
    !canUseDirectExport({
      bakeGrade: false,
      bakeSpeed,
      bakeTrim,
      resolution: 'source',
      segments,
    })
  ) {
    throw new Error('encodeDirect: unsupported timeline semantics');
  }

  signal?.throwIfAborted?.();
  const file = await sourceHandle.getFile();
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(file) });

  try {
    const videoTrack = await input.getPrimaryVideoTrack();
    if (!videoTrack) {
      throw new Error('encodeDirect: source has no video track');
    }
    signal?.throwIfAborted?.();

    const [width, height, duration, stats] = await Promise.all([
      videoTrack.getDisplayWidth(),
      videoTrack.getDisplayHeight(),
      videoTrack.computeDuration(),
      videoTrack.computePacketStats(FPS_PROBE_PACKET_COUNT),
    ]);
    const fps = stats.averagePacketRate;
    if (!(width > 0 && height > 0)) {
      throw new Error(`encodeDirect: invalid source size ${width}x${height}`);
    }
    if (!(fps > 0)) {
      throw new Error(`encodeDirect: invalid source fps ${fps}`);
    }

    const audio = await planAudio(input);
    signal?.throwIfAborted?.();

    const ranges = resolveRanges(bakeTrim, segments, duration);
    const totalOutput = ranges.reduce(
      (acc, range) => acc + (range.out - range.in),
      0,
    );

    const writer = await createMp4Writer({
      ...(audio.config ? { audio: audio.config } : {}),
      ...(quality ? { quality } : {}),
      codec,
      fps,
      height,
      width,
      writable,
    });

    let frameCount = 0;
    try {
      const videoSink = new VideoSampleSink(videoTrack);
      let outputOffset = 0;
      let lastRatio = 0;
      const reportEncoded = (processedOutputSec: number) => {
        if (!onProgress || !(totalOutput > 0)) return;
        lastRatio = Math.min(
          1,
          Math.max(lastRatio, processedOutputSec / totalOutput),
        );
        onProgress({ phase: 'encode', ratio: lastRatio });
      };

      for (const range of ranges) {
        signal?.throwIfAborted?.();

        for await (const sample of videoSink.samples(range.in, range.out)) {
          try {
            signal?.throwIfAborted?.();
            const sourceStart = Math.max(sample.timestamp, range.in);
            const sourceEnd = Math.min(
              sample.timestamp + sample.duration,
              range.out,
            );
            const timestampSec = outputOffset + (sourceStart - range.in);
            const durationSec =
              sourceEnd > sourceStart ? sourceEnd - sourceStart : 1 / fps;
            const frame = sample.toVideoFrame();
            sample.close();
            await writer.addFrame(frame, timestampSec, durationSec);
            frameCount += 1;
            reportEncoded(timestampSec + durationSec);
          } finally {
            sample.close();
          }
        }

        if (audio.sink) {
          const startPacket =
            (await audio.sink.getPacket(range.in)) ??
            (await audio.sink.getFirstPacket());
          if (startPacket) {
            for await (const packet of audio.sink.packets(startPacket)) {
              signal?.throwIfAborted?.();
              if (packet.timestamp >= range.out) break;
              if (packet.timestamp < range.in) continue;
              await writer.addAudioPacket(
                packet.clone({
                  timestamp: outputOffset + (packet.timestamp - range.in),
                }),
              );
            }
          }
        }

        outputOffset += range.out - range.in;
      }

      signal?.throwIfAborted?.();
      onProgress?.({ phase: 'finalize', ratio: 1 });
      await writer.finalize();
    } catch (error) {
      await writer.cancel().catch(() => undefined);
      throw error;
    }

    const result: EncodeDirectResult = {
      audioIncluded: audio.config !== null,
      frameCount,
    };
    if (audio.dropReason !== undefined) {
      result.audioDropReason = audio.dropReason;
    }
    return result;
  } finally {
    input.dispose();
  }
}
