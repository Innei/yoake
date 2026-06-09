# Edit Mode Functionality Design — Cut · Time · Grade · Deliver

Status: design
Builds on: `2026-06-09-edit-mode-framework-design.md`
Author: brainstorm session, 2026-06-09

## Purpose

The edit-mode framework (already shipped) establishes the shell: mode toggle, swap-able left/right panels, sidecar I/O, minimal Marker feature. This spec defines the four real edit verbs that the framework will carry:

- **Cut** — trim and split a source into keep-segments
- **Time** — per-segment speed, freeze, reverse
- **Grade** — per-clip base grade + per-segment override (deeper than view's LUT + exposure)
- **Deliver** — single-clip video export (H.264 / ProRes) and PNG frame extract

These verbs are what justify edit mode existing at all: viewing the clip and tweaking a LUT remains the job of view mode.

## Goals

1. Each verb is the user's mental model — cut means cut, time means change pacing, grade means push pixels, deliver means produce files.
2. Data model is a superset of v1 sidecar; migration is pure and lossless.
3. UI grammar consistent across verbs: selection drives an Inspector; persistent tabs hold workspace-level tools.
4. WebGPU preview pipeline keeps its stable mount across mode changes and re-renders.
5. View mode stays light — it remains the browse-and-preview surface.

## Non-Goals

- Multi-clip sequencing, timeline composition, transitions, titles, PIP — out of scope for a single-clip tool.
- Stabilization, reframe, aspect convert — listed as future verbs but not in this spec.
- Grade keyframe ramping over time — deferred (v2).
- Multi-clip batch export queue, EXR/TIFF frame sequences, watermark/burn-in, H.265 — deferred to project #4.
- Internal structure of CurveSpec / HslSpec / WheelSpec — deferred to the #2 grade brainstorm. This spec defines only the field slots.

## Architecture

### Right Panel: Tabs

Edit mode's right panel uses three tabs:

```
[ Inspect | Grade | Deliver ]
─────
[ active tab content, scrollable ]
```

- **Default tab on entering edit:** Inspect.
- **Selection auto-switch:** half-auto. Selecting from the left outline switches to Inspect. Selecting via a transport handle (segment band, marker dot) does NOT switch tabs — the Inspect content updates silently.
- **Reason:** outline selection is an explicit "I want to edit this thing" gesture; transport handle interaction is often a micro-adjust during grading or delivery prep and shouldn't yank focus.

The three tabs deliberately each own a full vertical area instead of stacking; grading and delivery both benefit from vertical room (scopes, filename preview lists).

### Transport: Two-Layer Visual

Transport grows from current ~40px to ~80–100px to hold:

```
┌──────────────────────────────────────────┐
│ segment bar (~28px)                      │  ← keep segments accent; discard grey;
│ ▰▰▰▰ 0.5×  ▰▰▰  ⏸2s  ▰▰▰▰▰              │    speed/freeze/reverse badges
├──────────────────────────────────────────┤
│ marker dots (~12px)         ◆     ◆      │
├──────────────────────────────────────────┤
│ scrub bar + playhead (~24px)             │
└──────────────────────────────────────────┘
```

The same DOM is mounted in both modes (WebGPU pipeline constraint). Mode affects interactivity, not presence:

- **View mode:** segment bands and marker dots are read-only visualizations of the clip's edit state. Hovering a band shows its speed/playMode in a tooltip. A "Preview cut" toggle in the transport toolbar, when on, makes playback skip discard regions to simulate the export. Default: off (preserves view's "raw source" semantic).
- **Edit mode:** full interactivity — drag segment edges to trim, right-click to open the action menu, keyboard shortcuts active, selection updates the outline + Inspect.

### Left Outline: Grouped by Type

In edit mode the left panel shows:

```
▼ Segments (3)
    00:00:30 — 00:01:00   normal
    00:02:15 — 00:02:45   0.5× slow
    00:04:00 — 00:04:30   reverse

▼ Markers (8)
    00:00:42   hero shot
    00:01:15
    ...
```

- Sections grouped by type (Segments first, Markers second). Each header shows count and is collapsible.
- Grade / LUT layers are NOT in the outline — they are properties, surfaced in the Inspect / Grade tabs based on selection.
- Future types (keyframes, regions) extend by adding new sections, keeping the grammar stable.

### View Inspector: Shallow Subset

To keep view light, the view-mode Inspector retains only:

- LUT picker (+ opacity slider)
- Exposure

Render mode and HDR section move out of the per-clip Inspector — they are viewer-global preview config and belong in a viewer config surface (toolbar / settings dropdown), not in per-clip state.

Edit mode's Grade tab is a strict superset of view's Inspector: same LUT + exposure controls at the top, with curves / HSL / wheels / scopes added below. The underlying state lives in a single store, so view and edit see the same values.

## Data Model

### Sidecar v2

```ts
type SidecarV2 = {
  version: 2;
  markers: Marker[];
  segments: Segment[];
  baseGrade: GradeState;
};

type Marker = {
  id: string;
  time: number;
  label: string;
  color?: string;
};

type Segment = {
  id: string;
  in: number;
  out: number;
  playMode: 'normal' | 'reverse' | 'freeze';
  speed: number;
  freezeDurationSec?: number;
  label?: string;
  gradeOverride?: Partial<GradeState>;
};

type GradeState = {
  lutId?: string;
  lutOpacity?: number;
  exposure?: number;
  contrast?: number;
  wb?: number;
  tint?: number;
  curves?: CurveSpec;
  hsl?: HslSpec;
  wheels?: WheelSpec;
};

type CurveSpec = unknown;
type HslSpec = unknown;
type WheelSpec = unknown;
```

### Field Semantics

- `segment.in` / `segment.out`: seconds, relative to source start. `in < out`.
- `segment.playMode`:
  - `normal`: plays forward at `speed` (default 1.0).
  - `reverse`: plays backward at `|speed|`.
  - `freeze`: source frame at `in` is held for `freezeDurationSec`; speed is ignored.
- `segment.gradeOverride`: a `Partial<GradeState>`. Fields not present inherit from `baseGrade`. A `null`/missing override means "fully inherit base."
- `baseGrade.lutOpacity`: 0–1, where 1 = full LUT, 0 = bypass.

### Validity Rules

- `segments[i].in < segments[i].out` for all `i`.
- Segments are pairwise non-overlapping when sorted by `in`.
- All segment times within `[0, clip.duration]`.
- Markers can be anywhere in `[0, clip.duration]`, including inside discard regions.
- `segments.length === 0` is the implicit "entire source is keep" state — the natural state before any cut edit. Export treats this case as a single source-length segment with default playMode.

### Migration v1 → v2

Pure function (no I/O, no async):

```ts
function migrateV1ToV2(v1: SidecarV1): SidecarV2 {
  return {
    version: 2,
    markers: v1.markers,
    segments: [],
    baseGrade: {},
  };
}
```

Round-trip: reading v1 and writing v2 is non-destructive. Old clients reading v2 will fail-fast on version mismatch (no v2 → v1 downgrade attempted).

## Interactions

### Action Menu (Right-Click)

On a segment band:
- Split here (at right-click position)
- Set speed → submenu: 0.25× / 0.5× / 0.75× / 1× / 1.5× / 2× / 4× / Custom…
- Set playMode → Normal / Reverse / Freeze
- Add grade override (toggles `gradeOverride: {}` on)
- Jump to in / Jump to out
- Delete segment

On a discard region:
- Add segment from here to …
- Add marker here

On a marker dot:
- Edit label
- Jump to time
- Delete

### Keyboard

| key | action |
|---|---|
| Space | play / pause |
| J / K / L | reverse / pause / forward (NLE convention) |
| I / O | set in / out at playhead (extends nearest segment, or creates one) |
| S | split at playhead |
| M | add marker at playhead |
| Del / Backspace | delete selected outline item |
| ← / → | seek ±1 frame |
| Shift+← / Shift+→ | seek ±10 frames |
| E | toggle edit mode (existing) |
| Esc | clear selection / exit edit (existing) |

### Drag

- Drag segment edge handle: adjust trim point. Snapped to nearest frame; also snaps to nearest marker within 4px.
- Drag never crosses a neighboring segment (validity is enforced).
- Drag while holding `Alt`: slip — adjusts both edges by the same amount (slides the window over the source).

### Inspect Tab Content

Inspect routes by `outlineSelection`:

**Clip-level (default, no selection):**
- Filename, path, directory
- Duration, fps, resolution, bitrate, colorspace, HDR metadata
- Edit stats: `N segments · M markers · output duration W.Ws (after speed)`
- `Open file location` / `Reveal in Finder` buttons

**Marker selection:**
- Time (HH:MM:SS.mmm, frame-precise)
- Label input
- Color picker (small swatch list)
- `Jump to time` · `Delete`

**Segment selection:**
- In / Out (twin numeric inputs, HH:MM:SS.mmm)
- Duration (readonly, computed)
- PlayMode radio (Normal / Reverse / Freeze)
- Speed (when Normal / Reverse): preset chips `0.25× 0.5× 0.75× 1× 1.5× 2× 4×` plus a numeric input for off-preset values
- FreezeDurationSec (when Freeze): numeric input
- Label input (optional)
- `Grade override` toggle (when enabled, switches to Grade tab with override active)
- Actions: `Split here` · `Delete segment` · `Jump to in` · `Jump to out`

Future selection types (LUT layer in #2, Keyframe in v2) plug into the same router.

### Grade Tab

This spec defines the slot only; the full grade UI is brainstormed in #2.

MVP slot content for this round:
- LUT picker + opacity (moved from view Inspector — shared store)
- Exposure
- Header indicates the active scope: "Base grade" or "Override · segment 00:02:15–00:02:45". Override scope has a `Reset to base` action; base scope shows the segment-override pill if the selected segment has an override.
- Empty state with no segment-override active: "Base grade · select a segment to override".

#2 extends with curves, HSL, wheels, scopes, white-balance picker.

### Deliver Tab

**Output settings:**
- Container/codec: H.264 .mp4 (default) | ProRes 422 .mov
- Resolution: source (default) | 1080p | 4K | custom
- Colorspace: Rec.709 (LUT baked) | Rec.2020 HDR
- Audio: passthrough (only option for MVP)

**Bake toggles (all default ON):**
- Apply trim/segments (no-op when `segments.length === 0`)
- Apply speed/playMode
- Apply grade (base + override)

**Output mode:**
- Single (ripple): all keep-segments concatenated → `<basename>_edit.<ext>`
- Multi: one file per segment → `<basename>_seg01.<ext>` ...
- Live filename preview list updates as toggle / segments change.

**Output location:**
- Reads from `usePrefsStore.exportDirHandle`.
- `Change folder` button re-picks.

**Actions:**
- `Export` button — inline progress bar + completion toast with `Reveal` action.
- `Frame extract` button — saves PNG of current frame at source resolution to the same output folder, `<basename>_<HH-MM-SS-mmm>.png`.

## Transitions

| trigger | animation | duration | easing |
|---|---|---|---|
| view ↔ edit (sidebar swap + transport height) | crossfade + height tween | 240ms | ease-in-out |
| right panel tab switch | content crossfade | 150ms | ease-out |
| Inspect content swap on selection change | crossfade | 120ms | ease-out |
| transport segment add/remove | scale + fade | 180ms | ease-out |
| marker dot add/remove | pop-in (scale 0→1) | 150ms | ease-out |
| speed badge change | crossfade | 100ms | linear |
| segment edge drag | none — must track cursor | — | — |
| playhead move | none | — | — |

Implementation:
- Library: `motion` (formerly framer-motion).
- Respect `prefers-reduced-motion`: disable transforms, keep opacity changes only.
- View Transitions API is acceptable for full DOM swaps where DOM is fully replaced (e.g., the sidebar swap), but motion remains the primary tool for component-level transitions.

## Cross-Cutting

### Empty States

- Outline (no segments, no markers): "No edits yet — split with `S`, add a marker with `M`."
- Inspect Clip-level (no edits): shows file metadata only, edit-stats line says "no segments · no markers."
- Grade tab (no override on selected segment): "Base grade · select a segment to override."
- Deliver before any segments: filename preview says "Source video will export entirely."

### Toasts

- Split: "Split at 00:01:23.456" (1.5s)
- Delete segment: "Segment deleted" with `Undo` action (5s lifetime, undo restores)
- Delete marker: "Marker deleted" with `Undo` action
- Export start: silent (progress bar is the indicator)
- Export complete: "Exported 3 files to <folder>" with `Reveal` action
- Frame extract: "Frame saved" with `Reveal` action

### Accessibility

- Every interactive control has `aria-label` or visible label.
- Tab nav (Inspect / Grade / Deliver) is keyboard-accessible: `Tab` to focus, `←/→` to switch between tabs.
- Outline rows are keyboard-focusable; arrow keys move within a section, `Tab` jumps between sections.
- Drag handles on transport segments have keyboard equivalents (Inspect numeric inputs).

## Render Pipeline Notes

Open for implementation but flagged here so the plan reserves time:

- **Per-segment grade override during playback:** the render uniform buffer must update when the playhead crosses a segment boundary into a segment with an override. Cheapest path: pre-resolve `(time → effective GradeState)` lookup at segment-change events; pass the effective state to the existing WebGPU pipeline.
- **Speed playback:** the player driver advances source time at `speed` rate when in `normal`/`reverse`; for `freeze`, source time is pinned to `segment.in` while wall clock advances `freezeDurationSec`. When "Preview cut" is on, playback jumps to the next segment's `in` on reaching the current segment's `out`.
- **Export pipeline:** needs investigation. Candidates: FFmpeg-WASM (broad codec support, large bundle) vs `VideoEncoder` Web Codecs API (native, Chromium, narrower codec set). ProRes via Web Codecs is not standard — likely needs FFmpeg-WASM for the ProRes path. This is the largest implementation unknown.

## Rollout

Recommended implementation order (each step independently shippable to main):

1. **Sidecar v2 schema + migration** (data model foundation; pure, testable)
2. **Segments CRUD in store** (add/delete/update/split) — no UI yet, tests only
3. **Outline Segments section** + **SegmentInspector** + `S` key + right-click split + drag handles on transport
4. **Time verb** — playMode toggle, speed preset chips, freeze/reverse — UI + playback driver respects per-segment time properties
5. **View Inspector slim-down** + render-mode/HDR migration to viewer-config surface
6. **Grade tab skeleton** with LUT + exposure (move from view Inspector to be shared); base/override scope header
7. **Per-segment grade override** toggle + render pipeline plumbing
8. **Deliver tab UI** (settings + bake + mode toggle + filename preview)
9. **Export pipeline** — investigate FFmpeg-WASM vs Web Codecs; pick one; implement single-mode export first, then multi-mode
10. **Frame extract** (small, mostly canvas → PNG)
11. **Transitions pass** — install `motion`, add tab/inspector/transport transitions, respect reduced-motion

Steps 1–4 form a coherent shippable slice (cut + time without grade or export — markers stay as they are). Steps 5–7 form the grade slice. Steps 8–10 form the deliver slice. Step 11 polishes throughout.

## Open Questions

Deferred to the #2 grade brainstorm:
- Internal structure of CurveSpec / HslSpec / WheelSpec
- Scopes (waveform / vectorscope / histogram) implementation
- White balance picker UX
- Color match between segments

Deferred to the implementation plan:
- Concrete keyboard map conflict resolution with browser defaults (e.g., `S` while a text input is focused)
- Undo/redo scope — local per-action or session-wide stack
- Snap thresholds and feel during drag
- Export progress reporting granularity
- Output filename templating beyond the two default schemas
