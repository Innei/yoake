# DJI D-Log M Restoration & HDR Still Tool — Design Spec

Date: 2026-06-08
Status: Draft v2 — incorporates external technical review (Codex). Awaiting final user approval.

## Overview

A local-only web tool for restoring DJI D-Log M (10-bit HEVC) footage with the official DJI LUT and exporting still frames as Ultra HDR JPEGs. Single user, single machine, opens one clip at a time, picks a LUT, tweaks creative grading, and grabs HDR stills that bloom in macOS Photos and on iPhone.

## Goals

- Restore DJI D-Log M footage faithfully using the official DJI D-Log M → Rec.709 SDR `.cube` LUT.
- Provide a real HDR preview on macOS HDR-capable displays (not "HDR-look" via tone-mapping tricks). The preview shows the DJI LUT look with scene-linear highlight recovery applied on top — what you see is what the Ultra HDR JPEG will reconstruct on an HDR viewer.
- Export Ultra HDR JPEG stills (gainmap-based, ISO 21496-1 / Google Ultra HDR compliant). The SDR base layer is the DJI LUT'd image; the gain layer encodes per-pixel luminance recovery derived from the scene-linear source. Hue and saturation are owned entirely by the LUT — the gainmap moves only luminance.
- Read clips and write exports directly through the File System Access API (no upload step).

## Non-goals (out of MVP)

- Cross-platform browser support beyond macOS Chrome. No Firefox, no Linux/Windows.
- Frame-accurate seeking via WebCodecs. MVP uses `<video>` + `requestVideoFrameCallback` for best-effort frame stepping. rVFC reports which frame the compositor *presented*, not which frame `currentTime` requested; small misses are accepted.
- Batch export, video export, EDL workflows.
- 16-bit PNG export.
- HEIC or AVIF export.
- Multi-LUT side-by-side compare (UI Layout C).
- Real-time scopes (waveform / vectorscope).
- Custom curves / per-channel curve editor.
- LUT chaining / look stacking.

## Platform & Constraints

| Item | Decision |
| --- | --- |
| Browser | macOS Chrome only (Safari deferred — partial FS API + uncertain WebGPU HDR canvas) |
| Decoder | Browser-native HEVC Main 10 via `<video>` (VideoToolbox on macOS) |
| GPU | WebGPU. WebGL2 cannot configure an HDR canvas, so it is not a fallback. |
| Source codec | HEVC Main 10, yuv420p10le, 4K @ 29.97fps, ~80 Mbps (representative DJI Action / Osmo D-Log M clip) |
| Display | Any HDR-capable macOS display (MacBook Pro mini-LED XDR, Pro Display XDR, recent iMacs) |
| Backend | None. Pure client app served by Vite dev server on `localhost`. |

## Architecture

### Stack

- React 18, TypeScript, Vite.
- Scaffolded from `pnpm dlx degit Innei/Pastel/templates/react-starter dji-lut`.
- Zustand for state. IndexedDB for persistence of `FileSystemDirectoryHandle` references and last-session settings.
- One WASM dependency: a WASM build of Google's `libultrahdr` (the reference Ultra HDR JPEG codec — ISO 21496-1 with MPF / XMP / ICC metadata that Apple Photos and Google Photos both honor). Wrapper packaging is chosen during Spike B (§Validation Spikes). Browser-side encoders such as `@monogrid/gainmap-js` are not used for export — they are useful for prototyping but have not demonstrated full Apple Photos round-trip.

### Module layout

```
src/
├── app/                  React shell
│   ├── Layout.tsx        Two-pane: clip list (left) | preview + transport + inspector (right)
│   ├── ClipList.tsx      Lists *_D.MP4 files from the chosen DJI directory
│   ├── Preview.tsx       Hosts the HDR canvas and the <video> element
│   ├── Transport.tsx     Play/pause, scrubber, frame step, time display
│   ├── Inspector.tsx     LUT picker + grading controls + HDR settings
│   └── ExportPanel.tsx   Export format toggle, export button, save path display
├── gpu/                  WebGPU lifecycle
│   ├── Device.ts         Adapter/device init, feature & limit detection
│   ├── HdrCanvas.ts      rgba16float canvas with srgb + extended toneMapping; runs the same shader chain for preview and export
│   ├── caps.ts           Feature detection: matchMedia('(dynamic-range: high)'), context.getConfiguration().toneMapping, GPUExternalTexture availability
│   ├── pipelines/
│   │   ├── sceneLinear.ts   Pass 1: video → de-log → scene-linear rgba16float (the master texture)
│   │   ├── lutSdrBase.ts    Pass 2: scene-linear → grade → forward OETF → 3D LUT → sRGB rgba8 (the "look")
│   │   ├── hdrCompose.ts    Pass 3: SDR base + scene-linear → HDR linear rgba16float (LUT look + highlight luminance lift)
│   │   └── gainmap.ts       Pass 4 (export only): log2(HDR_luma / SDR_luma) → rgba8, plus dynamic metadata
│   └── shaders/          *.wgsl
├── decode/
│   └── VideoFrameSource.ts   <video> element + requestVideoFrameCallback wrapper
├── color/                pure functions, all unit-testable
│   ├── dlogM.ts          D-Log M forward & inverse OETF (DJI's published function)
│   ├── lutCube.ts        .cube file parser → Float32Array
│   ├── lutTexture.ts     LUT data → GPU 3D texture (rgba16float, ~32³ typical)
│   └── colorMath.ts      sRGB OETF/inverse, Rec.709 luma weights, small helpers
├── fs/
│   ├── handleStore.ts    IndexedDB persistence for FileSystemDirectoryHandle
│   ├── clipScanner.ts    Walk a directory handle, filter *_D.MP4, extract metadata
│   └── lutLoader.ts      Walk LUT directory, list .cube files
├── export/
│   ├── render.ts         Orchestrates SDR base + gainmap render passes
│   ├── ultraHdrJpeg.ts   WASM encoder wrapper
│   └── sdrJpeg.ts        Fallback SDR JPEG path
├── state/
│   ├── clipsStore.ts     directoryHandle, clips[], selectedId
│   ├── editStore.ts      currentTime, lutHandle, grading params, HDR settings
│   └── prefsStore.ts     LUT dir, export dir, last-session restore
└── utils/                small generic helpers
```

Constraint: each file ≤ 500 lines, React components ≤ 300 lines (per repo style).

### Creative grading controls

All grading happens in scene-linear space, before the forward OETF + LUT lookup. Sliders are split across MVP priority tiers:

**P0 (ships with first usable build):**

1. Exposure (stops, linear gain `2^x`)
2. HDR peak nits (400 / 600 / 1000) — drives both the HDR compose ceiling and the gainmap `hdrCapacityMax` metadata.

**P1 (added after spikes + P0 are green):**

3. Contrast (S-curve in linear)
4. Highlights (parametric shoulder)
5. Shadows (parametric toe)
6. Saturation (luminance-preserving)
7. Temperature (white balance, blackbody approximation)
8. Tint (green/magenta)
9. Gainmap strength (0.0–1.0) — scales the highlight luminance lift before computing the gainmap.

## Per-frame Data Flow

The preview pipeline renders the **reconstructed Ultra HDR result** to the HDR canvas — the same image the exported JPEG will reproduce on an HDR viewer. The SDR base and HDR target share hue/saturation; only luminance differs. This is what makes the single-channel gainmap a faithful encoder of the difference.

```
<video>  ── rVFC ──►  GPUExternalTexture
                              │
                              ▼
        Pass 1: sceneLinear.frag.wgsl
        scene-linear master (rgba16float, extended range)
                              │
                       grade in scene-linear (exposure first, others P1)
                              │
        ┌─────────────────────┴────────────────────────┐
        │                                              │
        ▼                                              ▼
 Pass 2: lutSdrBase.frag.wgsl              (kept as scene-linear extended)
 forward D-Log M OETF → 3D LUT → sRGB
 → SDR base rgba8 (the LUT look,
   Rec.709 sRGB, display-referred)
        │                                              │
        └──────────────────────┬───────────────────────┘
                               ▼
        Pass 3: hdrCompose.frag.wgsl
        For each pixel:
          sdr_lin   = sRGB_to_linear(SDR_base.rgb)         // LUT look in linear
          src_lin   = scene-linear master.rgb              // full dynamic range
          src_luma  = dot(src_lin, [0.2627, 0.6780, 0.0593])  // Rec.2020 luma weights
          sdr_luma  = dot(sdr_lin, [0.2627, 0.6780, 0.0593])
          gain      = clamp(src_luma / max(sdr_luma, ε), 1.0, peakHeadroom)
          hdr_lin   = sdr_lin * gain   // preserve LUT hue/sat; lift luminance only
        → HDR linear rgba16float (Rec.709 linear, extended)
                               │
                               ▼
                       HDR canvas (per-frame display)
                       (format rgba16float,
                        colorSpace 'srgb',
                        toneMapping { mode: 'extended' })
```

Where `peakHeadroom = peakNits / 100` (a linear multiplier — e.g., `10.0` for a 1000-nit target). The matching gainmap metadata then sets `gainmapMax = log2(peakHeadroom)`, so a fully-bright pixel reconstructs back to `peakNits`.

Why `gain = clamp(..., 1.0, peakHeadroom)`: SDR base values below the LUT's diffuse white stay equal to SDR (`gain == 1.0`), so the gainmap is `log2(1) == 0` for that region. Only pixels brighter than the SDR base receive a boost. This keeps midtones and shadows identical between SDR and HDR viewers — the gainmap is exclusively about reopening clipped or compressed highlights.

The grading uniforms (exposure for P0; the rest for P1) all act on the scene-linear master before Pass 2 and before the luma comparison in Pass 3. They affect both branches identically.

### WGSL files

- `fullscreenTriangle.vert.wgsl` — vertex shader, single triangle covering the viewport.
- `sceneLinear.frag.wgsl` — Pass 1, video external texture → scene-linear `rgba16float`. **Note**: the sampled values from `GPUExternalTexture` may already be color-converted by the browser; Spike A (§Validation Spikes) confirms whether what we receive is recoverable D-Log M code values or has been pre-quantized.
- `lutSdrBase.frag.wgsl` — Pass 2, scene-linear + grade → forward D-Log M OETF → 3D LUT lookup (trilinear) → sRGB OETF → rgba8.
- `hdrCompose.frag.wgsl` — Pass 3, SDR base + scene-linear master → HDR linear with luminance lift, written to the HDR canvas during preview and to an offscreen texture during export.
- `gainmap.frag.wgsl` — Export only. Reads SDR base and HDR linear textures, emits `rgba8` grayscale gain image. A small companion compute shader (`gainmapStats.compute.wgsl`) performs the min/max reduction needed for normalization metadata.

### Frame stepping

- `Space` — play / pause via `video.play()` / `video.pause()`.
- `ArrowLeft` / `ArrowRight` — when paused, `video.currentTime ± (1 / fps)`. Render fires when the next rVFC callback delivers a frame; the callback's `metadata.mediaTime` is logged and compared to the request so the UI can warn on large misses.
- `Cmd+S` — export current paused frame.

Accuracy: rVFC reports the *presented* frame, not which `currentTime` was honored. Under load Chrome may skip a v-sync or miss by a frame. Expected behavior is "almost always right; sometimes one frame off." Frame-accurate addressing is a P2 item handled by WebCodecs.

### HDR canvas configuration

```ts
context.configure({
  device,
  format: 'rgba16float',
  colorSpace: 'srgb',
  toneMapping: { mode: 'extended' },
  alphaMode: 'opaque',
})
```

Output values: `1.0` = SDR diffuse white (~100 nits). Values up to `peakHeadroom` light up HDR highlights on capable displays. macOS handles display color management automatically.

**Feature detection** at startup (in `gpu/caps.ts`). All three checks must pass before the HDR branch is enabled:

1. `navigator.gpu?.requestAdapter()` returns a non-null adapter.
2. `matchMedia('(dynamic-range: high)').matches` — display is HDR-capable.
3. After `context.configure(...)`, `context.getConfiguration()?.toneMapping?.mode === 'extended'` — the browser actually honored the HDR configuration.

If any check fails, the app falls back to a degraded mode that still renders previews and exports SDR JPEGs, but the Ultra HDR export button is disabled with a tooltip explaining which capability is missing.

### Performance budget

- 4K @ 30fps target. Per-frame GPU work budget ~5 ms.
- `GPUExternalTexture` binding is zero-copy.
- 3D LUT is `32³` rgba16float = 128 KB. Trivial.
- M-series Macs have ample headroom.

## Export Pipeline

User triggers via `Cmd+S` or ExportPanel button. Video must be paused. The preview pipeline already produces both the SDR base and the HDR linear textures; export re-renders them to offscreen targets at full resolution, computes the gainmap with dynamic metadata, then hands raw pixel buffers to `libultrahdr`.

```
1. Re-run Pass 1 (scene-linear master), Pass 2 (SDR base rgba8), and Pass 3
   (HDR linear rgba16float) at source resolution to offscreen render targets.
   At preview resolution the canvas may be down-sampled; export must be full 4K.

2. Pass 4 — gainmap compute:
   per pixel:
     gain_raw_r = log2(max(hdr_lin.r, ε) / max(sdr_lin.r, ε))
     gain_raw_g = log2(max(hdr_lin.g, ε) / max(sdr_lin.g, ε))
     gain_raw_b = log2(max(hdr_lin.b, ε) / max(sdr_lin.b, ε))
     gain_raw   = max(gain_raw_r, gain_raw_g, gain_raw_b)   // single channel
   In a second compute pass, scan the gain_raw texture and find min and max
   (atomic reductions). Write to a small uniform buffer.

3. Pass 4b — normalize:
   gain_norm = (gain_raw - gainmapMin) / max(gainmapMax - gainmapMin, ε)
   gain_norm = clamp(gain_norm, 0.0, 1.0)
   output: rgba8 single-channel grayscale (R replicated, G=B=0, A=255)

4. Readback raw pixels (no JPEG round-trip yet):
   - SDR base   → Uint8ClampedArray (4 * W * H bytes, sRGB)
   - Gainmap    → Uint8ClampedArray (4 * W * H bytes, R holds the value)

5. libultrahdr (WASM) — raw-input mode:
   encodeFromRaw({
     sdr:     { pixels: sdrBytes,     width, height, colorSpace: 'srgb' },
     gainmap: { pixels: gainmapBytes, width, height, channels: 1 },
     metadata: {
       gainmapMin,             // computed in step 2 (clamped to ≥ 0 in MVP — see below)
       gainmapMax,             // computed in step 2, clamped to log2(peakNits/100)
       gamma: 1.0,
       offsetSdr: 1/64,
       offsetHdr: 1/64,
       hdrCapacityMin: 0,
       hdrCapacityMax: gainmapMax,
     },
     baseQuality: 95,
     gainmapQuality: 90,
   })
   Encoder emits a single ISO 21496-1 Ultra HDR JPEG with MPF + XMP + ICC metadata.

6. Write to chosen export directory:
   - Filename: `${clipBaseName}_${frameMs.toString().padStart(7,'0')}_${lutLabel}.jpg`
   - Path: `prefs.exportDirHandle.getFileHandle(name, { create: true }).createWritable()`
   - On conflict, append `_2`, `_3`, ...
```

### Gainmap metadata semantics

- **Dynamic min/max**. The min/max gain values come from the actual computed gain image, not a fixed default. This keeps the 8-bit gainmap quantization tight: most stills cover only a small portion of the available headroom, and pinning the range to observed data avoids wasted code points.
- **`gainmapMin` clamped to ≥ 0 in MVP**. Pass 3 already clamps `gain` to `[1.0, peakHeadroom]`, so the gainmap never encodes a downward correction in MVP. Negative gainmap values (HDR darker than SDR) are a P2 feature for creative looks that intentionally crush bright areas in SDR.
- **`hdrCapacityMax = gainmapMax`** — follows Android guidance. Per-pixel reconstruction is `hdr = sdr * 2^(gainmap_value * gainmapMax)` when the viewer's display has at least `gainmapMax` stops of headroom.

### Why raw pixels, not `OffscreenCanvas.convertToBlob`

`convertToBlob('image/jpeg')` round-trips through Chrome's JPEG encoder with limited control over ICC profile tagging, chroma subsampling, EXIF orientation, and MPF structure. `libultrahdr` accepts raw pixel buffers directly and is responsible for emitting the structurally correct ISO 21496-1 file. This avoids a known compatibility hazard where Chrome's JPEG output strips or rewrites metadata that the Ultra HDR spec requires.

### Output format options

Two formats supported in MVP, toggled in ExportPanel:

| Option | Use case | Implementation |
| --- | --- | --- |
| Ultra HDR JPEG (default) | iPhone Photos, macOS Sonoma+ — blooms on HDR, falls back to SDR JPEG on SDR viewers | Full gainmap pipeline |
| SDR JPEG | Smallest file, simplest share | Only the SDR base path, no gainmap |

Dropped from MVP: 16-bit PNG, HEIC, AVIF.

## State & Persistence

### Zustand stores

- `clipsStore`: `directoryHandle`, `clips: ClipMeta[]`, `selectedClipId`
- `editStore`: `currentTime`, `isPlaying`, `lutHandle`, `lutData`, `grading: GradingParams`, `hdr: HdrSettings`
- `prefsStore`: `clipDirHandle`, `lutDirHandle`, `exportDirHandle`, `presets`, `lastSession`

### IndexedDB persistence

- `handleStore.set('clipDir' | 'lutDir' | 'exportDir', handle)` — `FileSystemDirectoryHandle` objects are structured-clonable; IndexedDB can store them.
- On app boot:
  1. Load all three handles.
  2. Call `handle.queryPermission({ mode: 'readwrite' })`. If `'granted'`, proceed silently.
  3. If `'prompt'`, surface a "Re-grant access" CTA; user clicks → `requestPermission`.
  4. If `'denied'`, treat as unset; ask user to re-pick.
- `prefsStore.lastSession` records `{ clipId, lutLabel, grading, hdr }`, restored after handles resolve.

## Error Handling

Six known failure points. All surface via toast + detailed console log. None should crash the app.

| Failure | UX | Implementation |
| --- | --- | --- |
| WebGPU unavailable | Full-screen diagnostic, app blocked | At boot, `navigator.gpu?.requestAdapter()` returns null → render diagnostic |
| HEVC decode failure | Toast: "Not a DJI D-Log M clip, or decode failed" | `<video>.onerror` listener |
| FS permission denied / expired | Banner CTA: "Re-grant access" | `directoryHandle.queryPermission()` check + try/catch on write `SecurityError` |
| LUT parse failure | Toast + bypass to pass-through | `lutCube.ts` throws typed `LutParseError` |
| Ultra HDR encode failure | Toast + auto-downgrade to SDR JPEG for this export | WASM call wrapped in try/catch |
| Disk write failure (full / path gone) | Toast with system error message | `writable.write` / `close` try/catch |

## Testing Strategy

| Tier | Tooling | Coverage |
| --- | --- | --- |
| Unit | Vitest | `dlogM.ts` forward/inverse OETF roundtrip (ε < 1e-4); `lutCube.ts` parses fixture LUTs; `gainmap.ts` ratio math; color matrix invertibility; `handleStore` round-trips a fake handle |
| Component | Vitest + React Testing Library | `ClipList` renders directory entries; `Inspector` sliders bind to `editStore`; `Transport` keybindings dispatch actions |
| Smoke (manual) | Real DJI clip | Open clip → HDR preview engages on MacBook Pro XDR display → screenshot → opened Ultra HDR JPEG blooms in macOS Photos → close + reopen browser → handles restored after re-grant |

Not in MVP: pixel-diff visual regression, Playwright E2E (WebGPU instability), performance benchmark suites.

### Test fixtures

- `tests/fixtures/dji-dlog-m.cube` — a small published DJI D-Log M → Rec.709 LUT, committed.
- `tests/fixtures/dlog-m-pairs.json` — known (coded, linear) value pairs for OETF roundtrip.
- A real `.MP4` fixture is too large to commit. Path supplied via `DJI_TEST_CLIP` env var; tests using it `skip` when unset.

## Validation Spikes

Two spikes must produce green results **before** the main MVP implementation starts. They are short, self-contained, and either confirm the architectural assumptions or force a redesign.

### Spike A — `GPUExternalTexture` precision

**Question**: when we sample a 10-bit HEVC `<video>` through `GPUExternalTexture`, do we receive recoverable D-Log M code values, or has Chrome already applied a color transform / quantized to 8-bit before exposing the texture?

**Procedure**:
1. Author or take a synthetic 10-bit HEVC HDR-tagged test clip containing a known D-Log M ramp (or use a published reference if available).
2. In a minimal WebGPU page, load the clip, sample via `importExternalTexture`, render to an `rgba16float` offscreen texture, read back pixels.
3. Compare measured values to the expected D-Log M code values for the ramp. Compute max per-channel error.

**Pass criteria**: max error consistent with 10-bit quantization (≈ 1/1024 in normalized space). Banding / steps consistent with 8-bit suggests Chrome quantizes — in which case the pipeline must shift to WebCodecs `VideoDecoder` with manual 10-bit unpacking before MVP main work begins.

**Output**: a short markdown report committed to `docs/superpowers/spikes/spike-a-external-texture.md` with measured numbers and a Go/No-Go.

### Spike B — Ultra HDR JPEG ecosystem compatibility

**Question**: do Ultra HDR JPEGs produced by a `libultrahdr` WASM build actually round-trip correctly through macOS Photos, iPhone Photos, Google Photos, and Chrome's image rendering?

**Procedure**:
1. Pick a candidate WASM packaging of `libultrahdr` (or build one from `google/libultrahdr`). Document the choice.
2. Generate three test stills with known characteristics: (a) clipped sky highlight, (b) a specular reflection, (c) a flat midtone scene with no headroom needed.
3. Open each in: macOS Photos (Sonoma+), iOS Photos on a recent iPhone, Google Photos web, Chrome direct file open.
4. Validate the metadata: run the file through a metadata inspector (`exiftool`, `libultrahdr` CLI) and confirm MPF, XMP `hdrgm:` block, ICC profile, and gainmap dimensions are all present and well-formed.

**Pass criteria**: all four viewers display the HDR bloom; metadata validator reports no errors. Failure means we either pick a different encoder package or vendor `libultrahdr` directly and own the WASM build.

**Output**: `docs/superpowers/spikes/spike-b-ultra-hdr-compat.md` with screenshots and the validator output.

## MVP vs Deferred

The MVP is scoped tightly so the first usable build proves the core technical claim — open a DJI clip, see a real HDR preview, export an Ultra HDR JPEG that blooms in macOS Photos. Once that loop closes, grading depth and ergonomics layer on top.

### Prerequisite

- Spike A and Spike B both green (§Validation Spikes).

### P0 (first usable build)

- Open DJI directory via FS API, persistent handle.
- List `*_D.MP4` clips.
- Select a clip → play preview at native resolution.
- Load a single DJI official `.cube` LUT (single LUT chosen by the user at startup).
- Real HDR preview via WebGPU `rgba16float` canvas (the reconstructed Ultra HDR result — same shader chain as export).
- Exposure slider + HDR peak nits selector.
- `Cmd+S` export of the current paused frame as Ultra HDR JPEG.
- SDR JPEG fallback automatically used when the HDR capability checks (§HDR canvas configuration) fail or when the user explicitly chooses SDR in ExportPanel.

### P1 (after P0 lands)

- Remaining grading sliders: contrast, highlights, shadows, saturation, temperature, tint, gainmap strength.
- Frame step via arrow keys (best-effort).
- Persistent last-session restore (clip + LUT + grading params).
- Multiple LUTs in the LUT directory with one-click switching.

### P2 (deferred)

- WebCodecs-based precise frame stepping and jump-by-frame-number.
- Batch export across multiple frames.
- Multi-LUT side-by-side compare (Layout C from the brainstorm).
- Custom user-imported / third-party `.cube` LUTs.
- 16-bit PNG / HEIC / AVIF export formats.
- Real-time scopes (waveform, vectorscope, histogram).
- Negative gainmap values (HDR darker than SDR — for crushed-highlight creative looks).

## Open Questions

- Specific WASM packaging of `libultrahdr`. Spike B selects one (vendor a community build, or compile `google/libultrahdr` ourselves with Emscripten). The encoder algorithm itself is locked.
- DJI's published D-Log M OETF — confirm the exact piecewise function. DJI's official color manual for the source camera is the source of truth; fall back to reverse-engineering against known D-Log M samples if necessary.
- Behavior on machines without HDR displays. The plan is to gate the Ultra HDR export on `matchMedia('(dynamic-range: high)')` and the WebGPU configuration check, with a clear fallback message. Open: should we still permit exporting Ultra HDR JPEGs on SDR-only machines (the file would render correctly on an HDR viewer elsewhere), or block to avoid producing files the user cannot verify?
- Per-channel vs single-channel gainmap. MVP emits single-channel (luma-derived from the per-channel `max`), matching the most-compatible profile of Ultra HDR. Spike B should report whether viewers consume per-channel gainmaps correctly; if so, a P1 follow-up can switch.

## Glossary

- **D-Log M** — DJI's flat / logarithmic color profile on Action / Pocket cameras. Records ~13 stops of dynamic range in a Rec.709-tagged 10-bit HEVC container.
- **OETF** — Opto-Electronic Transfer Function. The encoding curve from scene-linear light to coded video values. Inverse OETF "de-logs" the footage back to scene-linear.
- **Gainmap (Ultra HDR JPEG)** — A second image embedded in a JPEG that encodes per-pixel `log2(hdr / sdr)`. SDR viewers see only the base JPEG; HDR viewers reconstruct the HDR pixel by multiplying base × `2^(gainmap × range)`.
- **PQ / HLG** — Perceptual Quantizer (SMPTE ST 2084) and Hybrid Log-Gamma (BT.2100). Two standard HDR encoding curves. We use neither directly — Chrome's `srgb` colorSpace with `toneMapping: extended` handles HDR output to the display.
- **`hdrCapacityMax`** — Ultra HDR metadata field declaring the display headroom (in stops) for which the gainmap was authored. Viewers scale the reconstructed HDR based on their own headroom relative to this value.
