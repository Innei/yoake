import { canEncodeVideo } from 'mediabunny';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { __resetCodecSupportForTests, probeCodecSupport } from '../codecSupport';

vi.mock('mediabunny', () => ({
  canEncodeVideo: vi.fn(),
}));

const canEncodeVideoMock = vi.mocked(canEncodeVideo);

beforeEach(() => {
  __resetCodecSupportForTests();
  canEncodeVideoMock.mockReset();
  canEncodeVideoMock.mockResolvedValue(true);
});

describe('probeCodecSupport', () => {
  it('probes avc and hevc at 4K once and caches the result', async () => {
    const first = await probeCodecSupport();
    const second = await probeCodecSupport();

    expect(first).toEqual({ avc: true, hevc: true });
    expect(second).toBe(first);
    expect(canEncodeVideoMock).toHaveBeenCalledTimes(2);
    expect(canEncodeVideoMock).toHaveBeenCalledWith('avc', {
      width: 3840,
      height: 2160,
    });
    expect(canEncodeVideoMock).toHaveBeenCalledWith('hevc', {
      width: 3840,
      height: 2160,
    });
  });

  it('reports hevc as unsupported when the probe fails', async () => {
    canEncodeVideoMock.mockImplementation(async (codec) => codec === 'avc');

    await expect(probeCodecSupport()).resolves.toEqual({
      avc: true,
      hevc: false,
    });
  });

  it('re-probes after the test reset', async () => {
    await probeCodecSupport();
    __resetCodecSupportForTests();
    await probeCodecSupport();

    expect(canEncodeVideoMock).toHaveBeenCalledTimes(4);
  });

  it('retries after a rejected probe instead of caching the failure', async () => {
    canEncodeVideoMock.mockRejectedValueOnce(new Error('probe crashed'));

    await expect(probeCodecSupport()).rejects.toThrow('probe crashed');
    await expect(probeCodecSupport()).resolves.toEqual({
      avc: true,
      hevc: true,
    });
    expect(canEncodeVideoMock).toHaveBeenCalledTimes(4);
  });
});
