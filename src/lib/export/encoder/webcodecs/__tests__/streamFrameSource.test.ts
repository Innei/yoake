import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createStreamFrameSource } from '../streamFrameSource';

interface FakeFrame {
  close: ReturnType<typeof vi.fn>;
  sourceTimestamp: number;
}

interface FakeSample {
  close: ReturnType<typeof vi.fn>;
  closed: boolean;
  duration: number;
  frame: FakeFrame;
  timestamp: number;
  toVideoFrame: ReturnType<typeof vi.fn>;
}

interface SampleSpec {
  duration: number;
  timestamp: number;
}

const m = vi.hoisted(() => {
  const state = {
    disposes: [] as Array<ReturnType<typeof vi.fn>>,
    nextCalls: 0,
    nextInvocations: 0,
    returned: [] as boolean[],
    sampleCalls: [] as Array<{ end: number | undefined; start: number }>,
    samples: [] as SampleSpec[],
    videoTrack: null as unknown,
    yielded: [] as FakeSample[],
  };

  function makeSample(spec: SampleSpec): FakeSample {
    const frame: FakeFrame = {
      close: vi.fn(),
      sourceTimestamp: spec.timestamp,
    };
    const sample: FakeSample = {
      close: vi.fn(() => {
        sample.closed = true;
      }),
      closed: false,
      duration: spec.duration,
      frame,
      timestamp: spec.timestamp,
      toVideoFrame: vi.fn(() => frame),
    };
    return sample;
  }

  return { makeSample, state };
});

vi.mock('mediabunny', () => {
  class BlobSource {
    constructor(public blob: Blob) {}
  }

  class Input {
    dispose = vi.fn();
    constructor(public options: unknown) {
      m.state.disposes.push(this.dispose);
    }
    async getPrimaryVideoTrack() {
      return m.state.videoTrack;
    }
  }

  class VideoSampleSink {
    constructor(public track: unknown) {}
    samples(start = 0, end?: number) {
      m.state.sampleCalls.push({ end, start });
      const index = m.state.returned.push(false) - 1;
      const specs = m.state.samples.filter(
        (spec) =>
          spec.timestamp + spec.duration > start &&
          (end === undefined || spec.timestamp < end),
      );
      async function* gen() {
        try {
          for (const spec of specs) {
            m.state.nextCalls += 1;
            const sample = m.makeSample(spec);
            m.state.yielded.push(sample);
            yield sample;
          }
        } finally {
          m.state.returned[index] = true;
        }
      }
      const it = gen();
      const origNext = it.next.bind(it);
      it.next = (...args: Parameters<typeof origNext>) => {
        m.state.nextInvocations += 1;
        return origNext(...args);
      };
      return it;
    }
  }

  return { ALL_FORMATS: [], BlobSource, Input, VideoSampleSink };
});

function makeVideoTrack(width = 1920, height = 1080, rotation = 0) {
  return {
    getDisplayHeight: vi.fn(async () => height),
    getDisplayWidth: vi.fn(async () => width),
    getRotation: vi.fn(async () => rotation),
  };
}

function makeHandle(): FileSystemFileHandle {
  return {
    getFile: vi.fn(async () => ({}) as File),
  } as unknown as FileSystemFileHandle;
}

function gridSamples(count: number, step: number): SampleSpec[] {
  return Array.from({ length: count }, (_, i) => ({
    duration: step,
    timestamp: i * step,
  }));
}

beforeEach(() => {
  m.state.disposes = [];
  m.state.nextCalls = 0;
  m.state.nextInvocations = 0;
  m.state.returned = [];
  m.state.sampleCalls = [];
  m.state.samples = gridSamples(8, 0.5);
  m.state.videoTrack = makeVideoTrack();
  m.state.yielded = [];
});

describe('createStreamFrameSource', () => {
  it('throws when the source has no video track and disposes the input', async () => {
    m.state.videoTrack = null;
    await expect(createStreamFrameSource(makeHandle())).rejects.toThrow(
      /no video track/,
    );
    expect(m.state.disposes[0]).toHaveBeenCalledTimes(1);
  });

  it('throws for rotated sources and disposes the input', async () => {
    m.state.videoTrack = makeVideoTrack(1080, 1920, 90);
    await expect(createStreamFrameSource(makeHandle())).rejects.toThrow(
      /rotated source \(90deg\)/,
    );
    expect(m.state.disposes[0]).toHaveBeenCalledTimes(1);
  });

  it('reports track dimensions', async () => {
    const source = await createStreamFrameSource(makeHandle());
    expect(source.width).toBe(1920);
    expect(source.height).toBe(1080);
  });

  it('advances forward and closes passed samples and frames', async () => {
    const source = await createStreamFrameSource(makeHandle());

    const first = await source.getFrameAt(0.25);
    expect((first as unknown as FakeFrame).sourceTimestamp).toBe(0);

    const later = await source.getFrameAt(1.25);
    expect((later as unknown as FakeFrame).sourceTimestamp).toBe(1);

    const [s0, s1, s2] = m.state.yielded;
    expect(s0!.closed).toBe(true);
    expect(s0!.frame.close).toHaveBeenCalledTimes(1);
    expect(s1!.closed).toBe(true);
    expect(s2!.closed).toBe(false);
    expect(s2!.frame.close).not.toHaveBeenCalled();
    expect(m.state.sampleCalls).toHaveLength(1);
  });

  it('returns the cached frame for repeated requests in the same span without advancing', async () => {
    const source = await createStreamFrameSource(makeHandle());

    const a = await source.getFrameAt(0.25);
    const pullsAfterFirst = m.state.nextCalls;
    const b = await source.getFrameAt(0.25);
    const c = await source.getFrameAt(0.4);

    expect(b).toBe(a);
    expect(c).toBe(a);
    expect(m.state.nextCalls).toBe(pullsAfterFirst);
    expect(m.state.yielded[0]!.toVideoFrame).toHaveBeenCalledTimes(1);
    expect(m.state.sampleCalls).toHaveLength(1);
  });

  it('restarts the iterator for backward requests and closes the previous state', async () => {
    const source = await createStreamFrameSource(makeHandle());

    await source.getFrameAt(2.25);
    const forwardYielded = [...m.state.yielded];

    const back = await source.getFrameAt(0.75);
    expect((back as unknown as FakeFrame).sourceTimestamp).toBe(0.5);

    expect(m.state.sampleCalls).toHaveLength(2);
    expect(m.state.sampleCalls[1]!.start).toBe(0.75);
    expect(m.state.returned[0]).toBe(true);
    for (const sample of forwardYielded) {
      expect(sample.closed).toBe(true);
    }
    expect(forwardYielded.at(-1)!.frame.close).toHaveBeenCalledTimes(1);
  });

  it('restarts the iterator for far forward jumps instead of pulling through', async () => {
    const source = await createStreamFrameSource(makeHandle());

    await source.getFrameAt(0.25);
    const jumped = await source.getFrameAt(2.25);

    expect((jumped as unknown as FakeFrame).sourceTimestamp).toBe(2);
    expect(m.state.sampleCalls).toHaveLength(2);
    expect(m.state.sampleCalls[1]!.start).toBe(2.25);
    expect(m.state.returned[0]).toBe(true);
    expect(m.state.nextCalls).toBe(2);
    expect(m.state.yielded[0]!.closed).toBe(true);
    expect(m.state.yielded[0]!.frame.close).toHaveBeenCalledTimes(1);
  });

  it('pulls through for near forward jumps under the restart threshold', async () => {
    const source = await createStreamFrameSource(makeHandle());

    await source.getFrameAt(0.25);
    const near = await source.getFrameAt(1.25);

    expect((near as unknown as FakeFrame).sourceTimestamp).toBe(1);
    expect(m.state.sampleCalls).toHaveLength(1);
  });

  it('holds the previous frame across a gap and consumes the stash without re-pulling', async () => {
    m.state.samples = [
      { duration: 0.5, timestamp: 0 },
      { duration: 0.5, timestamp: 0.9 },
    ];
    const source = await createStreamFrameSource(makeHandle());

    const first = await source.getFrameAt(0.25);
    const inGap = await source.getFrameAt(0.7);
    expect(inGap).toBe(first);
    const pullsAfterGap = m.state.nextCalls;
    expect(pullsAfterGap).toBe(2);

    const after = await source.getFrameAt(1);
    expect((after as unknown as FakeFrame).sourceTimestamp).toBe(0.9);
    expect(m.state.nextCalls).toBe(pullsAfterGap);
    expect(m.state.yielded[0]!.closed).toBe(true);
    expect(m.state.sampleCalls).toHaveLength(1);
  });

  it('returns the final frame past the last sample without re-pulling a done iterator', async () => {
    const source = await createStreamFrameSource(makeHandle());

    const last = await source.getFrameAt(3.75);
    expect((last as unknown as FakeFrame).sourceTimestamp).toBe(3.5);
    const invocationsBefore = m.state.nextInvocations;

    const pastEnd = await source.getFrameAt(4.3);
    expect(pastEnd).toBe(last);
    expect(m.state.nextInvocations).toBe(invocationsBefore + 1);

    const again = await source.getFrameAt(4.4);
    expect(again).toBe(last);
    expect(m.state.nextInvocations).toBe(invocationsBefore + 1);
    expect(m.state.yielded.at(-1)!.toVideoFrame).toHaveBeenCalledTimes(1);
    expect(m.state.sampleCalls).toHaveLength(1);
  });

  it('clamps requests before the first sample to the first frame', async () => {
    m.state.samples = [
      { duration: 0.5, timestamp: 1 },
      { duration: 0.5, timestamp: 1.5 },
    ];
    const source = await createStreamFrameSource(makeHandle());

    const frame = await source.getFrameAt(0.2);
    expect((frame as unknown as FakeFrame).sourceTimestamp).toBe(1);
  });

  it('stays usable after a rejected getFrameAt', async () => {
    m.state.samples = [];
    const source = await createStreamFrameSource(makeHandle());

    await expect(source.getFrameAt(0.25)).rejects.toThrow(/no sample/);
    await expect(source.getFrameAt(0.25)).rejects.toThrow(/no sample/);
  });

  it('dispose closes the cached sample, frame, iterator, and input', async () => {
    const source = await createStreamFrameSource(makeHandle());
    await source.getFrameAt(1.25);
    const held = m.state.yielded.at(-1)!;

    await source.dispose();

    expect(held.closed).toBe(true);
    expect(held.frame.close).toHaveBeenCalledTimes(1);
    expect(m.state.returned[0]).toBe(true);
    expect(m.state.disposes[0]).toHaveBeenCalledTimes(1);
    await expect(source.getFrameAt(0)).rejects.toThrow(/disposed/);
  });
});
