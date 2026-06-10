import { createFile, type Movie, MP4BoxBuffer } from 'mp4box';

export interface Mp4ProbeResult {
  durationSec: number;
  fps: number;
  height: number;
  totalFrames: number;
  width: number;
}

const CHUNK_BYTES = 4 * 1024 * 1024;

export async function probeMp4(file: File): Promise<Mp4ProbeResult> {
  return new Promise((resolve, reject) => {
    const mp4 = createFile();
    let resolved = false;
    let nextOffset = 0;

    const finishOk = (value: Mp4ProbeResult) => {
      if (resolved) return;
      resolved = true;
      resolve(value);
    };
    const finishErr = (cause: unknown) => {
      if (resolved) return;
      resolved = true;
      reject(
        cause instanceof Error
          ? cause
          : new Error(typeof cause === 'string' ? cause : 'mp4 probe failed'),
      );
    };

    mp4.onError = (_module: string, message: string) => {
      finishErr(message);
    };

    mp4.onReady = (info: Movie) => {
      try {
        const track = info.videoTracks[0];
        if (!track || !track.video) {
          finishErr(new Error('No video track in MP4'));
          return;
        }
        const timescale =
          track.timescale > 0 ? track.timescale : info.timescale;
        const durationTicks =
          track.duration > 0 ? track.duration : info.duration;
        const durationSec = timescale > 0 ? durationTicks / timescale : 0;
        const totalFrames = track.nb_samples ?? 0;
        const fps = durationSec > 0 ? totalFrames / durationSec : 0;
        finishOk({
          durationSec,
          fps,
          height: track.video.height,
          totalFrames,
          width: track.video.width,
        });
      } catch (err) {
        finishErr(err);
      }
    };

    const pumpNext = async () => {
      if (resolved) return;
      try {
        if (nextOffset >= file.size) {
          mp4.flush();
          if (!resolved) {
            finishErr(new Error('mp4 probe: reached EOF without onReady'));
          }
          return;
        }
        const end = Math.min(file.size, nextOffset + CHUNK_BYTES);
        const slice = file.slice(nextOffset, end);
        const raw = await slice.arrayBuffer();
        const buf = MP4BoxBuffer.fromArrayBuffer(raw, nextOffset);
        const next = mp4.appendBuffer(buf);
        nextOffset =
          typeof next === 'number' && Number.isFinite(next) && next > nextOffset
            ? Math.max(next, end)
            : end;
        if (!resolved) {
          queueMicrotask(() => {
            void pumpNext();
          });
        }
      } catch (err) {
        finishErr(err);
      }
    };

    void pumpNext();
  });
}
