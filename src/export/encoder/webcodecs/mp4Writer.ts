import type { AudioCodec, EncodedPacket, StreamTargetChunk } from 'mediabunny';
import {
  EncodedAudioPacketSource,
  Mp4OutputFormat,
  Output,
  QUALITY_HIGH,
  QUALITY_LOW,
  QUALITY_MEDIUM,
  QUALITY_VERY_HIGH,
  StreamTarget,
  VideoSample,
  VideoSampleSource,
} from 'mediabunny';

export type Mp4WriterQuality = 'low' | 'medium' | 'high' | 'very-high';

const QUALITY_PRESETS: Record<Mp4WriterQuality, typeof QUALITY_HIGH> = {
  'low': QUALITY_LOW,
  'medium': QUALITY_MEDIUM,
  'high': QUALITY_HIGH,
  'very-high': QUALITY_VERY_HIGH,
};

export interface Mp4WriterAudioConfig {
  codec: AudioCodec;
  decoderConfig: AudioDecoderConfig;
}

export interface CreateMp4WriterOptions {
  audio?: Mp4WriterAudioConfig;
  codec: 'avc' | 'hevc';
  fps: number;
  height: number;
  quality?: Mp4WriterQuality;
  width: number;
  writable: FileSystemWritableFileStream;
}

export interface Mp4Writer {
  addAudioPacket: (packet: EncodedPacket) => Promise<void>;
  addFrame: (
    frame: VideoFrame,
    timestampSec: number,
    durationSec: number,
  ) => Promise<void>;
  cancel: () => Promise<void>;
  finalize: () => Promise<void>;
}

export async function createMp4Writer(
  opts: CreateMp4WriterOptions,
): Promise<Mp4Writer> {
  let discard = false;
  let writableSettled = false;

  const settleWritable = async (mode: 'abort' | 'close') => {
    if (writableSettled) return;
    writableSettled = true;
    if (mode === 'abort') {
      await opts.writable.abort();
    } else {
      await opts.writable.close();
    }
  };

  const relay = new WritableStream<StreamTargetChunk>({
    write: (chunk) =>
      opts.writable.write({
        type: 'write',
        data: chunk.data,
        position: chunk.position,
      }),
    close: () => settleWritable(discard ? 'abort' : 'close'),
    abort: () => settleWritable('abort'),
  });

  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: false }),
    target: new StreamTarget(relay),
  });

  const videoSource = new VideoSampleSource({
    bitrate: QUALITY_PRESETS[opts.quality ?? 'high'],
    codec: opts.codec,
  });
  output.addVideoTrack(videoSource, { frameRate: opts.fps });

  let audioSource: EncodedAudioPacketSource | null = null;
  if (opts.audio) {
    audioSource = new EncodedAudioPacketSource(opts.audio.codec);
    output.addAudioTrack(audioSource);
  }

  try {
    await output.start();
  } catch (error) {
    discard = true;
    await settleWritable('abort').catch(() => undefined);
    throw error;
  }

  let audioMetaSent = false;
  let canceled = false;
  let finalized = false;

  return {
    async addFrame(frame, timestampSec, durationSec) {
      const sample = new VideoSample(frame, {
        duration: durationSec,
        timestamp: timestampSec,
      });
      try {
        await videoSource.add(sample);
      } finally {
        sample.close();
      }
    },
    async addAudioPacket(packet) {
      if (!audioSource || !opts.audio) {
        throw new Error('mp4Writer has no audio track configured');
      }
      const meta = audioMetaSent
        ? undefined
        : { decoderConfig: opts.audio.decoderConfig };
      await audioSource.add(packet, meta);
      audioMetaSent = true;
    },
    async finalize() {
      await output.finalize();
      finalized = true;
    },
    async cancel() {
      if (finalized || canceled) return;
      canceled = true;
      discard = true;
      try {
        await output.cancel();
      } finally {
        await settleWritable('abort');
      }
    },
  };
}
