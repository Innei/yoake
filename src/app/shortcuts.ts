import { useEffect } from 'react';

import { parseCubeLut } from '~/color/lutCube';
import { confirm } from '~/components/ui/modal';
import { scanClips } from '~/fs/clipScanner';
import { readLut, scanLuts } from '~/fs/lutLoader';
import { useClipDataStore } from '~/state/clipDataStore';
import { useClipsStore } from '~/state/clipsStore';
import { useEditModeStore } from '~/state/editModeStore';
import { useEditStore } from '~/state/editStore';
import { useLayoutStore } from '~/state/layoutStore';
import { usePrefsStore } from '~/state/prefsStore';
import { toast } from '~/state/toastStore';
import type { ClipMeta } from '~/types';

import { toggleCutMode } from './edit/toggleCutMode';

export interface Shortcut {
  description: string;
  keys: string;
}

export const SHORTCUTS: { items: Shortcut[]; section: string }[] = [
  {
    section: 'Playback',
    items: [
      { keys: 'Space', description: 'Play / pause' },
      { keys: '← / →', description: 'Step 1 frame' },
      { keys: 'Shift+← / →', description: 'Step 10 frames' },
      { keys: 'J / L', description: 'Step back / forward 1 frame' },
      { keys: 'K', description: 'Pause' },
      { keys: 'Home / End', description: 'Jump to start / end' },
    ],
  },
  {
    section: 'Clips & LUTs',
    items: [
      { keys: '↑ / ↓', description: 'Previous / next clip' },
      { keys: '[ / ]', description: 'Previous / next LUT' },
      { keys: '⌘O', description: 'Open clip folder' },
      { keys: '0', description: 'Reset exposure' },
    ],
  },
  {
    section: 'Layout',
    items: [
      { keys: '⌘B', description: 'Toggle inspector' },
      { keys: '?', description: 'Show this help' },
    ],
  },
  {
    section: 'Export',
    items: [
      { keys: '⌘S', description: 'Export (Ultra HDR or SDR)' },
      { keys: '⌘C', description: 'Copy current frame to clipboard' },
    ],
  },
  {
    section: 'Edit mode',
    items: [
      { keys: 'E', description: 'Toggle edit mode' },
      {
        keys: 'Esc',
        description: 'Deselect outline item · exit edit when nothing selected',
      },
      { keys: 'M', description: 'Add marker at current time (edit mode)' },
      { keys: 'S', description: 'Split at playhead or add a new segment (edit mode)' },
      {
        keys: 'Delete',
        description: 'Delete selected marker or segment (edit mode)',
      },
    ],
  },
];

function isEditable(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return el.isContentEditable;
}

async function pickClipDirectory(): Promise<
  FileSystemDirectoryHandle | undefined
> {
  if (!('showDirectoryPicker' in window)) return undefined;
  try {
    return await window.showDirectoryPicker({ mode: 'read' });
  } catch {
    return undefined;
  }
}

async function openClipFolder(): Promise<void> {
  if (useEditModeStore.getState().mode === 'edit') {
    const ok = await confirm({
      content: 'Switching folders will exit edit mode.',
      okText: 'Switch',
      title: 'Switch folders?',
    });
    if (!ok) return;
    useEditModeStore.getState().exit();
  }
  const handle = await pickClipDirectory();
  if (!handle) return;
  await usePrefsStore.getState().setHandle('clipDirHandle', handle);
  useClipsStore.getState().setDirectory(handle);
  try {
    const entries = await scanClips(handle);
    const mapped: ClipMeta[] = entries.map((entry) => ({
      id: entry.id,
      name: entry.name,
      size: entry.size,
      lastModified: entry.lastModified,
      handle: entry.fileHandle,
    }));
    useClipsStore.getState().setClips(mapped);
    toast.success(`Loaded ${mapped.length} clip${mapped.length === 1 ? '' : 's'}`, {
      description: handle.name,
    });
  } catch (err) {
    toast.error('Failed to scan clips', {
      description: err instanceof Error ? err.message : String(err),
    });
  }
}

function stepClip(delta: 1 | -1): void {
  const { clips, selectedClipId, select } = useClipsStore.getState();
  if (!clips.length) return;
  const idx = clips.findIndex((c) => c.id === selectedClipId);
  const next = idx === -1 ? 0 : Math.max(0, Math.min(clips.length - 1, idx + delta));
  if (clips[next]) select(clips[next].id);
}

async function stepLut(delta: 1 | -1): Promise<void> {
  const prefs = usePrefsStore.getState();
  if (!prefs.lutDirHandle) return;
  const edit = useEditStore.getState();
  try {
    const luts = await scanLuts(prefs.lutDirHandle);
    if (!luts.length) return;
    const idx = luts.findIndex((l) => l.id === edit.lutDescriptor?.id);
    const next =
      idx === -1
        ? 0
        : Math.max(0, Math.min(luts.length - 1, idx + delta));
    const entry = luts[next];
    if (!entry) return;
    const text = await readLut(entry.fileHandle);
    const parsed = parseCubeLut(text);
    edit.setLut(
      { id: entry.id, name: entry.name, handle: entry.fileHandle },
      parsed,
    );
    toast.info(`LUT · ${entry.label}`, { durationMs: 1800 });
  } catch (err) {
    toast.error('Failed to switch LUT', {
      description: err instanceof Error ? err.message : String(err),
    });
  }
}

export function useGlobalShortcuts(opts: {
  onShowHelp: () => void;
}): void {
  const { onShowHelp } = opts;

  useEffect(() => {
    const isMac =
      typeof navigator !== 'undefined' &&
      /Mac|iPhone|iPad|iPod/.test(navigator.platform);

    function onKey(e: KeyboardEvent) {
      if (isEditable(e.target)) {
        if (e.key === 'Escape' && e.target instanceof HTMLElement) {
          e.target.blur();
        }
        return;
      }
      const mod = isMac ? e.metaKey : e.ctrlKey;
      const edit = useEditStore.getState();
      const editMode = useEditModeStore.getState();

      // Cmd/Ctrl combos
      if (mod && !e.altKey && !e.shiftKey) {
        const k = e.key.toLowerCase();
        if (k === 'b') {
          e.preventDefault();
          useLayoutStore.getState().toggleInspector();
          return;
        }
        if (k === 'o') {
          e.preventDefault();
          void openClipFolder();
          return;
        }
        return;
      }

      if (e.altKey || e.metaKey || e.ctrlKey) return;

      if (e.key === 'Escape') {
        if (editMode.mode !== 'edit') return;
        e.preventDefault();
        if (editMode.cutMode.active) {
          editMode.exitCutMode();
        } else if (editMode.outlineSelection.kind !== 'none') {
          editMode.clearSelection();
        } else {
          editMode.exit();
        }
        return;
      }

      if (e.key === 'e' || e.key === 'E') {
        e.preventDefault();
        editMode.toggle();
        return;
      }

      if (e.key === 'm' || e.key === 'M') {
        if (editMode.mode !== 'edit') return;
        e.preventDefault();
        const selectedClipId = useClipsStore.getState().selectedClipId;
        if (!selectedClipId) return;
        const id = useClipDataStore
          .getState()
          .addMarker(selectedClipId, edit.currentTime, '');
        useEditModeStore.getState().selectMarker(id);
        toast.info('Marker added', { durationMs: 1200 });
        return;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (editMode.mode !== 'edit') return;
        const selectedClipId = useClipsStore.getState().selectedClipId;
        if (!selectedClipId) return;
        if (editMode.outlineSelection.kind === 'marker') {
          e.preventDefault();
          useClipDataStore
            .getState()
            .removeMarker(selectedClipId, editMode.outlineSelection.id);
          useEditModeStore.getState().clearSelection();
          return;
        }
        if (editMode.outlineSelection.kind === 'segment') {
          e.preventDefault();
          useClipDataStore
            .getState()
            .removeSegment(selectedClipId, editMode.outlineSelection.id);
          useEditModeStore.getState().clearSelection();
          return;
        }
        return;
      }

      if (e.key === 's' || e.key === 'S') {
        if (editMode.mode !== 'edit') return;
        e.preventDefault();
        toggleCutMode();
        return;
      }

      switch (e.key) {
        case '?': {
          e.preventDefault();
          onShowHelp();
          return;
        }
        case '0': {
          e.preventDefault();
          edit.setExposure(0);
          toast.info('Exposure reset', { durationMs: 1200 });
          return;
        }
        case '[': {
          e.preventDefault();
          void stepLut(-1);
          return;
        }
        case ']': {
          e.preventDefault();
          void stepLut(1);
          return;
        }
        case 'j':
        case 'J': {
          e.preventDefault();
          if (!edit.isPlaying) {
            const next = Math.max(0, edit.currentTime - 1 / Math.max(edit.fps, 30));
            edit.setCurrentTime(next);
          }
          return;
        }
        case 'k':
        case 'K': {
          e.preventDefault();
          edit.setPlaying(false);
          return;
        }
        case 'l':
        case 'L': {
          e.preventDefault();
          if (!edit.isPlaying) {
            const next = Math.min(
              edit.duration,
              edit.currentTime + 1 / Math.max(edit.fps, 30),
            );
            edit.setCurrentTime(next);
          }
          return;
        }
        case 'ArrowUp': {
          e.preventDefault();
          stepClip(-1);
          return;
        }
        case 'ArrowDown': {
          e.preventDefault();
          stepClip(1);
          return;
        }
        case 'Home': {
          e.preventDefault();
          edit.setCurrentTime(0);
          return;
        }
        case 'End': {
          e.preventDefault();
          edit.setCurrentTime(edit.duration);
          return;
        }
        default: {
          return;
        }
      }
    }

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onShowHelp]);
}
