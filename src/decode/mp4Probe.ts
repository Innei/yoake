import MP4Box, { type MP4ABuffer, type MP4Info } from 'mp4box';

export interface Mp4ProbeResult {
  durationSec: number;
  fps: number;
  height: number;
  totalFrames: number;
  width: number;
}

const CHUNK_BYTES = 4 * 1024 * 1024;

function isVideoTrack(t: MP4Info['tracks'][number]): boolean {
  return t.video !== undefined && t.video !== null;
}

export async function probeMp4(file: File): Promise<Mp4ProbeResult> {
  return new Promise((resolve, reject) => {
    const mp4 = MP4Box.createFile();
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

    mp4.onError = (e) => {
      finishErr(typeof e === 'string' ? e : 'mp4box parse error');
    };

    mp4.onReady = (info: MP4Info) => {
      try {
        const videoTrack = info.tracks.find(isVideoTrack);
        if (!videoTrack || !videoTrack.video) {
          finishErr(new Error('No video track in MP4'));
          return;
        }
        const timescale = videoTrack.timescale > 0 ? videoTrack.timescale : info.timescale;
        const durationTicks = videoTrack.duration > 0 ? videoTrack.duration : info.duration;
        const durationSec = timescale > 0 ? durationTicks / timescale : 0;
        const totalFrames = videoTrack.nb_samples ?? 0;
        const fps = durationSec > 0 ? totalFrames / durationSec : 0;
        finishOk({
          durationSec,
          fps,
          height: videoTrack.video.height,
          totalFrames,
          width: videoTrack.video.width,
        });
      } catch (err) {
        finishErr(err);
      }
    };

    const pumpNext = async () => {
      if (resolved) return;
      try {
        const end = Math.min(file.size, nextOffset + CHUNK_BYTES);
        if (nextOffset >= file.size) {
          mp4.flush();
          if (!resolved) finishErr(new Error('mp4 probe: reached EOF without onReady'));
          return;
        }
        const slice = file.slice(nextOffset, end);
        const ab = (await slice.arrayBuffer()) as MP4ABuffer;
        ab.fileStart = nextOffset;
        nextOffset = mp4.appendBuffer(ab);
        if (typeof nextOffset !== 'number' || !Number.isFinite(nextOffset)) {
          nextOffset = end;
        }
        if (nextOffset < end) nextOffset = end;
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
