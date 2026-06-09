import type { FFmpeg } from '@ffmpeg/ffmpeg';

let instance: FFmpeg | null = null;
let pending: Promise<FFmpeg> | null = null;

const CORE_VERSION = '0.12.10';
const CORE_BASE = `https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/umd`;

export interface FfmpegLoadOptions {
  coreURL?: string;
  log?: (line: string) => void;
  wasmURL?: string;
}

export async function getFfmpeg(opts: FfmpegLoadOptions = {}): Promise<FFmpeg> {
  if (instance && instance.loaded) return instance;
  if (pending) return pending;

  pending = (async () => {
    const [{ FFmpeg }, { toBlobURL }] = await Promise.all([
      import('@ffmpeg/ffmpeg'),
      import('@ffmpeg/util'),
    ]);
    const ff = new FFmpeg();
    if (opts.log) {
      ff.on('log', ({ message }) => opts.log!(message));
    }
    const coreURL = await toBlobURL(
      opts.coreURL ?? `${CORE_BASE}/ffmpeg-core.js`,
      'text/javascript',
    );
    const wasmURL = await toBlobURL(
      opts.wasmURL ?? `${CORE_BASE}/ffmpeg-core.wasm`,
      'application/wasm',
    );
    await ff.load({ coreURL, wasmURL });
    instance = ff;
    return ff;
  })();

  try {
    return await pending;
  } finally {
    pending = null;
  }
}

export function __resetFfmpegLoaderForTests(): void {
  instance = null;
  pending = null;
}
