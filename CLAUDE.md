# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Yoake — a local-only web darkroom for DJI D-Log M footage. Applies the official `.cube` LUT on the GPU, previews real HDR on a WebGPU `rgba16float` canvas, and exports Ultra HDR JPEG stills (ISO 21496-1) and WebCodecs-encoded video. Everything runs client-side; macOS Chrome with WebGPU on an HDR display is the only supported target. License: AGPL-3.0.

## Commands

```sh
pnpm dev                  # Vite dev server
pnpm build                # tsc -b + vite build
pnpm test                 # vitest run (all suites)
pnpm vitest run src/lib/color/dlogM.test.ts   # single test file
pnpm vitest run -t "name"                     # single test by name
pnpm typecheck            # tsc --noEmit
pnpm lint / lint:fix      # eslint (@lobehub/eslint-config)
pnpm format               # prettier
```

Vitest runs in jsdom with `tests/setup.ts` (fake-indexeddb). Tests are colocated: `src/lib/**` uses sibling `*.test.ts`, `src/features/**` uses `__tests__/` directories. Fixtures (DJI `.cube` LUT, OETF value pairs) live in `tests/fixtures/`.

## Architecture

### GPU render pipeline (the core)

`src/lib/gpu/` holds Device/HdrCanvas/capability detection, render pipelines in `pipelines/`, WGSL in `shaders/`. The per-frame chain is orchestrated by `src/features/preview/previewRenderer.ts`:

1. **sceneLinear** — `<video>` GPUExternalTexture → scene-linear `rgba16float` master (grading applied here)
2. **lutSdrBase** — D-Log M OETF → 3D LUT → sRGB `rgba8` SDR base (`rawDlogPreview` is the LUT-bypass render mode)
3. **hdrCompose** — `gain = clamp(srcLuma / sdrLuma, 1, peakHeadroom)`; the gain lifts luminance only — hue/saturation are owned entirely by the LUT. Output goes to the HDR canvas.
4. **gainmap** (export only) — `log2(hdrLin / sdrLin)` → normalized grayscale gainmap

The preview shows the *reconstructed Ultra HDR result* — the same image the exported JPEG reproduces. Intermediate textures are capped at 1920×1080. The HDR path is gated on `matchMedia('(dynamic-range: high)')` plus WebGPU `extended` tone mapping (`lib/gpu/caps.ts`); SDR fallback engages otherwise.

### Color science

`src/lib/color/` — `dlogM.ts` (OETF/inverse), `lutCube.ts` (.cube parser), `lutTexture.ts` (3D texture upload), `colorMath.ts`. Pure functions with tests asserting known value pairs from fixtures — change with care.

### Export

- **Stills**: `src/lib/export/` — `render.ts` does an offscreen full-resolution render, `ultraHdrJpeg.ts` computes the gainmap, then `ultraHdrContainer.ts` + `iso21496.ts` assemble the Ultra HDR JPEG container (MPF + ISO 21496-1 APP2 + XMP) by hand — there is **no libultrahdr/WASM dependency**. `sdrJpeg.ts` is the SDR fallback.
- **Video**: `src/lib/export/encoder/` — WebCodecs + mediabunny. `webcodecs/encodeDirect.ts` repackages source packets when no grading needs baking; `webcodecs/encodeGraded.ts` re-renders every frame through the GPU pipeline (via `grabFrame`) and encodes through `mp4Writer.ts`. `frameSource.ts` plans frame timing across segments (trim, speed, reverse, freeze).

### State & persistence

- Zustand stores live inside their owning feature (`features/edit/editStore.ts`, `features/clips/clipsStore.ts`, `features/deliver/deliverStore.ts`, `features/preview/gpuStore.ts`, `components/layout/layoutStore.ts`, …) — there is no central state directory.
- `FileSystemDirectoryHandle`s persist in IndexedDB via idb-keyval (`lib/fs/handleStore.ts`); sessions restore from there.
- Per-clip edit state (markers, segments with play modes and per-segment grade overrides, grade settings) persists as a sidecar file next to the clip — schema and `SIDECAR_VERSION` in `lib/fs/clipSidecar.ts`.

### App structure

- `src/features/*` are vertical slices (store + components + hooks per domain: clips, timeline, preview, grade, edit, deliver, preferences, shortcuts, theme). Shared UI primitives in `src/components/ui/`, app shell in `src/components/layout/`.
- Routes are generated: vite-plugin-route-builder scans `src/pages/` into `src/generated-routes.ts` — never hand-edit that file.
- Path alias `~` → `src/`.
- React Compiler is enabled (babel preset in `vite.config.ts`) — do not hand-memoize with `useMemo`/`useCallback`/`memo` for performance.
- Keyboard shortcuts are centralized in `features/shortcuts/shortcuts.ts`.

## Design docs

`docs/superpowers/specs/` contains dated design documents for major subsystems (color pipeline derivation, edit mode, WebCodecs export, timeline compound component). Read the relevant spec before reworking a subsystem.
