import type { ReactNode } from 'react';

import type {
  ContextMenuItemDef,
  ShowContextMenuOptions,
  VirtualAnchor,
} from './types';

export interface ContextMenuState {
  anchor: VirtualAnchor | null;
  footer: ReactNode;
  header: ReactNode;
  items: ContextMenuItemDef[];
  open: boolean;
  triggerId: string | null;
}

interface PointerSnapshot {
  ready: boolean;
  triggerId: string | null;
  x: number;
  y: number;
}

const initialState: ContextMenuState = {
  anchor: null,
  footer: null,
  header: null,
  items: [],
  open: false,
  triggerId: null,
};

let state: ContextMenuState = initialState;
const listeners = new Set<() => void>();
const lastPointer: PointerSnapshot = {
  ready: false,
  triggerId: null,
  x: 0,
  y: 0,
};

let trackerRefCount = 0;
let trackerDetach: (() => void) | null = null;

function emit(): void {
  for (const l of listeners) l();
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getSnapshot(): ContextMenuState {
  return state;
}

export function getServerSnapshot(): ContextMenuState {
  return initialState;
}

export function setState(patch: Partial<ContextMenuState>): void {
  state = { ...state, ...patch };
  emit();
}

export function resetState(): void {
  state = initialState;
  emit();
}

function makeVirtualAnchor(x: number, y: number): VirtualAnchor {
  const rect: DOMRect = {
    bottom: y,
    height: 0,
    left: x,
    right: x,
    top: y,
    width: 0,
    x,
    y,
    toJSON: () => ({ x, y, width: 0, height: 0 }),
  };
  return {
    getBoundingClientRect: () => rect,
  };
}

function readPointerFromEvent(
  event: MouseEvent | React.MouseEvent,
): { triggerId: string | null; x: number; y: number } {
  const target = event.target as Element | null;
  const hit = target?.closest?.('[data-contextmenu-trigger]') ?? null;
  const triggerId =
    hit instanceof HTMLElement
      ? (hit.dataset.contextmenuTrigger ?? null)
      : null;
  return { triggerId, x: event.clientX, y: event.clientY };
}

function fallbackPoint(): { x: number; y: number } {
  if (lastPointer.ready) return { x: lastPointer.x, y: lastPointer.y };
  if (typeof window !== 'undefined') {
    return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  }
  return { x: 0, y: 0 };
}

export function showContextMenuFromState(
  items: ContextMenuItemDef[],
  opts?: ShowContextMenuOptions,
): void {
  let triggerId: string | null;
  let anchor: VirtualAnchor;
  if (opts?.event) {
    const point = readPointerFromEvent(opts.event);
    triggerId = point.triggerId;
    anchor = makeVirtualAnchor(point.x, point.y);
  } else {
    const point = fallbackPoint();
    triggerId = lastPointer.triggerId;
    anchor = makeVirtualAnchor(point.x, point.y);
  }
  state = {
    anchor,
    footer: opts?.footer ?? null,
    header: opts?.header ?? null,
    items,
    open: true,
    triggerId,
  };
  emit();
}

export function updateContextMenuItemsInState(
  items: ContextMenuItemDef[],
): void {
  state = { ...state, items };
  emit();
}

export function closeContextMenuFromState(): void {
  if (!state.open && state.items.length === 0) return;
  resetState();
}

function handlePointer(event: MouseEvent): void {
  const point = readPointerFromEvent(event);
  lastPointer.x = point.x;
  lastPointer.y = point.y;
  lastPointer.triggerId = point.triggerId;
  lastPointer.ready = true;
}

export function attachPointerTracker(): () => void {
  trackerRefCount += 1;
  if (trackerRefCount === 1 && typeof window !== 'undefined') {
    const onPointerDown = (event: MouseEvent) => handlePointer(event);
    const onContextMenu = (event: MouseEvent) => handlePointer(event);
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('contextmenu', onContextMenu, true);
    trackerDetach = () => {
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('contextmenu', onContextMenu, true);
    };
  }
  return () => {
    trackerRefCount = Math.max(0, trackerRefCount - 1);
    if (trackerRefCount === 0 && trackerDetach) {
      trackerDetach();
      trackerDetach = null;
    }
  };
}
