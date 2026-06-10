import { vi } from 'vitest';

import type { Segment } from '~/lib/fs/clipSidecar';

export interface FakeSample {
  close: ReturnType<typeof vi.fn>;
  closed: boolean;
  duration: number;
  timestamp: number;
  toVideoFrame: ReturnType<typeof vi.fn>;
}

export interface FakePacket {
  clone: (options?: { timestamp?: number }) => FakePacket;
  clonedFrom?: FakePacket;
  duration: number;
  timestamp: number;
}

export interface FakeWriter {
  addAudioPacket: ReturnType<typeof vi.fn>;
  addFrame: ReturnType<typeof vi.fn>;
  cancel: ReturnType<typeof vi.fn>;
  finalize: ReturnType<typeof vi.fn>;
}

interface SampleSpec {
  duration: number;
  timestamp: number;
}

export const h = {
  audioPackets: [] as SampleSpec[],
  audioTrack: null as unknown,
  disposes: [] as Array<ReturnType<typeof vi.fn>>,
  samples: [] as SampleSpec[],
  supportedAudioCodecs: ['aac', 'opus'] as string[],
  videoTrack: null as unknown,
  writers: [] as FakeWriter[],
  yieldedSamples: [] as FakeSample[],
};

export function resetHarness(): void {
  h.audioPackets = [];
  h.audioTrack = null;
  h.disposes = [];
  h.samples = gridSamples(8, 0.5);
  h.supportedAudioCodecs = ['aac', 'opus'];
  h.videoTrack = makeVideoTrack();
  h.writers = [];
  h.yieldedSamples = [];
}

export function mp4WriterMockModule() {
  return {
    createMp4Writer: vi.fn(async () => {
      const writer: FakeWriter = {
        addAudioPacket: vi.fn(async () => undefined),
        addFrame: vi.fn(async () => undefined),
        cancel: vi.fn(async () => undefined),
        finalize: vi.fn(async () => undefined),
      };
      h.writers.push(writer);
      return writer;
    }),
  };
}

export function mediabunnyMockModule() {
  class BlobSource {
    constructor(public blob: Blob) {}
  }

  class Input {
    dispose = vi.fn();
    constructor(public options: unknown) {
      h.disposes.push(this.dispose);
    }
    async getPrimaryVideoTrack() {
      return h.videoTrack;
    }
    async getPrimaryAudioTrack() {
      return h.audioTrack;
    }
  }

  class Mp4OutputFormat {
    getSupportedAudioCodecs() {
      return h.supportedAudioCodecs;
    }
  }

  class VideoSampleSink {
    constructor(public track: unknown) {}
    async *samples(start: number, end: number) {
      for (const spec of h.samples) {
        const intersects =
          spec.timestamp + spec.duration > start && spec.timestamp < end;
        if (!intersects) continue;
        const frame = { sourceTimestamp: spec.timestamp };
        const sample: FakeSample = {
          close: vi.fn(() => {
            sample.closed = true;
          }),
          closed: false,
          duration: spec.duration,
          timestamp: spec.timestamp,
          toVideoFrame: vi.fn(() => frame),
        };
        h.yieldedSamples.push(sample);
        yield sample;
      }
    }
  }

  function makePacket(spec: SampleSpec): FakePacket {
    const packet: FakePacket = {
      clone: (options?: { timestamp?: number }) => ({
        ...packet,
        clonedFrom: packet,
        timestamp: options?.timestamp ?? packet.timestamp,
      }),
      duration: spec.duration,
      timestamp: spec.timestamp,
    };
    return packet;
  }

  class EncodedPacketSink {
    packetList: FakePacket[];
    constructor(public track: unknown) {
      this.packetList = h.audioPackets.map((spec) => makePacket(spec));
    }
    async getFirstPacket() {
      return this.packetList[0] ?? null;
    }
    async getPacket(timestamp: number) {
      let found: FakePacket | null = null;
      for (const packet of this.packetList) {
        if (packet.timestamp <= timestamp) found = packet;
      }
      return found;
    }
    async *packets(startPacket?: FakePacket) {
      const startIndex = startPacket
        ? this.packetList.indexOf(startPacket)
        : 0;
      for (const packet of this.packetList.slice(Math.max(0, startIndex))) {
        yield packet;
      }
    }
  }

  return {
    ALL_FORMATS: [],
    BlobSource,
    EncodedPacketSink,
    Input,
    Mp4OutputFormat,
    VideoSampleSink,
  };
}

export function makeSegment(id: string, inSec: number, outSec: number): Segment {
  return { id, in: inSec, out: outSec, playMode: 'normal', speed: 1 };
}

export function makeHandle(): FileSystemFileHandle {
  return {
    getFile: vi.fn(async () => ({}) as File),
  } as unknown as FileSystemFileHandle;
}

export function makeWritable(): FileSystemWritableFileStream {
  return {
    abort: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
    write: vi.fn(async () => undefined),
  } as unknown as FileSystemWritableFileStream;
}

export function makeVideoTrack() {
  return {
    computeDuration: vi.fn(async () => 4),
    computePacketStats: vi.fn(async () => ({
      averageBitrate: 0,
      averagePacketRate: 2,
      packetCount: 8,
    })),
    getDisplayHeight: vi.fn(async () => 1080),
    getDisplayWidth: vi.fn(async () => 1920),
  };
}

export function makeAudioTrack(codec: string | null = 'aac') {
  return {
    getCodec: vi.fn(async () => codec),
    getDecoderConfig: vi.fn(
      async (): Promise<{ codec: string } | null> => ({ codec: 'mp4a.40.2' }),
    ),
  };
}

export function gridSamples(count: number, step: number): SampleSpec[] {
  return Array.from({ length: count }, (_, i) => ({
    duration: step,
    timestamp: i * step,
  }));
}

export function baseOpts() {
  return {
    codec: 'avc' as const,
    segments: [] as Segment[],
    sourceHandle: makeHandle(),
    writable: makeWritable(),
  };
}

export function writer(): FakeWriter {
  return h.writers[0]!;
}

export function frameTimestamps(): number[] {
  return writer().addFrame.mock.calls.map((c) => c[1] as number);
}
