import { beforeEach, describe, expect, it, vi } from 'vitest';

import { encodeDirect } from '../encodeDirect';
import { createMp4Writer } from '../mp4Writer';
import type { FakePacket } from './encodeDirectHarness';
import {
  baseOpts,
  gridSamples,
  h,
  makeAudioTrack,
  makeSegment,
  resetHarness,
  writer,
} from './encodeDirectHarness';

vi.mock('mediabunny', async () =>
  (await import('./encodeDirectHarness')).mediabunnyMockModule(),
);
vi.mock('../mp4Writer', async () =>
  (await import('./encodeDirectHarness')).mp4WriterMockModule(),
);

function addedPackets(): FakePacket[] {
  return writer().addAudioPacket.mock.calls.map((c) => c[0] as FakePacket);
}

beforeEach(() => {
  resetHarness();
  vi.mocked(createMp4Writer).mockClear();
});

describe('encodeDirect audio passthrough', () => {
  it('passes audio packets shifted in lockstep and gated to segment ranges', async () => {
    h.audioTrack = makeAudioTrack();
    h.audioPackets = gridSamples(8, 0.5);

    const result = await encodeDirect({
      ...baseOpts(),
      segments: [makeSegment('b', 3, 4), makeSegment('a', 0, 1)],
    });

    expect(createMp4Writer).toHaveBeenCalledWith(
      expect.objectContaining({
        audio: { codec: 'aac', decoderConfig: { codec: 'mp4a.40.2' } },
      }),
    );

    const packets = addedPackets();
    expect(packets.map((p) => p.timestamp)).toEqual([0, 0.5, 1, 1.5]);
    expect(packets.map((p) => p.clonedFrom?.timestamp)).toEqual([
      0, 0.5, 3, 3.5,
    ]);
    expect(result.audioIncluded).toBe(true);
    expect(result.audioDropReason).toBeUndefined();
  });

  it('skips a packet straddling the segment start and cuts at the segment end', async () => {
    h.audioTrack = makeAudioTrack();
    h.audioPackets = gridSamples(8, 0.5);

    await encodeDirect({
      ...baseOpts(),
      segments: [makeSegment('a', 0.75, 1.75)],
    });

    const packets = addedPackets();
    expect(packets.map((p) => p.clonedFrom?.timestamp)).toEqual([1, 1.5]);
    expect(packets.map((p) => p.timestamp)).toEqual([0.25, 0.75]);
  });

  it('drops audio with a reason when the codec cannot be muxed into mp4', async () => {
    h.audioTrack = makeAudioTrack('flac');
    h.audioPackets = gridSamples(8, 0.5);

    const result = await encodeDirect(baseOpts());

    expect(result.audioIncluded).toBe(false);
    expect(result.audioDropReason).toMatch(/flac/);
    expect(result.frameCount).toBe(8);
    const writerOpts = vi.mocked(createMp4Writer).mock.calls[0]![0];
    expect(writerOpts).not.toHaveProperty('audio');
    expect(writer().addAudioPacket).not.toHaveBeenCalled();
    expect(writer().finalize).toHaveBeenCalledTimes(1);
  });

  it('drops audio with a reason when no decoder config is available', async () => {
    const track = makeAudioTrack();
    track.getDecoderConfig.mockResolvedValue(null);
    h.audioTrack = track;

    const result = await encodeDirect(baseOpts());

    expect(result.audioIncluded).toBe(false);
    expect(result.audioDropReason).toMatch(/decoder config/);
    expect(writer().addAudioPacket).not.toHaveBeenCalled();
  });

  it('skips audio without a drop reason when the source has no audio track', async () => {
    const result = await encodeDirect(baseOpts());

    expect(result.audioIncluded).toBe(false);
    expect(result.audioDropReason).toBeUndefined();
    const writerOpts = vi.mocked(createMp4Writer).mock.calls[0]![0];
    expect(writerOpts).not.toHaveProperty('audio');
    expect(writer().addAudioPacket).not.toHaveBeenCalled();
  });
});
