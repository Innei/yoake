import type { VideoSample } from 'mediabunny';
import { ALL_FORMATS, BlobSource, Input, VideoSampleSink } from 'mediabunny';

export interface StreamFrameSource {
  dispose: () => Promise<void>;
  getFrameAt: (sourceTime: number) => Promise<VideoFrame>;
  height: number;
  width: number;
}

const FORWARD_RESTART_SEC = 1;

export async function createStreamFrameSource(
  handle: FileSystemFileHandle,
): Promise<StreamFrameSource> {
  const file = await handle.getFile();
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(file) });

  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) {
      throw new Error('createStreamFrameSource: source has no video track');
    }
    const [width, height, rotation] = await Promise.all([
      track.getDisplayWidth(),
      track.getDisplayHeight(),
      track.getRotation(),
    ]);
    if (!(width > 0 && height > 0)) {
      throw new Error(
        `createStreamFrameSource: invalid source size ${width}x${height}`,
      );
    }
    if (rotation % 360 !== 0) {
      throw new Error(
        `createStreamFrameSource: rotated source (${rotation}deg) unsupported`,
      );
    }

    const sink = new VideoSampleSink(track);

    let iterator: AsyncGenerator<VideoSample, void, unknown> | null = null;
    let current: VideoSample | null = null;
    let currentFrame: VideoFrame | null = null;
    let stashed: VideoSample | null = null;
    let ended = false;
    let inFlight = false;
    let disposed = false;

    const closeCurrent = () => {
      currentFrame?.close();
      currentFrame = null;
      current?.close();
      current = null;
    };

    const teardownIterator = async () => {
      const it = iterator;
      iterator = null;
      ended = false;
      stashed?.close();
      stashed = null;
      closeCurrent();
      await it?.return(undefined).catch(() => undefined);
    };

    const covers = (sourceTime: number): boolean =>
      current !== null &&
      sourceTime >= current.timestamp &&
      sourceTime < current.timestamp + current.duration;

    const getFrameAtInner = async (sourceTime: number): Promise<VideoFrame> => {
      if (current) {
        const currentEnd = current.timestamp + current.duration;
        const farForward =
          !ended && sourceTime >= currentEnd + FORWARD_RESTART_SEC;
        if (sourceTime < current.timestamp || farForward) {
          await teardownIterator();
        }
      }
      iterator ??= sink.samples(sourceTime);

      while (!covers(sourceTime)) {
        let candidate: VideoSample | null = null;
        if (stashed) {
          candidate = stashed;
          stashed = null;
        } else if (!ended) {
          const next = await iterator.next();
          if (next.done === true) {
            ended = true;
          } else {
            candidate = next.value;
          }
        }
        if (!candidate) break;
        if (current && candidate.timestamp > sourceTime) {
          stashed = candidate;
          break;
        }
        closeCurrent();
        current = candidate;
      }

      if (!current) {
        throw new Error(
          `createStreamFrameSource: no sample at ${sourceTime.toFixed(3)}s`,
        );
      }
      currentFrame ??= current.toVideoFrame();
      return currentFrame;
    };

    const getFrameAt = async (sourceTime: number): Promise<VideoFrame> => {
      if (disposed) {
        throw new Error('createStreamFrameSource: source disposed');
      }
      if (inFlight) {
        throw new Error('createStreamFrameSource: concurrent getFrameAt');
      }
      inFlight = true;
      try {
        return await getFrameAtInner(sourceTime);
      } finally {
        inFlight = false;
      }
    };

    const dispose = async (): Promise<void> => {
      if (disposed) return;
      disposed = true;
      await teardownIterator();
      input.dispose();
    };

    return { width, height, getFrameAt, dispose };
  } catch (cause) {
    input.dispose();
    throw cause;
  }
}
