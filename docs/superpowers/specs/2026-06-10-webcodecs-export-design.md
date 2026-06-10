# WebCodecs Video Export (replace ffmpeg.wasm)

Date: 2026-06-10
Status: approved

## Goal

Replace the entire ffmpeg.wasm export pipeline with WebCodecs hardware encoding,
muxed by [mediabunny](https://mediabunny.dev). Outcomes:

- Hardware-accelerated encode (VideoToolbox/NVENC/etc.) — one to two orders of
  magnitude faster than single-threaded wasm x264.
- Remove `@ffmpeg/core`, `@ffmpeg/ffmpeg`, `@ffmpeg/util` and the 30.7 MB
  `public/ffmpeg/` assets entirely.
- User-selectable codec: H.264 (default) or HEVC when hardware encode is
  available.
- Direct (no-grade) exports keep the source audio track via passthrough.

## Non-goals

- HDR video export. Chrome's WebCodecs only supports HEVC Main (8-bit) and
  `VideoColorSpace` lacks PQ/BT.2020 (w3c/webcodecs#384 still open). SDR only.
- Audio on the per-frame graded path (speed ramps would require audio
  resampling). Graded exports stay silent, as today.
- ProRes output (stays disabled in the UI).
- Legacy browser support. The app already requires WebGPU + File System Access;
  WebCodecs HEVC encode needs Chrome ≥ 130.

## Architecture

```
src/export/encoder/
  webcodecs/
    mp4Writer.ts        # wraps mediabunny Output: VideoFrame stream (+ optional audio) -> mp4
    encodeGraded.ts     # per-frame graded path (replaces encodeSegments.ts)
    encodeDirect.ts     # direct path (replaces ffmpeg encodeDirect.ts)
    codecSupport.ts     # HEVC encodability probe, module-level cache
  frameSource.ts        # unchanged (buildFramePlan)
  grabFrame.ts          # unchanged
  exportVideoSource.ts  # unchanged
```

Deleted: `encodeSegments.ts`, old `encodeDirect.ts`, `ffmpegLoader.ts`,
`public/ffmpeg/`, the three `@ffmpeg/*` dependencies, and the
`optimizeDeps.exclude` entry in `vite.config.ts`.

New dependency: `mediabunny` only (pure TS, tree-shakable).

### mp4Writer (shared core)

- `new Output({ format: new Mp4OutputFormat({ fastStart: false }), target })` —
  `'in-memory'` would buffer the whole file until finalize, defeating the
  constant-memory goal; local exports don't need progressive playback.
- Target writes straight to disk: `StreamTarget` backed by a
  `FileSystemWritableFileStream` from the export directory handle. No
  whole-file Blob in memory; constant memory for long 4K exports.
- Video track: `VideoSampleSource` with `codec: 'avc' | 'hevc'` and the
  `QUALITY_HIGH` preset (mediabunny derives bitrate from resolution/fps).
  Hardware encoder preferred (mediabunny default).
- API: `addFrame(videoFrame, timestampSec, durationSec)`, audio-track plumbing
  for packet passthrough, `finalize()`, `cancel()`.
- Backpressure: when `encodeQueueSize` exceeds a threshold, await `dequeue`
  before adding more frames.

### Graded path (encodeGraded)

Same flow as today, with the encode stage swapped:

```
buildFramePlan -> for each planned frame:
  grabFrame -> RGBA bytes
  new VideoFrame(rgba, { format: 'RGBA', codedWidth, codedHeight, timestamp })
  writer.addFrame(frame, outputFrameIndex / fps, 1 / fps)
-> writer.finalize()
```

- Grab and encode interleave in one loop (VideoEncoder queues internally).
  The 256 MB chunk buffer, memfs round-trips, and mp4 concat step are all gone.
- No audio track.

### Direct path (encodeDirect)

Eligibility identical to today's `canUseDirectFfmpegExport` (no grade bake,
source resolution, normal-speed segments); renamed `canUseDirectExport`.

```
mediabunny Input (from FileSystemFileHandle) ->
  video: per segment, VideoSampleSink.samples(in, out) -> writer.addFrame
         (timestamps shifted so segments concatenate seamlessly)
  audio: EncodedPacketSink per segment -> EncodedAudioPacketSource passthrough,
         timestamps shifted in lockstep with video
```

- Hardware decode + hardware encode; frame-accurate cuts (re-encode, no
  stream-copy keyframe snapping), matching current ffmpeg behavior.
- Single-file multi-segment and multi-file modes share the same code; only the
  outer loop differs.
- If the source has no audio track, skip audio. If the audio codec cannot be
  muxed into mp4, drop audio and surface a toast (export still succeeds).

### Codec selection

- `codecSupport.ts` probes HEVC encodability once (mediabunny
  `canEncodeVideo('hevc')` at target-ish resolution) and caches the result.
- `DeliverTab`: the `mp4-h265` container option's `disabled` flag becomes
  dynamic. When unavailable, keep it disabled with hint
  "No HEVC hardware encoder available". ProRes stays disabled.
- `useExport` maps `container` -> `'avc' | 'hevc'`. No new store fields;
  `deliverStore.container` already models this.

### Progress, cancellation, errors

- Keep the `EncodeProgress` shape. Graded path: single frame-count progression
  (grab+encode merged), corrected for encoder queue lag. Direct path: ratio =
  processed duration / total duration.
- Cancel: AbortSignal -> close encoder, cancel mediabunny Output, abort the
  `FileSystemWritableFileStream` (aborted writables never materialize on disk,
  so no partial-file cleanup needed).
- VideoEncoder `error` callback rejects the export; message surfaces in the
  existing error toast.
- Belt-and-braces: `isConfigSupported`/mediabunny validation before encoding;
  fail with a clear message if the chosen codec config is rejected.

## Testing

- jsdom has no WebCodecs/mediabunny runtime, so mock the `mediabunny` module
  (same approach as today's ffmpeg mocks) and a minimal `VideoFrame` stub in
  `tests/setup.ts`.
- Assert: frame-plan -> addFrame timestamp sequences, per-segment timestamp
  shifting (direct path), finalize/cancel invocation, audio passthrough wiring,
  HEVC option gating in DeliverTab.
- `frameSource` tests unchanged. Rewrite `encodeSegments.test.ts`,
  `encodeDirect.test.ts`, and the ffmpeg-related parts of `useExport.test.tsx`
  against the new modules.

## Cleanup checklist

- [ ] Remove `@ffmpeg/core`, `@ffmpeg/ffmpeg`, `@ffmpeg/util` from package.json
- [ ] Delete `public/ffmpeg/` (30.7 MB)
- [ ] Delete `src/export/encoder/ffmpegLoader.ts`, `encodeSegments.ts`, old `encodeDirect.ts`
- [ ] Remove ffmpeg `optimizeDeps.exclude` entry in `vite.config.ts`
- [ ] Update `DeliverTab` hint copy ("Only H.264 .mp4 is supported in this build." no longer true)
