# Imperative Modal — Design Spec

## Goal

Replace every native `window.alert` / `window.confirm` call in `src/` with an in-app modal built on `@base-ui/react` Dialog. Expose an imperative API backed by a global singleton host so callers can summon modals from non-React code (event handlers, async functions, plain modules).

Reference implementation: `~/git/work/lobe-ui/src/base-ui/Modal/imperative.tsx`.

## Scope

Current native usages (the entire migration surface):

- `src/app/ClipList.tsx:131` — destructive confirm before deleting a clip from disk.
- `src/app/shortcuts.ts:96-98` — confirm before exiting edit mode when switching folders.

No `window.alert` or `window.prompt` callers exist; this spec covers confirm only, but the underlying `createModal` API supports arbitrary modal content for future use.

## Architecture

Single file: `src/components/ui/modal.tsx`. Exports:

```ts
// Host — mount once near the app root, sibling to <Toaster />.
export function ModalHost(): JSX.Element | null

// Open an arbitrary modal imperatively.
export function createModal(props: ImperativeModalProps): ModalInstance

// Open a confirmation modal with OK / Cancel buttons.
export function confirmModal(config: ModalConfirmConfig): { close(): void; destroy(): void }

// Promise-based thin wrapper over confirmModal — closest replacement for window.confirm.
export function confirm(config: ModalConfirmConfig): Promise<boolean>
```

### State

A module-scoped stack array `{ id, props }[]` plus a `Set<() => void>` of listeners. Operations:

- `pushModal(props)` — append entry, notify listeners, return instance handle.
- `closeModal(id)` — set entry's `open` to `false`; the popup animates out, then `onExitComplete` calls `destroyModal(id)`.
- `destroyModal(id)` — remove the entry, notify.
- `updateModal(id, partial)` — merge into props, notify.

`ModalHost` subscribes via `useSyncExternalStore` and renders the stack inside a single `createPortal(... document.body)`. Each entry is rendered by a memoized `<StackItem entry={...} />`.

### Types

```ts
interface ImperativeModalProps {
  title?: ReactNode
  content?: ReactNode
  footer?: ReactNode
  width?: number | string          // overrides the default popup max-width
  className?: string               // applied to the popup container
  maskClosable?: boolean           // default true; outside-press dismiss
  open?: boolean                   // controlled by the stack — callers do not set this
  onOpenChange?: (open: boolean) => void
}

interface ModalInstance {
  close(): void                    // animates closed, then destroys
  destroy(): void                  // removes immediately, no animation
  update(next: Partial<ImperativeModalProps>): void
}

interface ModalConfirmConfig {
  title?: ReactNode
  content?: ReactNode              // body text or JSX
  okText?: ReactNode               // default "OK"
  cancelText?: ReactNode           // default "Cancel"
  danger?: boolean                 // styles OK button red
  onOk?: () => void | Promise<void>
  onCancel?: () => void
}
```

### Base-UI primitives used

`Dialog.Root` (`modal` + controlled `open`), `Dialog.Portal`, `Dialog.Backdrop`, `Dialog.Popup`, `Dialog.Title`, `Dialog.Description`, `Dialog.Close`.

Enter/exit animation: base-ui `data-[starting-style]` / `data-[ending-style]` + Tailwind transition (matches the project's existing `popover.tsx` and `context-menu.tsx` patterns). No `motion` library — the dependency is not in package.json and adding it is out of scope.

### Stack behavior

Multiple modals can be open at once. The latest pushed entry receives focus and ESC; older entries remain rendered behind it. Each entry is its own `Dialog.Root` with `modal=true`. The host renders them in stack order so the newest is visually on top via the default backdrop z-index.

A single open modal is the overwhelming case — stack support is preserved from the reference implementation because it costs nothing once the array exists.

### Async confirm flow

`confirmModal` internally renders a `<ConfirmBody>` that:

1. Tracks `loading` state local to itself.
2. When OK is clicked, calls `onOk()`. If the return value is a thenable, sets `loading=true`, awaits it, then closes on success. On rejection, clears loading and keeps the modal open so the caller can show a toast and let the user retry or cancel.
3. When Cancel is clicked, calls `onCancel?.()` then closes.

`confirm` wraps `confirmModal`:

```ts
export function confirm(config: ModalConfirmConfig): Promise<boolean> {
  return new Promise((resolve) => {
    confirmModal({
      ...config,
      onOk: async () => {
        await config.onOk?.()
        resolve(true)
      },
      onCancel: () => {
        config.onCancel?.()
        resolve(false)
      },
    })
  })
}
```

If the user dismisses via ESC, backdrop, or close button, `onOpenChange(false)` fires; `confirm` treats that as Cancel and resolves `false` (handled by routing dismiss through the same Cancel path inside `ConfirmBody`'s `onOpenChange`).

## Styling

Tailwind v4 with project tokens. Backdrop and popup mirror `popover.tsx`:

- Backdrop: `fixed inset-0 z-50 bg-black/40 backdrop-blur-sm` with `data-[starting-style]:opacity-0 data-[ending-style]:opacity-0` and a 150ms ease-out transition.
- Popup container: `fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[min(420px,calc(100vw-2rem))] rounded-xl bg-background-secondary/95 ring-1 ring-border/80 shadow-2xl backdrop-blur` plus `data-[starting-style]:opacity-0 data-[starting-style]:scale-[0.96]` (and the same ending-style pair) with `transition-[opacity,transform] duration-150 ease-out`.
- Header: `flex items-center justify-between gap-4 px-4 pt-4 pb-2` with `Dialog.Title` styled `text-sm font-semibold text-text` and the `Dialog.Close` button using the project's icon-button styling.
- Content: `px-4 pb-3 text-sm text-text-secondary`.
- Footer: `flex justify-end gap-2 px-4 pb-4`.

`danger=true` swaps the OK button to a destructive variant. The project's current `Button` has `primary | secondary | ghost`. The cleanest move is to add a `danger` variant inline to the Button component (`bg-red text-white hover:opacity-90`). If that creep is unwanted, fall back to passing `className="bg-red text-white hover:opacity-90 border-transparent"` directly to the OK button.

Decision: add `danger` variant to `Button`. It is one line, single-use today but reusable, and avoids inline overrides.

## Call-site changes

**`src/app/ClipList.tsx`**

```ts
const handleDeleteClip = useCallback(async (clip: ClipMeta) => {
  if (!directoryHandle) return
  const ok = await confirm({
    title: 'Delete clip',
    content: `Delete "${clip.name}" from disk? This cannot be undone.`,
    okText: 'Delete',
    danger: true,
  })
  if (!ok) return
  // ... existing permission + remove logic
}, [/* deps */])
```

**`src/app/shortcuts.ts`**

```ts
async function openClipFolder(): Promise<void> {
  if (useEditModeStore.getState().mode === 'edit') {
    const ok = await confirm({
      title: 'Switch folders?',
      content: 'Switching folders will exit edit mode.',
      okText: 'Switch',
    })
    if (!ok) return
    useEditModeStore.getState().exit()
  }
  // ... rest unchanged
}
```

The `typeof window` guard is dropped — `confirm` always runs in the browser (the function is only invoked from a user gesture, and the app is browser-only).

**`src/app/App.tsx`**

Render `<ModalHost />` once, next to `<Toaster />`.

## Testing

New file `src/components/ui/__tests__/modal.test.tsx` using `@testing-library/react` + `vitest` (jsdom). Cases:

1. `confirm` resolves `false` when Cancel is clicked.
2. `confirm` resolves `true` when OK is clicked.
3. `confirm` resolves `false` on ESC or backdrop click.
4. `confirmModal` with async `onOk`: OK button shows loading state, modal stays open until promise resolves, then closes.
5. `confirmModal` with async `onOk` that throws: loading clears, modal stays open.
6. Stack: pushing modal B while A is open keeps both rendered; closing B leaves A open.

Tests render `<ModalHost />` at the top of each test, then call the imperative API and assert via `screen.findByRole('dialog')` etc. Use `userEvent` for interactions.

The two existing call sites are covered by lint/typecheck — no behavioral test is added for `ClipList`'s delete flow or `shortcuts.ts`'s folder switch because there are no current tests for them and adding them is out of scope for this migration.

## Out of scope

- `alert` / `prompt` replacements (none exist).
- Form modal helpers, multi-step modals, fullscreen modals, draggable popups.
- A `createModalSystem()` factory for isolated stacks — the global singleton is enough. The factory can be added later if a use case appears.
- Replacing the project's `Toaster` or other UI primitives.
- Theming overrides beyond what already exists in tokens.

## File layout

```
src/components/ui/modal.tsx                          (new)
src/components/ui/__tests__/modal.test.tsx           (new)
src/components/ui/button.tsx                         (edit — add danger variant)
src/app/App.tsx                                      (edit — mount ModalHost)
src/app/ClipList.tsx                                 (edit — confirm replacement)
src/app/shortcuts.ts                                 (edit — confirm replacement)
```
