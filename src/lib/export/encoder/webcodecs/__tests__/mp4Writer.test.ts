import type { EncodedPacket, StreamTargetChunk } from 'mediabunny';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createMp4Writer } from '../mp4Writer';

const h = vi.hoisted(() => ({
  audioSources: [] as Array<{
    add: ReturnType<typeof vi.fn>;
    codec: string;
  }>,
  qualities: {
    high: Symbol('QUALITY_HIGH'),
    low: Symbol('QUALITY_LOW'),
    medium: Symbol('QUALITY_MEDIUM'),
    veryHigh: Symbol('QUALITY_VERY_HIGH'),
  },
  outputs: [] as Array<{
    addAudioTrack: ReturnType<typeof vi.fn>;
    addVideoTrack: ReturnType<typeof vi.fn>;
    cancel: ReturnType<typeof vi.fn>;
    finalize: ReturnType<typeof vi.fn>;
    options: {
      format: unknown;
      target: { writable: WritableStream<StreamTargetChunk> };
    };
    start: ReturnType<typeof vi.fn>;
  }>,
  samples: [] as Array<{
    close: ReturnType<typeof vi.fn>;
    data: unknown;
    init: { duration: number; timestamp: number };
  }>,
  startError: null as Error | null,
  videoSources: [] as Array<{
    add: ReturnType<typeof vi.fn>;
    config: { bitrate: unknown; codec: string };
  }>,
}));

vi.mock('mediabunny', () => {
  class Mp4OutputFormat {
    constructor(public options: unknown) {}
  }

  class StreamTarget {
    constructor(public writable: WritableStream<StreamTargetChunk>) {}
  }

  class Output {
    addAudioTrack = vi.fn();
    addVideoTrack = vi.fn();
    cancel = vi.fn(async () => {
      await this.options.target.writable.close();
    });
    finalize = vi.fn(async () => {
      await this.options.target.writable.close();
    });
    start = vi.fn(async () => {
      if (h.startError) throw h.startError;
    });
    constructor(
      public options: {
        format: unknown;
        target: { writable: WritableStream<StreamTargetChunk> };
      },
    ) {
      h.outputs.push(this);
    }
  }

  class VideoSampleSource {
    add = vi.fn(async () => undefined);
    constructor(public config: { bitrate: unknown; codec: string }) {
      h.videoSources.push(this);
    }
  }

  class EncodedAudioPacketSource {
    add = vi.fn(async () => undefined);
    constructor(public codec: string) {
      h.audioSources.push(this);
    }
  }

  class VideoSample {
    close = vi.fn();
    constructor(
      public data: unknown,
      public init: { duration: number; timestamp: number },
    ) {
      h.samples.push(this);
    }
  }

  return {
    EncodedAudioPacketSource,
    Mp4OutputFormat,
    Output,
    QUALITY_HIGH: h.qualities.high,
    QUALITY_LOW: h.qualities.low,
    QUALITY_MEDIUM: h.qualities.medium,
    QUALITY_VERY_HIGH: h.qualities.veryHigh,
    StreamTarget,
    VideoSample,
    VideoSampleSource,
  };
});

function makeWritable() {
  return {
    abort: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
    write: vi.fn(async () => undefined),
  } as unknown as FileSystemWritableFileStream;
}

function baseOpts(writable = makeWritable()) {
  return {
    codec: 'avc' as const,
    fps: 30,
    height: 1080,
    width: 1920,
    writable,
  };
}

const decoderConfig = { codec: 'mp4a.40.2' } as AudioDecoderConfig;
const fakeFrame = {} as VideoFrame;
const fakePacket = {} as EncodedPacket;

beforeEach(() => {
  h.audioSources.length = 0;
  h.outputs.length = 0;
  h.samples.length = 0;
  h.startError = null;
  h.videoSources.length = 0;
});

describe('createMp4Writer', () => {
  it('builds mp4 output over a relay stream and starts after adding tracks', async () => {
    const writable = makeWritable();
    await createMp4Writer(baseOpts(writable));

    expect(h.outputs).toHaveLength(1);
    const output = h.outputs[0]!;
    expect(output.options.format).toMatchObject({
      options: { fastStart: false },
    });
    expect(output.options.target.writable).toBeInstanceOf(WritableStream);
    expect(output.options.target.writable).not.toBe(writable);

    expect(h.videoSources).toHaveLength(1);
    expect(h.videoSources[0]!.config.codec).toBe('avc');
    expect(h.videoSources[0]!.config.bitrate).toBe(h.qualities.high);
    expect(output.addVideoTrack).toHaveBeenCalledWith(h.videoSources[0], {
      frameRate: 30,
    });
    expect(output.addVideoTrack.mock.invocationCallOrder[0]!).toBeLessThan(
      output.start.mock.invocationCallOrder[0]!,
    );
    expect(output.start).toHaveBeenCalledTimes(1);
    expect(output.addAudioTrack).not.toHaveBeenCalled();
  });

  it('maps each quality option to the matching mediabunny preset', async () => {
    const cases = [
      ['low', h.qualities.low],
      ['medium', h.qualities.medium],
      ['high', h.qualities.high],
      ['very-high', h.qualities.veryHigh],
    ] as const;

    for (const [quality, preset] of cases) {
      h.videoSources.length = 0;
      await createMp4Writer({ ...baseOpts(), quality });
      expect(h.videoSources[0]!.config.bitrate).toBe(preset);
    }
  });

  it('forwards positioned chunks from the relay to the file writable', async () => {
    const writable = makeWritable();
    await createMp4Writer(baseOpts(writable));

    const relayWriter = h.outputs[0]!.options.target.writable.getWriter();
    const data = new Uint8Array([1, 2, 3]);
    await relayWriter.write({ type: 'write', data, position: 42 });

    expect(writable.write).toHaveBeenCalledWith({
      type: 'write',
      data,
      position: 42,
    });
  });

  it('aborts the file writable when start fails', async () => {
    const writable = makeWritable();
    h.startError = new Error('start failed');

    await expect(createMp4Writer(baseOpts(writable))).rejects.toThrow(
      'start failed',
    );
    expect(writable.abort).toHaveBeenCalledTimes(1);
    expect(writable.close).not.toHaveBeenCalled();
  });

  it('wraps frames in timed samples, awaits encoder backpressure, closes them', async () => {
    const writer = await createMp4Writer(baseOpts());
    const source = h.videoSources[0]!;

    let release: () => void = () => undefined;
    source.add.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );

    let settled = false;
    const pending = writer
      .addFrame(fakeFrame, 0.5, 1 / 30)
      .then(() => {
        settled = true;
      });
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(h.samples[0]!.close).not.toHaveBeenCalled();

    release();
    await pending;

    expect(h.samples).toHaveLength(1);
    expect(h.samples[0]!.data).toBe(fakeFrame);
    expect(h.samples[0]!.init).toEqual({ duration: 1 / 30, timestamp: 0.5 });
    expect(source.add).toHaveBeenCalledWith(h.samples[0]);
    expect(h.samples[0]!.close).toHaveBeenCalledTimes(1);
  });

  it('closes the sample even when the encoder rejects', async () => {
    const writer = await createMp4Writer(baseOpts());
    h.videoSources[0]!.add.mockRejectedValueOnce(new Error('encode failed'));

    await expect(writer.addFrame(fakeFrame, 0, 1 / 30)).rejects.toThrow(
      'encode failed',
    );
    expect(h.samples[0]!.close).toHaveBeenCalledTimes(1);
  });

  it('finalize commits the file through the relay close path', async () => {
    const writable = makeWritable();
    const writer = await createMp4Writer(baseOpts(writable));

    await writer.finalize();

    expect(h.outputs[0]!.finalize).toHaveBeenCalledTimes(1);
    expect(writable.close).toHaveBeenCalledTimes(1);
    expect(writable.abort).not.toHaveBeenCalled();
  });

  it('cancel discards: aborts the file writable, never commits', async () => {
    const writable = makeWritable();
    const writer = await createMp4Writer(baseOpts(writable));

    await writer.cancel();

    expect(h.outputs[0]!.cancel).toHaveBeenCalledTimes(1);
    expect(writable.abort).toHaveBeenCalledTimes(1);
    expect(writable.close).not.toHaveBeenCalled();
  });

  it('cancel after finalize is a no-op', async () => {
    const writable = makeWritable();
    const writer = await createMp4Writer(baseOpts(writable));

    await writer.finalize();
    await writer.cancel();

    expect(h.outputs[0]!.cancel).not.toHaveBeenCalled();
    expect(writable.abort).not.toHaveBeenCalled();
  });

  it('repeated cancel only aborts once', async () => {
    const writable = makeWritable();
    const writer = await createMp4Writer(baseOpts(writable));

    await writer.cancel();
    await writer.cancel();

    expect(h.outputs[0]!.cancel).toHaveBeenCalledTimes(1);
    expect(writable.abort).toHaveBeenCalledTimes(1);
  });

  it('still aborts the file writable when output.cancel rejects', async () => {
    const writable = makeWritable();
    const writer = await createMp4Writer(baseOpts(writable));
    h.outputs[0]!.cancel.mockRejectedValueOnce(new Error('cancel failed'));

    await expect(writer.cancel()).rejects.toThrow('cancel failed');
    expect(writable.abort).toHaveBeenCalledTimes(1);
    expect(writable.close).not.toHaveBeenCalled();
  });

  it('declares the audio track before start and sends decoderConfig once', async () => {
    const writer = await createMp4Writer({
      ...baseOpts(),
      audio: { codec: 'aac', decoderConfig },
    });

    const output = h.outputs[0]!;
    expect(h.audioSources).toHaveLength(1);
    expect(h.audioSources[0]!.codec).toBe('aac');
    expect(output.addAudioTrack).toHaveBeenCalledWith(h.audioSources[0]);
    expect(output.addAudioTrack.mock.invocationCallOrder[0]!).toBeLessThan(
      output.start.mock.invocationCallOrder[0]!,
    );

    await writer.addAudioPacket(fakePacket);
    await writer.addAudioPacket(fakePacket);

    const { add } = h.audioSources[0]!;
    expect(add).toHaveBeenNthCalledWith(1, fakePacket, { decoderConfig });
    expect(add).toHaveBeenNthCalledWith(2, fakePacket, undefined);
  });

  it('resends decoderConfig when the first audio add rejects', async () => {
    const writer = await createMp4Writer({
      ...baseOpts(),
      audio: { codec: 'aac', decoderConfig },
    });
    const { add } = h.audioSources[0]!;
    add.mockRejectedValueOnce(new Error('mux failed'));

    await expect(writer.addAudioPacket(fakePacket)).rejects.toThrow(
      'mux failed',
    );
    await writer.addAudioPacket(fakePacket);

    expect(add).toHaveBeenNthCalledWith(1, fakePacket, { decoderConfig });
    expect(add).toHaveBeenNthCalledWith(2, fakePacket, { decoderConfig });
  });

  it('rejects audio packets when no audio track was configured', async () => {
    const writer = await createMp4Writer(baseOpts());
    await expect(writer.addAudioPacket(fakePacket)).rejects.toThrow(
      /no audio track/,
    );
  });
});
