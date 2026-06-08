# Spike B — Ultra HDR JPEG ecosystem compatibility

Status: investigation report, awaiting manual ecosystem verification.
Date: 2026-06-08.

## Purpose

(Copied from `docs/superpowers/specs/2026-06-08-dji-lut-tool-design.md` §Validation Spikes — Spike B.)

> **Question**: do Ultra HDR JPEGs produced by a `libultrahdr` WASM build actually round-trip
> correctly through macOS Photos, iPhone Photos, Google Photos, and Chrome's image rendering?
>
> **Procedure**:
> 1. Pick a candidate WASM packaging of `libultrahdr` (or build one from `google/libultrahdr`).
>    Document the choice.
> 2. Generate three test stills with known characteristics: (a) clipped sky highlight, (b) a
>    specular reflection, (c) a flat midtone scene with no headroom needed.
> 3. Open each in: macOS Photos (Sonoma+), iOS Photos on a recent iPhone, Google Photos web,
>    Chrome direct file open.
> 4. Validate the metadata: run the file through a metadata inspector (`exiftool`,
>    `libultrahdr` CLI) and confirm MPF, XMP `hdrgm:` block, ICC profile, and gainmap dimensions
>    are all present and well-formed.
>
> **Pass criteria**: all four viewers display the HDR bloom; metadata validator reports no
> errors. Failure means we either pick a different encoder package or vendor `libultrahdr`
> directly and own the WASM build.

## Candidate packages investigated

| Candidate | Source / npm | Latest | License | API surface | ISO 21496-1 | WASM ships prebuilt? | Apple Photos evidence | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **`open-ultrahdr` + `open-ultrahdr-wasm`** | npm (Adam Silverstein) — wraps upstream `google/libultrahdr` via Emscripten/embind | **v0.2.0** (2026-05-08) | Apache-2.0 OR MIT | `encodeUltraHdr(id, sdrJpegBuffer, hdrFloat32Linear, options)` → `ArrayBuffer`. Also `decodeUltraHdr`, `probeUltraHdr`, `extractSdrBase`, `validateMetadata` | **Yes — explicit**: README states "ISO 21496-1:2025, Google UltraHDR v1, Adobe Gain Map" co-emitted | **Yes** — `open_ultrahdr.wasm` shipped in `open-ultrahdr-wasm` npm tarball, loaded via Emscripten factory; `setLocation()` / `setWasmUrl()` for custom serving | None published, but the encoder is built from `google/libultrahdr` HEAD, which is the same codec Apple Photos consumes natively on iOS 18 / macOS 15 | **Recommended.** Only candidate that (a) is on npm, (b) has prebuilt WASM, (c) advertises ISO 21496-1 conformance, (d) accepts the exact buffer shapes our preview pipeline already produces (compressed SDR JPEG + linear Float32 HDR). |
| `@monogrid/gainmap-js` | npm | v3.4.0 (2025-11-24) | MIT | `encode({ image, maxContentBoost })` + `encodeJPEGMetadata({...})` → `Uint8Array`. JS/TS pure (no WASM). | **No** — README only claims Adobe Gain Map + "JPEGR" (Google UltraHDR v1.0). Does not assert ISO 21496-1 conformance. | n/a (pure JS) | None; community usage focuses on three.js / WebGL HDR loading, not Apple Photos export | Rejected. `three` peer dep (`>= 0.159.0`) is multi-MB overhead for a non-renderer use case, and the spec explicitly calls out Apple Photos round-trip as unproven for this package. |
| `MONOGRID/libultrahdr-wasm` | GitHub only, no npm | last meaningful update mid-2024 | Apache-2.0 | Single exposed function `appendGainMap(...)` — takes pre-compressed SDR JPEG + pre-compressed gain map JPEG + metadata. No raw-pixel encode. Bundled libjpeg-turbo "completely unused". | Not mentioned | Not published; build-from-source via `meson` + `emcmake` | None | Rejected. Stale, requires us to author/encode the gain map JPEG ourselves before calling, no npm distribution. |
| `imazen/ultrahdr` (`ultrahdr-rs` + `ultrahdr-core`) | crates.io only | v0.5.0 (2026-04-26) | Apache-2.0 | Encoder/Decoder, ISO 21496-1 reader/writer, no_std + alloc, WASM-friendly, SIMD128 enabled. Pure Rust, no C dependencies. | **Yes** — explicit ISO 21496-1 APP2 binary metadata read/write | No — Rust crate only, no npm/WASM published; we would need `wasm-pack` + bindgen | Tested against `libultrahdr` goldens via pixel-parity CI; no Apple Photos test stated | Strong contender, but no npm and the crate maintainers themselves recommend waiting for the May 2026 stabilization pass. Filed as **fallback** if `open-ultrahdr` ever falls behind. |
| `google/libultrahdr` direct WASM build | C++ source | v1.4.0 (2025-01-10) | Apache-2.0 + MIT | C++ API: encodes from `P010`, `rgba1010102`, `rgbaf16`, `YUV420`, `rgba8888` raw inputs OR compressed JPEG. Official `building.md` documents an Emscripten build target. | **Yes** since v1.1.0 (2024-08-22) | Not officially. The official Emscripten build produces `ultrahdr_app.{js,wasm}` — the sample CLI, **not** a clean library binding. | Apple Photos accepts ISO 21496-1 natively in iOS 18 / macOS 15, so the codec itself is provably compatible | This is the **upstream truth**. `open-ultrahdr` is a thin wrapper around it. Picking this path means owning the Emscripten/embind binding ourselves — `open-ultrahdr` did exactly that work already, so we adopt it unless it falls behind. |

### Ecosystem facts that informed the verdict

- ISO 21496-1:2025 is the official ISO gain-map standard. **macOS 15 / iOS 18+ / iPadOS 18+ /
  Android 15 / Chromium-based browsers** all read it natively. Apple also continues to read the
  legacy Apple, Adobe, and Google UltraHDR v1 gain-map formats — files that carry *all three*
  metadata blocks render correctly on every shipping consumer surface today. (`libultrahdr`
  v1.1+ co-emits all three.)
- Google's `libultrahdr` is the reference encoder for both Google's UHDR v1 and the ISO standard.
  Apple has not published their own ISO encoder; the assumption that a `libultrahdr`-produced
  file blooms in Apple Photos is the assumption Spike B exists to verify.
- Browser-side JS encoders (`@monogrid/gainmap-js`) implement Adobe's spec but **do not**
  advertise ISO 21496-1 output. Field reports for Apple Photos round-trip with that package are
  inconsistent. We treat it as prototyping-only, matching the design doc's existing position.

## Recommendation

**Use `open-ultrahdr` (npm) plus its peer WASM payload `open-ultrahdr-wasm`.** Installed via:

```sh
pnpm add open-ultrahdr open-ultrahdr-wasm
```

Rationale, in priority order:

1. **ISO 21496-1 + UHDR v1 + Adobe metadata blocks all emitted unconditionally** by the
   underlying libultrahdr. The package even keeps `includeIsoMetadata` / `includeUltrahdrV1`
   option keys as no-ops "for API stability" precisely because the codec does both regardless.
   That is the single most important property for Apple Photos / Google Photos round-trip.
2. **Prebuilt WASM** ships inside `open-ultrahdr-wasm` (`pkg/open_ultrahdr.wasm`). Vite +
   `vite-plugin-wasm` (already configured in `vite.config.ts`) will serve it. No Emscripten
   toolchain dependency for us.
3. **Buffer shapes match our pipeline.** `encodeUltraHdr` takes a compressed SDR JPEG (we can
   produce that with `OffscreenCanvas.convertToBlob('image/jpeg')` at full resolution) and a
   `Float32Array` of linear-light RGB at three floats per pixel — which is exactly what Pass 3
   in the main design produces in `rgba16float` (we drop the alpha channel and downcast to
   Float32 on readback).
4. **Library, not just CLI.** Unlike the upstream `ultrahdr_app.wasm`, `open-ultrahdr` exposes a
   real binding surface (`encodeUltraHdr`, `decodeUltraHdr`, `probeUltraHdr`,
   `validateMetadata`). This saves us the Emscripten/embind work we would otherwise inherit.
5. **Active, signed releases.** v0.2.0 (2026-05-08) is npm-attested with provenance to GitHub
   Actions. The maintainer is an active contributor in adjacent image tooling (Imagick / WP).

### Spec adjustment

The design doc (§Export Pipeline step 5) sketched the call as `encodeFromRaw({ sdr: rawPixels,
gainmap: rawPixels, metadata })`. `open-ultrahdr` instead computes the gain map itself from the
SDR-JPEG and linear HDR buffer. This **simplifies** the export pipeline:

- The "Pass 4 gainmap compute" and "Pass 4b normalize" passes in the design doc become
  optional. The MVP can hand the linear HDR float buffer to `open-ultrahdr` directly; the codec
  derives the per-channel gain map, normalizes, and writes metadata in one step.
- `Pass 3` (HDR linear in `rgba16float`) is still required for the on-screen preview.
- The `targetHdrCapacity` option is the encoder's analog of the spec's `peakHeadroom` /
  `gainmapMax` knob. For peak-nits selector 400 / 600 / 1000 we map to ~2 / ~2.585 / ~3.322
  stops.
- We keep Pass 4 in our pocket as a **fallback** for the case where users want manual control
  over the gain map (P2 negative-gain creative looks etc.).

This is a strict win: less GPU code, less metadata code, less risk of producing a
malformed JPEG. The design doc should be revised when the spike passes.

### Fallback plan

If Spike B's ecosystem verification fails (any of the four viewers does not bloom, or exiftool
reports a malformed segment):

1. Pin `open-ultrahdr` to v0.2.0, file a reproducible issue upstream with the exiftool output.
2. Try `targetHdrCapacity` recalibration first — Apple Photos has historically been pickier
   about the `hdrCapacityMax` field than Android.
3. If that fails, switch to **vendoring `google/libultrahdr` directly** and authoring an embind
   binding ourselves. Concrete steps:
   - `git submodule add https://github.com/google/libultrahdr third_party/libultrahdr`
   - Install Emscripten 3.1.61+ (matches upstream CI).
   - `emcmake cmake -G Ninja -DUHDR_BUILD_DEPS=1 -DUHDR_BUILD_EXAMPLES=0 ..`
   - Author `bindings/ultrahdr.cc` exposing `uhdr_encode` / `uhdr_decode` via embind.
   - Build with `-sMODULARIZE=1 -sEXPORT_ES6=1 -sENVIRONMENT=web` and check the `.wasm` and
     `.js` glue into `vendor/libultrahdr/`.
   - Wrap in `src/export/ultraHdrJpeg.ts` matching the same shape we use for `open-ultrahdr`,
     so the call site stays stable.
4. Last resort: switch to `imazen/ultrahdr` once it stabilizes (post May 2026 release pass)
   and publishes a WASM/npm artifact.

## Test stills

Generated programmatically by the spike page (no input file needed). Each is `640x360`.

1. **`clipped-sky`** — Vertical sky gradient with foreground silhouette and a clipped white
   sun with halo. SDR is `255,255,255` inside the sun disc; the linear HDR buffer multiplies
   the sun by `8x` (≈3 stops of headroom) and the halo by up to `7x`. This is the canonical
   "did you really restore the highlight?" test.
2. **`specular`** — Dim midtone scene (a steely surface with horizon lines) plus a single very
   small specular pinpoint. SDR clips only at the pinpoint; HDR boosts the pinpoint by `7.5x`
   and tapers a halo around it. Tests that small, localized highlights survive `libultrahdr`'s
   gain-map downsampling.
3. **`flat-midtone`** — Uniform muted green gradient with text overlay. The HDR buffer is the
   linearized SDR exactly — every pixel's gain is `1.0`. Any difference between this file and
   its SDR-only sibling means the encoder is hallucinating headroom, which is a fail.

The page also offers a **Download SDR-only .jpg** button per still, producing the same SDR
canvas as a plain JPEG with no gain map, for direct A/B against the Ultra HDR output.

## Manual verification steps

1. `pnpm spike:b` → open the printed Vite URL in macOS Chrome on an HDR display (MBP XDR, Pro
   Display XDR, or recent iMac).
2. Click **Encode all three**. Each card's metadata panel should report `targetCap` stops and
   the output byte count.
3. Click each card's **Download .jpg** and **Download SDR-only .jpg**.
4. Open each Ultra HDR file in:
   - **macOS Photos** (Sonoma+). Drag the file into Photos. Switch to a window that's on the
     HDR display. Bloom check.
   - **iOS Photos**: AirDrop the file to a recent iPhone (XDR display preferred). Open in
     Photos. Bloom check.
   - **Google Photos web**: upload at <https://photos.google.com> in Chrome on the HDR Mac.
     Open the upload, bloom check.
   - **Chrome direct file open**: drag each `.jpg` onto a new Chrome tab on the HDR Mac. Bloom
     check.
5. Metadata inspection. From a shell:
   ```sh
   brew install exiftool
   for f in ~/Downloads/spike-b-*.uhdr.jpg; do
     echo "=== $f ==="
     exiftool -G1 -a -s "$f" | grep -Ei 'hdrgm|gainmap|mpf|iso|hdr|app2'
   done
   ```
   Expected markers per file:
   - `[MPF]` segment with `NumberOfImages` ≥ 2 and a secondary image reference.
   - `[XMP-hdrgm]` block with at least `Version`, `BaseRenditionIsHDR`, `GainMapMin`,
     `GainMapMax`, `Gamma`, `OffsetSDR`, `OffsetHDR`, `HDRCapacityMin`, `HDRCapacityMax`.
   - `[APP2]` marker carrying ISO 21496-1 (`urn:iso:std:iso:ts:21496:-1:`) — exiftool may not
     decode this segment by name; the raw `App2` carrier is enough.
   - ICC profile present (`sRGB` or `Display P3`).

## Pass / fail criteria

**Pass** — all of:

- All four viewers render `clipped-sky` and `specular` with visibly brighter highlights than
  their SDR-only siblings.
- All four viewers render `flat-midtone` indistinguishably from its SDR-only sibling.
- exiftool shows the MPF + `XMP-hdrgm` + ISO 21496-1 APP2 + ICC markers in all three files.
- No exiftool warnings (`Warning:` lines).

**Fail** — any of:

- A viewer falls back to SDR rendering on the headroom stills.
- A viewer crashes or refuses to open the file.
- exiftool reports a missing or malformed segment.
- `flat-midtone` shows any difference vs the SDR-only file.

A fail triggers the §Fallback plan above. A pass unblocks the main MVP work as described in
the design spec's §MVP vs Deferred §Prerequisite section.

## Open follow-ups (not blocking pass)

- Per-channel vs single-channel gain map. `open-ultrahdr`'s `GainMapMetadata.gainMapMin`/`Max`
  are RGB arrays — the underlying codec already emits per-channel. The design doc's §Open
  Questions item on per-channel becomes a *consumer-side* question (do Apple/Google honor
  per-channel values?) which the manual verification will incidentally answer.
- `targetHdrCapacity` mapping for the 400 / 600 / 1000-nit selector. Initial map:
  `400 → 2.0`, `600 → 2.585`, `1000 → 3.322`. Worth a follow-up tune once stills look right.
- ICC profile. `libultrahdr` writes sRGB by default; the design doc's plan to allow Display P3
  output is a P1 toggle we can pass via the encoder once the sRGB path passes.
