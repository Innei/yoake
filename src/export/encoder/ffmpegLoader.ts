import type { FFmpeg } from '@ffmpeg/ffmpeg';

const DEFAULT_CORE_JS_URL = '/ffmpeg/ffmpeg-core.js';
const DEFAULT_CORE_WASM_URL = '/ffmpeg/ffmpeg-core.wasm';

let instance: FFmpeg | null = null;
let pending: Promise<FFmpeg> | null = null;

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
      opts.coreURL ?? DEFAULT_CORE_JS_URL,
      'text/javascript',
    );
    const wasmURL = await toBlobURL(
      opts.wasmURL ?? DEFAULT_CORE_WASM_URL,
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
