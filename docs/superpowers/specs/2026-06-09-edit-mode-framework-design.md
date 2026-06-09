# Edit Mode Framework — Design

**Date:** 2026-06-09
**Scope:** The shell on which future clip-editing features hang. No export pipeline changes. No new color features. No segment/trim/split data model.

## Goals

1. Introduce a global **edit mode** state, mutually exclusive with the current "view" mode.
2. Both sidebars swap content when edit mode is active; the preview canvas and transport stay mounted to preserve WebGPU state.
3. Right-sidebar content in edit mode is **selection-driven** by an outline of the active clip (the active clip's markers in v1; segments come later).
4. Ship the smallest feature that exercises mode switching end-to-end: per-clip **markers** (time + label, add/delete/rename), persisted as a sidecar JSON file next to the clip.
5. Leave well-defined seams for future features (#2 grading expansion, #3 trim/split, #4 batch frame export, #5 video re-encode).

## Non-goals (this spec)

- Segments / trim / split data model or UI.
- Extended color grading (curves, contrast, saturation, white balance).
- Batch frame export, video re-encode, segment-scoped export.
- Timeline overlay in transport (marker pips, segment chips).
- Auto-resume of edit mode on reload.
- Keyboard-driven outline navigation (mouse-first in v1).
- IndexedDB-backed marker store (sidecar JSON is the only source of truth).

## Vocabulary

- **Mode** — `'view' | 'edit'`. Global, stored in `editModeStore`.
- **Active clip** — `clipsStore.selectedClipId`. Required for edit mode entry.
- **Outline** — left-sidebar tree in edit mode. v1 has one section: **Markers**.
- **Outline selection** — what the user has highlighted in the outline. v1 shape: `{ kind: 'none' } | { kind: 'marker'; id: string }`. Drives the right-sidebar context panel.
- **Context panel** — the right-sidebar panel whose content depends on outline selection. v1: `ClipContextPanel` (default) and `MarkerContextPanel`.
- **Sidecar** — `<clipBaseName>.djilut.json` written into the clip directory. Authoritative source for per-clip edit data.

## Architecture

```
Shell                                  (src/app/Shell.tsx — refactor of Layout.tsx)
├── LeftSidebar                        (mode-aware wrapper)
│   ├── ViewLeftPanel  (mode='view')   ─→ ClipList (unchanged)
│   └── EditLeftPanel  (mode='edit')   ─→ ClipSwitcher + Outline + Done button
├── Preview                            (stable mount; WebGPU/video preserved)
├── RightSidebar                       (mode-aware wrapper)
│   ├── ViewRightPanel (mode='view')   ─→ Inspector + ExportPanel (unchanged composition)
│   └── EditRightPanel (mode='edit')   ─→ ContextPanel + ContextExportAction
└── Transport                          (stable mount)
```

The grid template is a single 3-column × 2-row CSS grid owned by `Shell`. Only the contents of the left and right cells are swapped on mode change. Preview and Transport never unmount across mode transitions, which preserves the WebGPU device, external textures, and HTMLVideoElement state.

### Mode toggle entry points

- Button at the top of the left sidebar — labeled **Edit** (view) / **Done** (edit). A second **Done** is mirrored at the top of the right sidebar in edit mode, so the user can exit from either side.
- Keyboard:
  - `E` toggles mode (no-op if no clip is selected).
  - `Esc` in edit mode: if an outline item is selected, deselect; if nothing is selected, exit edit mode.
- The button is disabled (with tooltip "Select a clip first") when `selectedClipId` is undefined.

### Reload guard

When `mode === 'edit'`, `Shell` mounts a `beforeunload` listener that calls `event.preventDefault()`. The browser shows its default reload-confirmation dialog. After confirming, the page reloads and starts in `view` mode (no auto-resume).

## State

### New: `editModeStore` (`src/state/editModeStore.ts`)

```ts
type OutlineSelection =
  | { kind: 'none' }
  | { kind: 'marker'; id: string }

interface EditModeState {
  mode: 'view' | 'edit'
  outlineSelection: OutlineSelection
  enter: () => void          // no-op if no clip selected
  exit: () => void
  toggle: () => void
  selectMarker: (id: string) => void
  clearSelection: () => void
}
```

Not persisted. Defaults to `mode: 'view'`, `outlineSelection: { kind: 'none' }`.

### New: `clipDataStore` (`src/state/clipDataStore.ts`)

Authoritative in-memory mirror of sidecar files for clips that have been loaded since session start. Not persisted to IndexedDB — the sidecar JSON is the source of truth.

```ts
interface Marker {
  id: string         // crypto.randomUUID()
  time: number       // seconds
  label: string      // user-editable; '' is allowed
}

type ClipEntryStatus = 'idle' | 'loading' | 'writing' | 'error'

interface ClipEntry {
  markers: Marker[]
  status: ClipEntryStatus
  readOnly: boolean  // true when sidecar is malformed or write permission denied
  error?: string
}

interface ClipDataState {
  entries: Record<string /* clipId */, ClipEntry>
  load: (clipId: string) => Promise<void>
  addMarker: (clipId: string, time: number, label?: string) => string  // returns new id
  updateMarker: (clipId: string, id: string, patch: Partial<Pick<Marker, 'label' | 'time'>>) => void
  removeMarker: (clipId: string, id: string) => void
  hasPendingWrites: () => boolean
}
```

- Markers are kept sorted by `time` ascending; mutations re-sort.
- Each clipId has a private write promise chain. The chain awaits the prior settle before the next write. Each mutation triggers one write of the whole sidecar (small files; no diff/patch).
- `load` is idempotent per clipId; subsequent calls during an in-flight load return the same promise.

### Modified: `layoutStore`

Add per-mode width persistence:

```ts
interface LayoutState {
  view: { clipsWidth: number; inspectorWidth: number }
  edit: { clipsWidth: number; inspectorWidth: number }
  inspectorCollapsed: boolean
  widthsFor: (mode: 'view' | 'edit') => { clipsWidth: number; inspectorWidth: number }
  setClipsWidth: (mode, px) => void
  setInspectorWidth: (mode, px) => void
  setInspectorCollapsed: (next) => void
  toggleInspector: () => void
}
```

Migration: the existing `clipsWidth` / `inspectorWidth` keys in the persisted Zustand record are read once on init and copied into `view.*`. `edit.*` defaults to `view.*` so width feel is preserved on first edit-mode entry; the user can then resize independently. `inspectorCollapsed` stays global.

### Untouched stores

`clipsStore`, `editStore`, `prefsStore`, `gpuStore`, `toastStore` are not modified in this spec.

## Sidecar I/O

### Module: `src/fs/clipSidecar.ts`

```ts
const SIDECAR_VERSION = 1

interface SidecarV1 {
  version: 1
  markers: Marker[]
}

async function readSidecar(
  dirHandle: FileSystemDirectoryHandle,
  baseName: string,
): Promise<SidecarV1 | undefined>
// undefined if the file is absent
// throws on malformed JSON / unknown version (caller toasts and treats clipEntry as readOnly)

async function writeSidecar(
  dirHandle: FileSystemDirectoryHandle,
  baseName: string,
  data: SidecarV1,
): Promise<void>
// write-replace; caller serializes per clipId
```

- **Filename:** `<baseName>.djilut.json` where `baseName` is the clip filename with the last extension stripped (`DJI_0042_D.MP4` → `DJI_0042_D`).
- **Format:** pretty-printed JSON. Schema versioned (`version: 1`) so future features can extend `SidecarV1` to `SidecarV2` (segments, per-clip grading) without breaking older files.
- **Permission:** write requires the clip directory to be granted `'readwrite'`. Read uses the existing `'read'` grant.

### Permission upgrade

On entering edit mode:

1. Shell's `useEffect` observes `mode === 'edit'`.
2. Calls `requestPermission(clipDirHandle, 'readwrite')`.
3. `'granted'` — proceed; `clipDataStore.load(selectedClipId)` runs.
4. `'denied'` — proceed anyway: load runs (read permission was already granted to enter the app at all), but `ClipEntry.readOnly` is set, and a non-blocking toast explains "Markers won't persist — clip folder write permission was denied." A banner in the outline offers a **Grant write** action that re-requests.

## Data flow

### Entering edit mode

```
user → E key / Edit button
  ↓
editModeStore.toggle()       (mode: view → edit, selection: none)
  ↓
Shell useEffect detects mode change
  ↓
requestPermission(clipDirHandle, 'readwrite')
  ↓                              ↓
'granted'                     'denied'
  ↓                              ↓
clipDataStore.load(clipId)    clipDataStore.load(clipId) + entry.readOnly = true + toast
  ↓
window.addEventListener('beforeunload', guard)
  ↓
LeftSidebar / RightSidebar re-render with Edit panels
Layout widths source switches to layoutStore.widthsFor('edit')
```

### Exiting edit mode

```
user → E / Esc (no outline selection) / Done button
  ↓
editModeStore.exit()         (mode: edit → view; outlineSelection preserved but unused)
  ↓
Shell useEffect cleanup removes beforeunload listener
  ↓
Sidebars re-render with View panels
Widths source switches to layoutStore.widthsFor('view')
```

clipDataStore caches are kept (re-entering edit on the same clip is instant). `outlineSelection` is preserved across exit — there is no `clearSelection` call on exit. If the user switches clips in view mode and then re-enters edit, `outlineSelection` may still point to a marker id from the prior clip; `ContextPanel`'s stale-marker fallback catches this on the next render and resets to `'none'`.

### Switching the active clip in edit mode

```
EditClipSwitcher → clipsStore.select(newId)
  ↓
Shell useEffect observes selectedClipId change while mode === 'edit'
  ↓
editModeStore.clearSelection()         (outlineSelection → none)
  ↓
clipDataStore.load(newId)
  ↓
Outline re-renders with new clip's markers
ContextPanel falls back to ClipContextPanel
```

In view mode, switching clips is unchanged (no clipDataStore activity).

### Selecting an outline item

```
click marker row
  ↓
editModeStore.selectMarker(id)
  ↓
ContextPanel route changes to MarkerContextPanel
  ↓
side effect: editStore.setCurrentTime(marker.time)   (playhead jumps to marker)
```

Clicking outline empty space, or pressing `Esc`, deselects.

### Marker CRUD

- **Add** (`M` key or "Add marker" CTA): read `editStore.currentTime`, call `clipDataStore.addMarker(clipId, time, '')`, store generates UUID, returns id. Newly added marker is auto-selected, jumping the right panel to MarkerContextPanel for immediate label entry.
- **Update label** (`MarkerContextPanel` input): debounce 250 ms; on blur/Enter, flush immediately. Each commit writes the full sidecar.
- **Remove**: context-menu Delete or `Delete` key with marker selected. clipDataStore writes; outline selection resets to none.

### Sidecar write serialization

```
mutation → entries[clipId].markers updated synchronously
        → status: 'writing'
        → enqueue: chain = chain.then(() => writeSidecar(...))
        → on settle: status: 'idle' (or 'error')
```

If multiple mutations queue while a write is in flight, each appends its own write. The user sees the writes happen serially. For a 250 ms debounce on label edits and human-speed marker adds, contention is unlikely.

### `beforeunload` guard

```ts
useEffect(() => {
  if (mode !== 'edit') return
  const handler = (e: BeforeUnloadEvent) => {
    e.preventDefault()
    e.returnValue = ''
  }
  window.addEventListener('beforeunload', handler)
  return () => window.removeEventListener('beforeunload', handler)
}, [mode])
```

The browser shows its own confirmation dialog. We accept that a write enqueued less than ~50 ms before unload may not flush (browser tab close is synchronous from JS's perspective). The two-step confirmation gives enough wall-clock time in practice.

## Components

### `Shell` (`src/app/Shell.tsx`)

Refactor of `Layout.tsx`. Same grid template. Reads `mode` from `editModeStore`, `widths` from `layoutStore.widthsFor(mode)`. Mounts the beforeunload guard. Hosts the four cells: `<LeftSidebar />`, `<Preview />`, `<RightSidebar />`, `<Transport />`.

### `LeftSidebar` (`src/app/LeftSidebar.tsx`)

Tiny dispatcher:

```tsx
function LeftSidebar() {
  const mode = useEditModeStore((s) => s.mode)
  return mode === 'edit' ? <EditLeftPanel /> : <ViewLeftPanel />
}
```

### `ViewLeftPanel`

Hosts the existing `<ClipList />` wrapped with a top action bar containing the `<EditToggleButton variant="edit" />`.

### `EditLeftPanel` (`src/app/edit/EditLeftPanel.tsx`)

Vertical stack:

```
[ EditToggleButton variant="done" ]
[ EditClipSwitcher ]
[ EditOutline (Markers section + "Add marker" CTA) ]
```

### `EditClipSwitcher` (`src/app/edit/EditClipSwitcher.tsx`)

Reads `clipsStore.clips` and `selectedClipId`. Renders a dropdown showing the current clip's name and a small prev/next pair. Selecting a different clip calls `clipsStore.select(id)`.

### `EditOutline` (`src/app/edit/EditOutline.tsx`)

Section header "Markers" + sorted list of `<MarkerRow />` items + footer CTA "Add marker at current time". Empty state: "No markers yet · press M to add one".

`<MarkerRow>` renders `★ <mm:ss.ms> · <label or '(no label)'>`. Click → `selectMarker(id)`. Right-click → context menu (Rename, Delete, Jump to time). Selected marker has the same accent treatment used elsewhere in the UI.

### `RightSidebar` (`src/app/RightSidebar.tsx`)

Symmetric dispatcher.

### `ViewRightPanel`

Hosts the existing `<Inspector />` + `<ExportPanel />` composition. Functionally identical to today's right sidebar.

### `EditRightPanel` (`src/app/edit/EditRightPanel.tsx`)

```
[ EditToggleButton variant="done" ]    ← mirrors the left
[ ContextPanel ]                       ← selection-driven
[ ContextExportAction ]                ← currently always "Export current frame"
```

### `ContextPanel` (`src/app/edit/ContextPanel.tsx`)

Routes on `editModeStore.outlineSelection.kind`:

- `'none'` → `<ClipContextPanel />`
- `'marker'` → if `clipDataStore` still has that marker, `<MarkerContextPanel id={id} />`; otherwise reset selection to none and render `<ClipContextPanel />`

### `ClipContextPanel`

Renders the existing inspector sections, reused as siblings: `<LutSection />`, `<RenderModeSection />`, `<ExposureSection />`, `<HdrSection />`. To enable reuse without duplication, the LUT block and the Exposure block (currently inlined inside `Inspector.tsx`) are extracted into `LutSection` and `ExposureSection` components. `Inspector.tsx` and `ClipContextPanel` then both compose them.

### `MarkerContextPanel`

For the selected marker:
- Read-only display of `time` (formatted mm:ss.ms).
- `label` input (250 ms debounced commit).
- "Jump to time" button (already happens on selection but exposed explicitly).
- "Delete marker" button.

### `ContextExportAction`

A button matching the current ExportPanel's primary action visually. In v1 it always means "export current frame" and reuses the existing `useExportActions` hook. Whether the wording stays "Export current frame" or adapts to context is left to feature spec #2/#5; the seam is here.

### `EditToggleButton` (`src/app/edit/EditToggleButton.tsx`)

```ts
interface Props { variant: 'edit' | 'done' }
```

Disabled when `selectedClipId` is undefined. Shows keyboard hint (`E`). On click, `editModeStore.toggle()`.

## Keyboard

| Key | View mode | Edit mode |
|---|---|---|
| `E` | enter edit (if clip selected) | exit edit |
| `Esc` | (current: blur active input) | outline selected → deselect; nothing selected → exit edit |
| `M` | — | add marker at current time |
| `Delete` | — | when marker selected, delete it |
| `↑/↓` | prev/next clip | prev/next clip (unchanged) |
| `Space`, `J/K/L`, `←/→`, `Home/End` | unchanged | unchanged |
| `[`/`]` | prev/next LUT | unchanged |
| `0` | reset exposure | unchanged |
| `⌘O` | open clip folder | confirm "Switch folders will exit edit mode" first |
| `⌘B` | toggle inspector | toggle right sidebar (outline stays) |
| `⌘S` | export current frame | export current frame (unchanged) |
| `⌘C` | copy frame | copy frame (unchanged) |
| `?` | show help | show help |

`useGlobalShortcuts` (`src/app/shortcuts.ts`) gains an edit-mode branch. The `SHORTCUTS` table gains a new "Edit mode" section listing `E` / `Esc` / `M` / `Delete`.

## Error handling

| Failure | UX |
|---|---|
| Enter edit with no clip selected | Button disabled; `E` is a no-op with a one-time hint toast "Select a clip to edit" |
| `requestPermission('readwrite')` denied | Enter edit mode; clipEntry marked readOnly; non-blocking warn toast; outline banner "Markers in this session only · [Grant write]" |
| Sidecar file absent | Treated as empty `{ markers: [] }`. No warning. |
| Sidecar JSON parse error | Treat as empty in-memory; **do not overwrite the file**. clipEntry marked readOnly. Error toast with filename. |
| Sidecar version mismatch | Same as parse error. |
| Sidecar write fails (e.g., quota, transient I/O) | Status → `'error'`; toast with Retry. Retry replays the current in-memory state. No auto-retry. |
| Permission revoked mid-session | Write throws `NotAllowedError`; same path as write fail. Banner offers re-grant. |
| Outline selection points to deleted marker | `ContextPanel` falls back to `ClipContextPanel`; outline selection resets. |
| Pending write at unload | Reload-confirmation dialog gives wall-clock time; a write enqueued within the final ~50ms may be lost. Accepted risk; not worth a persistent queue. |

Toast dedup: the existing `toastStore` already deduplicates by message + type within a short window; no additional logic needed.

## Testing strategy

**Unit (`src/state/__tests__/`)**

- `editModeStore`: toggle, selectMarker, clearSelection, reset-on-clip-change semantics.
- `clipDataStore`:
  - `load` is idempotent per clipId (twice concurrent → one read).
  - `addMarker` inserts in time order; assigns a UUID.
  - `updateMarker` / `removeMarker` mutate correctly.
  - Write serialization: three quick `addMarker` calls produce three sidecar writes in order.
  - `readOnly`: addMarker still updates memory, but no write happens.
  - Write failure → status `'error'`; subsequent successful mutation clears it.
- `clipSidecar`:
  - In-memory mock `FileSystemDirectoryHandle`.
  - Read missing file → `undefined`.
  - Read valid v1 → matches input.
  - Read malformed JSON → throws.
  - Read `version: 2` → throws.
  - Write → file content round-trips.
- `layoutStore.widthsFor(mode)`: returns correct set; `setClipsWidth('edit', x)` does not alter view set.

**Component (`src/app/edit/__tests__/`)**

- `EditToggleButton`: disabled with no clip; click triggers toggle; renders correct variant text.
- `EditOutline`: empty state renders placeholder; marker list renders sorted; click triggers `selectMarker`; pressing `M` triggers `addMarker`.
- `EditRightPanel` / `ContextPanel` routing: matches `outlineSelection.kind`; falls back to clip context when marker id is stale.
- `LeftSidebar` / `RightSidebar`: mode change swaps child component identity (asserted via `data-testid`).
- `Shell`: mounts `beforeunload` listener when mode flips to `'edit'`; removes it on exit; resets outline selection when `selectedClipId` changes during edit.

**Integration (`src/app/__tests__/edit-flow.test.tsx`)**

One end-to-end happy-path test using mocked file-system handle and `vi.spyOn` on sidecar I/O:

1. Mount `Shell`. With no clip selected, the Edit button is disabled.
2. Select a clip via `clipsStore`. Edit button enables.
3. Click Edit (or press `E`). Left sidebar shows `EditOutline` empty state; right shows `ClipContextPanel` (containing LUT section).
4. Press `M`. Outline gains a marker row; right panel switches to `MarkerContextPanel`.
5. Click the marker again to verify selection persistence. Edit the label; assert sidecar write was called with the new label after debounce.
6. Press `E`. Sidebars revert. clipDataStore retains the marker in memory.

**Out of scope for tests**

- Preview, Transport, ExportPanel internals (untouched here).
- Real File System Access integration (mocked).
- WebGPU paths (unchanged).

## Future-feature seams

- **#2 grading expansion** → add fields to `editStore.grading`; extend `<ExposureSection />` or add siblings under `ClipContextPanel`. No structural change to this framework.
- **#3 trim/split** → add `Segment` model to `clipDataStore` and extend `SidecarV1` → `SidecarV2` with `segments: Segment[]`. Outline gains a "Segments" section above "Markers". `outlineSelection.kind` gains `'segment'`. `ContextPanel` gains a `SegmentContextPanel` branch. `ContextExportAction` becomes context-aware.
- **#4 batch frame export** → new exporter wired into `SegmentContextPanel`'s primary action; reuses existing per-frame export pipeline in a loop.
- **#5 video re-encode** → independent, large; separate exporter module; surfaces as another action button in `SegmentContextPanel`. Likely needs its own progress UI.

## Open items deliberately deferred

- Keyboard outline navigation (Tab / `j`/`k` within outline).
- Persistent write queue + recovery across reloads.
- Sidecar version migrations (v1 → v2). Will be handled when v2 lands.
- Visual marker pips on the transport timeline.
- Per-marker grading overrides (mentioned as a future seam, not implemented).
