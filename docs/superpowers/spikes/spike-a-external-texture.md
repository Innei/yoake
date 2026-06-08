# Spike A — GPUExternalTexture Precision

Status: run on 2026-06-09. Precision pass; color-transform behavior identified.

## Purpose

(Quoted verbatim from the design spec, section "Validation Spikes → Spike A".)

> **Question**: when we sample a 10-bit HEVC `<video>` through `GPUExternalTexture`, do we
> receive recoverable D-Log M code values, or has Chrome already applied a color transform /
> quantized to 8-bit before exposing the texture?
>
> **Procedure**:
>
> 1. Author or take a synthetic 10-bit HEVC HDR-tagged test clip containing a known D-Log M
>    ramp (or use a published reference if available).
> 2. In a minimal WebGPU page, load the clip, sample via `importExternalTexture`, render to an
>    `rgba16float` offscreen texture, read back pixels.
> 3. Compare measured values to the expected D-Log M code values for the ramp. Compute max
>    per-channel error.
>
> **Pass criteria**: max error consistent with 10-bit quantization (~1/1024 in normalized
> space). Banding / steps consistent with 8-bit suggests Chrome quantizes — in which case the
> pipeline must shift to WebCodecs `VideoDecoder` with manual 10-bit unpacking before MVP main
> work begins.

## How to run

The spike is a standalone Vite page. It does **not** depend on the main app's source tree.

1. Ensure dependencies are installed:

   ```sh
   pnpm install
   ```

2. Launch the dev server:

   ```sh
   pnpm spike:a
   ```

   Equivalent to `vite spikes/spike-a-external-texture`. Vite will pick a free port (5173 by
   default) and print the URL.

3. Open the printed URL in **macOS Chrome** on a machine with WebGPU enabled
   (`chrome://gpu` → look for "WebGPU: Hardware accelerated"). The right-hand panel will say
   "device ready" when the GPU is up.

4. Use the file picker to load a 10-bit HEVC clip (a real DJI D-Log M MP4 is fine; a
   purpose-built ramp clip is better — see "Producing a reference ramp" below).

5. Play the clip, then click **Sample current frame**. Or tick **auto-sample every frame** to
   run continuously via `requestVideoFrameCallback`.

6. Read off the per-channel min/max/mean and the inferred bit-depth. The verdict pill turns
   green for ≥10-bit, red for ≤8-bit, neutral for borderline / inconclusive.

The canvas paints a falsecolor heatmap of luma; pixels that lie exactly on the detected step
grid are painted bright red to visualize banding patterns.

## Producing a reference ramp (optional, recommended)

A real DJI clip will give a directional answer, but a synthetic ramp gives a quantitative one.
Create a 10-bit HEVC HDR clip with a horizontal D-Log M ramp from coded value 0 to 1023:

```sh
# example using ffmpeg; adjust resolution and duration to taste
ffmpeg -f lavfi -i "gradients=size=1024x720:type=horizontal:nb_colors=1024:duration=5" \
       -c:v libx265 -pix_fmt yuv420p10le -x265-params "colorprim=bt2020:transfer=bt2020-10:colormatrix=bt2020nc" \
       -t 5 dlog-ramp.mp4
```

DJI clips are tagged Rec.709 / bt709, not bt2020 — adjust `colorprim`/`transfer`/`colormatrix`
to match the camera profile under test.

## Pass / fail criteria

Both are taken from the spec.

- **PASS**: max per-channel quantization step consistent with 10-bit precision (~1/1024 in
  normalized 0..1 space, i.e. ~9.77e-4). The "Inferred bit-depth" panel should report 10 (or
  greater).
- **FAIL**: steps cluster around 1/255 (~3.92e-3). Inferred bit-depth ≤ 8. This means Chrome
  is quantizing the texture before exposing it via `GPUExternalTexture`; in that case the
  pipeline must switch to `VideoDecoder` (WebCodecs) with manual 10-bit YUV unpacking before
  MVP work begins.

Borderline results (bit-depth 9) most often mean the chosen frame did not contain a smooth
enough gradient; try a frame with a clear sky or a defocused background, or load the
synthetic ramp clip.

## Results

- Date run: `2026-06-09`
- Machine: `macOS 26.4.1`
- Chrome version: `148.0.7778.216`
- GPU adapter (from the page header): `apple / metal-3`
- Test clip: `/tmp/dji-lut-bt709-tv-ramp-hevc10.mp4`, synthetic 1024×256 10-bit HEVC
  grayscale ramp, `yuv420p10le(tv, bt709, progressive)`, generated from limited-range
  Y values 64→940 with neutral chroma.

### Measurements

| Channel | min       | max       | mean      | smallest step |
| ------- | --------- | --------- | --------- | ------------- |
| R       | `0.000`   | `0.993`   | not recorded | `2.47e-4` |
| G       | `0.000`   | `0.993`   | not recorded | `7.13e-4` |
| B       | `0.000`   | `0.993`   | not recorded | `2.47e-4` |

- Inferred bit-depth: `~12 bits per channel`
- Smallest observed step (across channels): `2.465e-4`
- Falsecolor heatmap screenshot: not captured.

### Verdict

- [x] PASS — `GPUExternalTexture` preserves ≥10-bit precision; proceed with the planned
      `<video>` + `importExternalTexture` pipeline.
- [ ] FAIL — Chrome quantizes; reroute to WebCodecs `VideoDecoder` with manual 10-bit YUV
      unpacking before MVP main work begins.

### Notes / follow-ups

The precision question passed, but the curve question did not match the original assumption.
For a bt709-tagged ramp, `canvas2d.drawImage(video)` stayed near the expected encoded ramp, while
`GPUExternalTexture` produced a display-converted curve. The best candidate among tested
transforms was:

```text
bt709_eotf -> sRGB_oetf
```

Thus, before applying the D-Log M inverse OETF, Pass 1 must recover the original bt709/D-Log
coded values from the GPU sample:

```text
bt709_coded = bt709_oetf(srgb_eotf(gpu_sample))
```

This matches the prior DJI single-pixel probe direction: `canvas2d ≈ 0.302`,
`GPUExternalTexture ≈ 0.342`, where a bt709-to-sRGB display conversion predicts a value closer
to the GPU sample than identity.
