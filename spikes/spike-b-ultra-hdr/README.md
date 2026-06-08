# Spike B — Ultra HDR JPEG ecosystem compatibility

Quick-run sibling to `docs/superpowers/spikes/spike-b-ultra-hdr-compat.md`. See that document
for the full investigation, comparison table, and pass/fail criteria.

## Run

```sh
pnpm spike:b
```

Then open the URL Vite prints. Click **Encode all three** to generate the three Ultra HDR test
stills. Each card surfaces:

- The SDR canvas preview.
- An **Encode Ultra HDR** button → calls `encodeUltraHdr` from `open-ultrahdr`.
- A **Download .jpg** button → saves the Ultra HDR JPEG.
- A **Download SDR-only .jpg** button → saves the same SDR canvas without a gain map (for A/B).

## Encoder

We use [`open-ultrahdr`](https://github.com/adamsilverstein/lib-open-ultrahdr) (npm). It is a
prebuilt Emscripten/embind WASM wrapper over Google's reference `libultrahdr` C++ codec, emitting
ISO 21496-1 (2025) gain maps **and** Google UltraHDR v1 + Adobe legacy metadata in the same JPEG.

Encoder call shape used in `main.ts`:

```ts
await encodeUltraHdr(id, sdrJpegBuffer, hdrFloat32LinearBuffer, {
  baseQuality: 95,
  gainMapQuality: 90,
  targetHdrCapacity: 3.0, // stops
  gainMapScale: 1,
});
```

`sdrJpegBuffer` is **compressed JPEG bytes** (we generate them via `canvas.toBlob('image/jpeg')`).
`hdrBuffer` is a `Float32Array` of **scene-linear** RGB, three floats per pixel, where `1.0` =
SDR diffuse white and values above 1.0 represent additional headroom. `libultrahdr` derives the
gain map and writes both ISO 21496-1 and UHDR v1 metadata blocks; we do **not** compute the gain
map ourselves.

This differs from the original spec sketch in `docs/.../spike-b-ultra-hdr-compat.md` (and the
design doc, §Export Pipeline step 5) which assumed a raw `(sdrPixels, gainmapPixels, metadata)`
call signature. The actual `open-ultrahdr` API is simpler and removes a class of metadata bugs
the spec was worried about. The export pipeline in the main MVP can adopt the same signature
once Spike B passes — see the docs report for the adapted call site.

## Manual verification

Once `*.uhdr.jpg` files are downloaded:

1. **macOS Photos** (Sonoma+ on an HDR display) — import and open each. Expect bloom on
   `clipped-sky` and `specular`. Expect `flat-midtone` to look identical to its SDR twin.
2. **iOS Photos** — AirDrop, open in Photos. Same expectations.
3. **Google Photos web** — upload, view in Chrome on the same HDR Mac. Same expectations.
4. **Chrome direct file open** — drag each file onto a tab on the HDR Mac. Same expectations.
5. **`exiftool -G1 -a -s spike-b-clipped-sky.uhdr.jpg`** — confirm
   - APP2 MPF segment listing the gain map secondary image.
   - XMP `hdrgm:` namespace block (Adobe / UHDR v1).
   - ISO 21496-1 APP2 marker (`urn:iso:std:iso:ts:21496:-1:`).

All four viewers must bloom 1 and 2 and must keep 3 SDR-identical; exiftool must report no
malformed segments. Any failure forces the docs recommendation to flip to the
"vendor and build libultrahdr ourselves" fallback documented in the parent spike doc.
