export interface VideoFrameInfo {
  metadata: VideoFrameCallbackMetadata;
  now: DOMHighResTimeStamp;
}

export type VideoFrameListener = (info: VideoFrameInfo) => void;

export class VideoFrameSource {
  private video: HTMLVideoElement | null = null;
  private rvfcHandle: number | null = null;
  private listeners = new Set<VideoFrameListener>();

  attach(video: HTMLVideoElement): void {
    if (this.video === video) return;
    if (this.video) this.detach();
    this.video = video;
    this.schedule();
  }

  detach(): void {
    if (this.video && this.rvfcHandle !== null) {
      this.video.cancelVideoFrameCallback(this.rvfcHandle);
    }
    this.rvfcHandle = null;
    this.video = null;
  }

  onFrame(cb: VideoFrameListener): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  stepBy(deltaFrames: number, fps: number): void {
    if (!this.video || fps <= 0) return;
    this.video.currentTime += deltaFrames / fps;
  }

  private schedule(): void {
    const video = this.video;
    if (!video) return;
    this.rvfcHandle = video.requestVideoFrameCallback((now, metadata) => {
      if (this.video !== video) return;
      for (const listener of this.listeners) {
        listener({ metadata, now });
      }
      this.schedule();
    });
  }
}
