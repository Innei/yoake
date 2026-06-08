# dji-lut

A local-only web tool for restoring DJI **D-Log M** footage and exporting **Ultra HDR JPEG** stills that bloom in macOS Photos and on iPhone.

Open a DJI clip, apply the official D-Log M → Rec.709 `.cube` LUT, dial in exposure, and save the current frame as an ISO 21496-1 Ultra HDR JPEG — entirely client-side, no upload step.

## Features

- **Real HDR preview** on HDR-capable displays via a WebGPU `rgba16float` canvas with extended tone mapping. What you see on screen is what the exported gainmap reconstructs.
- **Official DJI D-Log M restoration** — forward OETF, 3D `.cube` LUT, sRGB output, all on the GPU.
- **Ultra HDR JPEG export** through a WASM build of Google's `libultrahdr`. SDR base + per-pixel luminance gainmap, MPF/XMP/ICC metadata round-trips through macOS Photos, iOS Photos, and Google Photos.
- **SDR JPEG fallback** auto-engages when WebGPU HDR is unavailable.
- **File System Access** — pick a DJI clip directory and a LUT directory once, handles persist in IndexedDB.
- **Session restore** — last clip, last LUT, exposure, HDR settings come back on reload.
- **Frame-stepping transport** — `Space`, `J/K/L`, `← / →`, `Home / End`. Frame export with `⌘S`.

## Requirements

> [!IMPORTANT]
> This tool targets **macOS Chrome with WebGPU enabled** on an HDR-capable display (MacBook Pro mini-LED XDR, Pro Display XDR, recent iMacs). The HDR preview path is gated on `matchMedia('(dynamic-range: high)')` and the WebGPU `extended` tone-mapping mode actually being honored by the browser.

> [!NOTE]
> Safari, Firefox, Linux, and Windows are not supported in MVP. On SDR-only setups the app still runs, but Ultra HDR export is disabled with a tooltip explaining which capability is missing.

Source clips: HEVC Main 10 (yuv420p10le), as written by DJI Action / Osmo cameras in D-Log M mode (`*_D.MP4`).

## Getting started

```sh
pnpm install
pnpm dev
```

Then open the printed `localhost` URL in macOS Chrome.

To produce a production bundle:

```sh
pnpm build
pnpm preview
```

## Usage

1. **Pick a clip folder** (`⌘O`) — the DJI directory containing `*_D.MP4` files.
2. **Pick a LUT folder** from the inspector — point it at DJI's official `.cube` LUTs (or any folder of `.cube` files).
3. **Select a clip** from the list. The preview engages on an HDR canvas.
4. **Tune exposure** and **HDR peak nits** (400 / 600 / 1000) in the inspector. Use `[` / `]` to flip between LUTs.
5. **Pause on the frame you want**, then `⌘S` to export.

Output filename: `<clip>_<frameMs>_<lut>.jpg` written to the chosen export directory.

## Keyboard shortcuts

| Section        | Keys                       | Action                            |
| -------------- | -------------------------- | --------------------------------- |
| Playback       | `Space`                    | Play / pause                      |
|                | `← / →` · `Shift+← / →`    | Step 1 / 10 frames                |
|                | `J / K / L`                | Back / pause / forward            |
|                | `Home / End`               | Jump to start / end               |
| Clips & LUTs   | `↑ / ↓`                    | Previous / next clip              |
|                | `[ / ]`                    | Previous / next LUT               |
|                | `⌘O`                       | Open clip folder                  |
|                | `0`                        | Reset exposure                    |
| Layout         | `⌘B` · `?`                 | Toggle inspector · show shortcuts |
| Export         | `⌘S` · `⌘C`                | Export · copy frame to clipboard  |

## How it works

Per-frame pipeline. The preview renders the *reconstructed Ultra HDR result* — the same image the exported JPEG reproduces on an HDR viewer.

```
<video> ─ rVFC ─► GPUExternalTexture
                          │
                          ▼
   Pass 1  sceneLinear   (rgba16float, scene-linear master)
                          │
              grading (exposure, …)
                          │
        ┌─────────────────┴──────────────────┐
        ▼                                    ▼
   Pass 2  lutSdrBase                  scene-linear extended
   D-Log M OETF → 3D LUT → sRGB rgba8
        │                                    │
        └─────────────────┬──────────────────┘
                          ▼
   Pass 3  hdrCompose
   gain = clamp(srcLuma / sdrLuma, 1.0, peakHeadroom)
   hdrLin = sdrLin * gain        (LUT owns hue/sat; gain lifts luma only)
                          │
                          ▼
                HDR canvas (preview)
                          │
                          ▼
   Pass 4  gainmap (export only)
   log2(hdrLin / sdrLin) → normalize → rgba8 grayscale
                          │
                          ▼
                  libultrahdr (WASM)
                          │
                          ▼
                Ultra HDR JPEG file
```

The gainmap moves luminance only — hue and saturation come entirely from the LUT, which is what keeps the single-channel encoder faithful. See [`docs/superpowers/specs/2026-06-08-dji-lut-tool-design.md`](docs/superpowers/specs/2026-06-08-dji-lut-tool-design.md) for the full color-pipeline derivation.

## Stack

- **React 19** · **TypeScript** · **Vite 8** · **React Compiler**
- **WebGPU** for all per-frame work — scene-linear decode, LUT lookup, gainmap compute
- **libultrahdr** (WASM, via `open-ultrahdr` + `open-ultrahdr-wasm`) for ISO 21496-1 encoding
- **Zustand** + **Jotai** for state, **IndexedDB** (`idb-keyval`) for `FileSystemDirectoryHandle` persistence
- **TailwindCSS v4** + **@pastel-palette/tailwindcss** theming, **next-themes** for light/dark
- **Vitest** + **@testing-library/react** for unit / component tests

## Project layout

```
src/
├─ app/          React shell — Layout, Preview, Transport, Inspector, ExportPanel
├─ gpu/          WebGPU lifecycle, capability detection, pipelines, WGSL shaders
├─ decode/       <video> + requestVideoFrameCallback wrapper
├─ color/        D-Log M OETF, .cube parser, 3D LUT textures, color math
├─ fs/           File System Access — clip scanner, LUT loader, handle persistence
├─ export/       Offscreen render + Ultra HDR JPEG / SDR JPEG writers
├─ state/        Zustand stores — clips, edit, gpu, prefs, layout, toast
├─ components/   UI primitives
├─ pages/        File-based routes (vite-plugin-route-builder)
└─ styles/       Tailwind + Pastel theme

spikes/          GPUExternalTexture precision (A) and Ultra HDR round-trip (B) test apps
docs/            Design spec + spike reports
tests/           Vitest setup, fixtures (DJI .cube LUT, OETF value pairs)
```

## Scripts

| Script                       | Does                                  |
| ---------------------------- | ------------------------------------- |
| `pnpm dev`                   | Start the dev server                  |
| `pnpm build`                 | Typecheck + production build          |
| `pnpm preview`               | Serve the production build            |
| `pnpm test` · `test:watch`   | Run / watch Vitest unit suites        |
| `pnpm typecheck`             | TypeScript only                       |
| `pnpm lint` · `lint:fix`     | ESLint                                |
| `pnpm format`                | Prettier                              |
| `pnpm spike:a` · `spike:b`   | Run the validation spike apps         |

## Non-goals

> [!NOTE]
> Out of scope for MVP: batch export, video export, frame-accurate WebCodecs seeking, multi-LUT compare, real-time scopes, custom curve editors, HEIC / AVIF / 16-bit PNG export, and any browser beyond macOS Chrome.
