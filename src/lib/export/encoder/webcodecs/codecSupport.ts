import { canEncodeVideo } from 'mediabunny';

export interface CodecSupport {
  avc: boolean;
  hevc: boolean;
}

const PROBE_WIDTH = 3840;
const PROBE_HEIGHT = 2160;

let pending: Promise<CodecSupport> | null = null;

export function probeCodecSupport(): Promise<CodecSupport> {
  if (!pending) {
    const probe = Promise.all([
      canEncodeVideo('avc', { width: PROBE_WIDTH, height: PROBE_HEIGHT }),
      canEncodeVideo('hevc', { width: PROBE_WIDTH, height: PROBE_HEIGHT }),
    ]).then(([avc, hevc]) => ({ avc, hevc }));
    pending = probe;
    probe.catch(() => {
      if (pending === probe) pending = null;
    });
  }
  return pending;
}

export function __resetCodecSupportForTests(): void {
  pending = null;
}
