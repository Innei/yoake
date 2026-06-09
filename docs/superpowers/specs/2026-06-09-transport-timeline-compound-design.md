# Transport timeline: compound component on Base UI Slider

Date: 2026-06-09
Status: Approved (brainstorming complete; ready for implementation plan)

## Summary

Refactor the inner timeline at `src/app/Transport.tsx:209–260` (the `transport-timeline` div) into a compound component family under `src/app/transport/timeline/`, built on top of `@base-ui/react`'s `Slider`. Redesign the marker dot from a top-aligned circle into a teardrop pin that visually attaches to the track. Existing surrounding controls (timecode column, transport buttons, volume, inspector toggle, frame readouts) are untouched.

## Goals

1. Replace the hand-rolled hidden `<input type="range">` scrubber with Base UI `Slider`, gaining keyboard, ARIA, pointer-capture, and a single source of truth for x↔time geometry.
2. Eliminate duplicate `clientX → time` math (today both `Transport.tsx` and `SegmentLayer.tsx` do it).
3. Componentize the timeline into named, composable subparts (`Timeline.Root`, `Timeline.Track`, `Timeline.Progress`, `Timeline.SegmentLayer`, `Timeline.MarkerLayer`, `Timeline.Playhead`) so future layers (chapters, waveform, etc.) drop in without surgery in the parent.
4. Redesign the marker visual so a marker's screen position unambiguously corresponds to its time on the centered track.

## Non-goals (out of scope)

- Duplicate frame readout (left timecode block vs right `frameInSecond/fps f`).
- Timeline zoom / multi-row layout.
- Density of the surrounding 52px footer row (volume, inspector toggle, preview-cut placement, view settings popover).
- `src/components/ui/slider.tsx` (used by HDR / Exposure controls) — different concern, stays as-is.
- Segment band, playhead dot, and progress fill visual styling — kept 1:1.

## Architecture

Compound component family. `Timeline.Root` is the public entry; subparts read shared geometry from a context.

```
<Timeline.Root
  value={currentTime}
  duration={duration}
  fps={fps}
  readOnly={!isEdit}
  onChange={setCurrentTime}
>
  <Timeline.Track>
    <Timeline.Progress />
    <Timeline.SegmentLayer />
    <Timeline.MarkerLayer />
    <Timeline.Playhead />
  </Timeline.Track>
</Timeline.Root>
```

### Responsibilities

| Subpart | Owns |
|---|---|
| `Timeline.Root` | Wraps Base UI `Slider.Root` + `Slider.Control`. Provides `TimelineContext`. Forwards `data-testid`. Hosts the `focus-within` ring styling. |
| `Timeline.Track` | Base UI `Slider.Track`. Renders the 4px grey track. Sets `trackRef` in context. |
| `Timeline.Progress` | Base UI `Slider.Indicator`. Accent fill from 0 → current value. No manual width math. |
| `Timeline.SegmentLayer` | Existing segment bands, edge trim handles, segment context menu, empty-area "Add marker here" context menu. Consumes `TimelineContext`. |
| `Timeline.MarkerLayer` | New teardrop-pin marker renderer. Same data source (`clipDataStore`). Same right-click menu (Jump to time / Delete). |
| `Timeline.Playhead` | Base UI `Slider.Thumb`, styled as today's 14px accent dot. Inherits ARIA `role="slider"`, `aria-valuenow/min/max`, and keyboard. |

## TimelineContext

```ts
interface TimelineContextValue {
  duration: number;             // seconds
  fps: number;                  // for snap math
  readOnly: boolean;
  trackRef: React.RefObject<HTMLDivElement | null>;
  timeToPercent: (time: number) => number;  // 0..100, clamped
  clientXToTime: (clientX: number) => number | undefined;
}
```

`clientXToTime` is the single implementation, using `trackRef.current.getBoundingClientRect()`. SegmentLayer deletes its own copy. `timeToPercent` is used by SegmentLayer (band `left`/`width`) and MarkerLayer (pin `left`).

## File layout

```
src/app/transport/timeline/
├── index.ts             // export const Timeline = { Root, Track, Progress, SegmentLayer, MarkerLayer, Playhead }
├── context.ts           // TimelineContext + useTimeline()
├── Root.tsx
├── Track.tsx
├── Progress.tsx
├── Playhead.tsx
├── SegmentLayer.tsx     // moved from src/app/transport/SegmentLayer.tsx
├── MarkerLayer.tsx      // rewritten — teardrop pin
└── __tests__/           // existing transport tests follow the move
```

The existing `src/app/transport/ViewSettingsPopover.tsx` stays at its current path (it belongs to the surrounding footer row, not the timeline).

## Marker pin visual spec

Teardrop pin sitting above the track, anchored by a short vertical tick that lands on the track's top edge.

All measurements relative to the 36px-tall timeline container; track is 4px tall centered at y=16..20.

| Element | Size | Position | Style |
|---|---|---|---|
| Head | 10×10 circle | `top: 2px`, centered on time | `bg-yellow-400`, outline `ring-1 ring-black/40` |
| Tick | 1×4 line | `top: 12px`, centered on time | same yellow |
| Hit zone | 16×20 invisible box | centered on time | `z-30`, `pointer-events: auto` |

### States

- **Default**: as above.
- **Hover**: head → 12×12, `bg-yellow-300`, soft glow `ring-3 ring-yellow-300/18`.
- **Selected**: outer ring `ring-2 ring-accent` (matches segment selection cue).
- **Read-only** (`!isEdit`): opacity 0.6, `cursor-default`, no hover, no selection ring, no context menu.

### Stacking and interaction

- `z-30` — above segment bands (`z-20`), below playhead (`z-40`). Same as today.
- Pin `onPointerDown` calls `stopPropagation()` so a click on a marker does not trigger Slider scrub.
- Right-click → existing context menu (Jump to time, Delete). Unchanged.
- A marker positioned inside a segment band remains legible because the pin head sits above the band's row.

## Migration plan

### SegmentLayer

Behavior preserved 1:1. Structural changes only.

Removed:
- Local `trackRef` and `<div ref={trackRef}>` wrapper.
- Local `computeTimeFromClientX` (replaced by `useTimeline().clientXToTime`).

Added:
- `const { clientXToTime, readOnly } = useTimeline();` at the top.
- `onPointerDown={(e) => e.stopPropagation()}` on:
  - the `SegmentBand` body button (so clicking a band does not scrub),
  - both trim handles (so dragging an edge does not scrub).
- `readOnly` no longer comes from the `readOnly` prop on `SegmentLayer`; it's read from context. The prop is removed.

Empty-area `ContextMenuTrigger` keeps its current position (`absolute inset-0 z-0` inside the SegmentLayer's outer div). Right-click reaches it because mouse-button-driven scrubbing in `Slider.Control` only reacts to primary button (`button === 0`); implementer should verify this against the installed `@base-ui/react` version and, if needed, add a guard (`onPointerDownCapture` that returns early for non-primary buttons) on the outer SegmentLayer div.

### MarkerLayer

Rewritten to match the visual spec above. Same data source (`clipDataStore.entries[clipId].markers`). Same actions (jump-to-time, delete, select). `readOnly` from context, not prop. The `MarkerDot` subcomponent is replaced by `MarkerPin` with the new shape.

### Transport.tsx call-site

`src/app/Transport.tsx:209–260` collapses from the existing decorative-divs + hidden-input stack to:

```tsx
<div className="flex h-full min-w-0 flex-1 items-center">
  <Timeline.Root
    data-testid="transport-timeline"
    value={currentTime}
    duration={duration}
    fps={fps}
    readOnly={!isEdit}
    onChange={setCurrentTime}
  >
    <Timeline.Track>
      <Timeline.Progress />
      <Timeline.SegmentLayer />
      <Timeline.MarkerLayer />
      <Timeline.Playhead />
    </Timeline.Track>
  </Timeline.Root>
</div>
```

The `focus-within:ring-2 focus-within:ring-accent/40 focus-within:ring-offset-1` styling moves into `Timeline.Root`. The `h-9 w-full rounded-sm` sizing also moves in.

The window-level keyboard listener in `Transport.tsx` (Space toggle play; ←/→ frame step with Shift-stride and play-state guard) stays as the source of truth for arrow-key stepping. Implementation note: today's hidden `<input type="range">` lost the default ←/→ step because `preventDefault()` on the window listener (bubble phase) was enough — the input's behavior was browser-default, suppressible. Base UI `Slider.Thumb` attaches its own keydown handler at the element level, which fires before the window bubble listener. To avoid double-step:

- Either flip the window listener to capture phase (`window.addEventListener('keydown', onKey, true)`) and add `event.stopPropagation()` before `preventDefault()` for ArrowLeft/ArrowRight; this prevents Slider.Thumb from ever seeing the event.
- Or set `Slider.Root`'s `largeStep`/`step` to a value compatible with `1/fps` and remove the window listener's frame-step branch (but this loses the Shift-stride and play-state guard, which is undesirable).

The first option is preferred. Add a test (item 4 below) to lock in single-step behavior.

### Cleanup

- Delete `src/app/transport/SegmentLayer.tsx` and `src/app/transport/MarkerLayer.tsx` (moved into `timeline/`).
- Update imports in `Transport.tsx` and any test files.
- Drop the `readOnly` prop from `SegmentLayer` and `MarkerLayer` public APIs.

## Testing

Existing transport tests move with the files and have their imports retargeted. Add the following:

1. **`Timeline.Root` context smoke**: renders without a duration, then with a duration; `clientXToTime` returns a value proportional to a synthesized `getBoundingClientRect`.
2. **`Timeline.MarkerLayer` visual states**: render markers; assert classes / data-attributes for default, selected, and read-only states.
3. **Click-vs-scrub regression**: with a segment band rendered at 20–40% of the timeline, simulate `pointerdown` on the band and on empty area at 60%; assert `setCurrentTime` is called only for the empty-area pointerdown.
4. **Keyboard scrubbing not double-stepped**: simulate ArrowLeft once; assert `setCurrentTime` called once (not twice — the Transport window listener should `preventDefault` before Slider.Thumb sees it).

## Open implementation notes (non-blocking)

- The Base UI `Slider` API confirmed via `@base-ui/react@^1.5.0` (already in `package.json`). If the actual import path turns out to be `@base-ui-components/react` or similar, the implementer adjusts; the architecture is unaffected.
- `Timeline.Root`'s `onChange` is wired to `Slider.Root`'s `onValueChange`. The value semantics are seconds (same units as `currentTime`).
- The `data-testid="transport-timeline"` placement preserves existing E2E selectors.
