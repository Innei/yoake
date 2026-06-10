# Inline export progress in Deliver tab

Date: 2026-06-10
Status: approved

## Goal

Video-export progress moves from the transient toast into the Deliver tab,
below the Export button. Terminal states (success + Reveal, error, canceled)
stay as toasts so they aren't missed when the user navigates away.

## Design

### State: src/state/exportStatusStore.ts (new, zustand)

```ts
type ExportStatus =
  | { kind: 'idle' }
  | {
      kind: 'running';
      cancel: () => void;
      description: string;
      ratio: number | null;
    };
```

- `useExport` sets `running` when an export starts (cancel = AbortController
  abort), updates `description`/`ratio` from `EncodeProgress` via the existing
  `formatProgress` text, and resets to `idle` in its `finally`.
- The progress toast and `updateToastDescription` plumbing are removed. The
  "Export already running" toast goes away too — the disabled button covers it
  (the `exportInFlight` module guard stays as a belt-and-braces re-entry check).

### UI: DeliverTab bottom section

When `running`:
- thin progress bar — determinate width from `ratio`, indeterminate animation
  when `ratio` is null
- status line: `description` (e.g. "Rendering frame 120/450 (27%)"), prefixed
  with `Segment i/n: ` for multi-job exports
- small Cancel button calling `cancel`
- Export button disabled

When `idle`: section renders nothing extra; Export enabled as today.

### Out of scope

- The View-mode still-frame ExportPanel/StatusBar (separate feature).
- Persisting terminal state inline.

## Testing

- useExport tests: assert store transitions (idle → running with cancel wired →
  idle on success/failure/cancel) instead of progress-toast assertions;
  terminal toasts unchanged.
- DeliverTab tests: running state renders progress bar + description + Cancel,
  Export disabled; Cancel invokes store cancel; idle renders nothing extra.
