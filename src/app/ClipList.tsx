import { Film, FolderOpen, Lock, Search, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { Button } from '~/components/ui/button';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '~/components/ui/context-menu';
import { Panel, PanelHeader } from '~/components/ui/panel';
import { scanClips } from '~/fs/clipScanner';
import { ensurePermission, requestPermission } from '~/fs/handleStore';
import { cn } from '~/lib/cn';
import { useClipsStore } from '~/state/clipsStore';
import { usePrefsStore } from '~/state/prefsStore';
import { toast } from '~/state/toastStore';
import type { ClipMeta } from '~/types';

type PermissionView = 'granted' | 'prompt' | 'denied' | 'unknown';

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

function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value < 10 && unit > 0 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

function formatRelative(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '';
  const diff = Date.now() - ms;
  const day = 86_400_000;
  if (diff < day) return 'today';
  if (diff < day * 2) return 'yesterday';
  if (diff < day * 30) return `${Math.floor(diff / day)}d ago`;
  if (diff < day * 365) return `${Math.floor(diff / (day * 30))}mo ago`;
  return `${Math.floor(diff / (day * 365))}y ago`;
}

export function ClipList() {
  const directoryHandle = useClipsStore((s) => s.directoryHandle);
  const clips = useClipsStore((s) => s.clips);
  const selectedClipId = useClipsStore((s) => s.selectedClipId);
  const setDirectory = useClipsStore((s) => s.setDirectory);
  const setClips = useClipsStore((s) => s.setClips);
  const select = useClipsStore((s) => s.select);
  const removeClip = useClipsStore((s) => s.removeClip);
  const setPrefHandle = usePrefsStore((s) => s.setHandle);

  const [permission, setPermission] = useState<PermissionView>('unknown');
  const [filter, setFilter] = useState('');

  const runScan = useCallback(
    async (handle: FileSystemDirectoryHandle) => {
      try {
        const entries = await scanClips(handle);
        const mapped: ClipMeta[] = entries.map((entry) => ({
          id: entry.id,
          name: entry.name,
          size: entry.size,
          lastModified: entry.lastModified,
          handle: entry.fileHandle,
        }));
        setClips(mapped);
      } catch (err: unknown) {
        toast.error('Failed to scan clips', {
          description: err instanceof Error ? err.message : String(err),
        });
      }
    },
    [setClips],
  );

  useEffect(() => {
    if (!directoryHandle) return;
    let cancelled = false;
    ensurePermission(directoryHandle, 'read')
      .then((status) => {
        if (cancelled) return;
        setPermission(status);
        if (status === 'granted') {
          void runScan(directoryHandle);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setPermission('denied');
      });
    return () => {
      cancelled = true;
    };
  }, [directoryHandle, runScan]);

  const handleOpenFolder = useCallback(async () => {
    const handle = await pickClipDirectory();
    if (!handle) return;
    await setPrefHandle('clipDirHandle', handle);
    setDirectory(handle);
    setPermission('granted');
    await runScan(handle);
  }, [runScan, setDirectory, setPrefHandle]);

  const handleRegrant = useCallback(async () => {
    if (!directoryHandle) return;
    const status = await requestPermission(directoryHandle, 'read');
    setPermission(status);
    if (status === 'granted') {
      await runScan(directoryHandle);
    }
  }, [directoryHandle, runScan]);

  const handleDeleteClip = useCallback(
    async (clip: ClipMeta) => {
      if (!directoryHandle) return;
      const confirmed = window.confirm(
        `Delete "${clip.name}" from disk? This cannot be undone.`,
      );
      if (!confirmed) return;

      try {
        const status = await requestPermission(directoryHandle, 'readwrite');
        if (status !== 'granted') {
          toast.error('Delete blocked', {
            description: 'Grant write access to remove files from this folder.',
          });
          return;
        }

        await directoryHandle.removeEntry(clip.name);
        removeClip(clip.id);
        toast.success('Clip deleted', { description: clip.name });
      } catch (err: unknown) {
        toast.error('Failed to delete clip', {
          description: err instanceof Error ? err.message : String(err),
        });
      }
    },
    [directoryHandle, removeClip],
  );

  const filtered = filter
    ? clips.filter((c) => c.name.toLowerCase().includes(filter.toLowerCase()))
    : clips;
  const showFilter = directoryHandle && clips.length > 6;

  return (
    <Panel className="h-full">
      <PanelHeader
        count={directoryHandle ? clips.length : undefined}
        icon={<Film aria-hidden className="size-3.5" />}
        label="Clips"
      />

      {directoryHandle ? (
        <div
          className="flex shrink-0 items-center gap-1.5 border-b border-border px-3 py-1 text-xs text-text-tertiary"
          title={directoryHandle.name}
        >
          <FolderOpen aria-hidden className="size-3.5 shrink-0" />
          <span className="min-w-0 flex-1 truncate">{directoryHandle.name}</span>
          <Button
            size="sm"
            title="Change folder"
            type="button"
            variant="ghost"
            onClick={handleOpenFolder}
          >
            Change
          </Button>
        </div>
      ) : null}

      {showFilter ? (
        <div className="relative shrink-0">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-text-quaternary"
          />
          <input
            aria-label="Filter clips"
            placeholder="Filter…"
            type="search"
            value={filter}
            className={cn(
              'h-7 w-full bg-background pl-9 pr-2 text-xs text-text',
              'placeholder:text-placeholder-text focus:border-accent/40 focus:outline-none focus:ring-2 focus:ring-accent/20',
            )}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-auto p-1">
        {!directoryHandle ? (
          <EmptyState
            description="Pick a DJI SD-card folder to scan for D-Log clips."
            icon={<FolderOpen aria-hidden className="size-6" />}
            title="No folder linked"
            action={
              <Button type="button" onClick={handleOpenFolder}>
                Open DJI folder
              </Button>
            }
          />
        ) : permission === 'prompt' || permission === 'denied' ? (
          <EmptyState
            description="The browser revoked file-system access for this folder."
            icon={<Lock aria-hidden className="size-6" />}
            title="Access expired"
            action={
              <Button type="button" onClick={handleRegrant}>
                Re-grant access
              </Button>
            }
          />
        ) : clips.length === 0 ? (
          <EmptyState
            description="No files matching *_D.MP4 found here."
            icon={<Film aria-hidden className="size-6" />}
            title="No D-Log clips"
            action={
              <Button
                type="button"
                variant="secondary"
                onClick={handleOpenFolder}
              >
                Open another folder
              </Button>
            }
          />
        ) : filtered.length === 0 ? (
          <p className="px-2 py-3 text-xs text-text-tertiary">
            No clips match “{filter}”.
          </p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {filtered.map((clip) => (
              <ClipRow
                clip={clip}
                key={clip.id}
                selected={clip.id === selectedClipId}
                onDelete={() => handleDeleteClip(clip)}
                onSelect={() => select(clip.id)}
              />
            ))}
          </ul>
        )}
      </div>
    </Panel>
  );
}

function ClipRow({
  clip,
  selected,
  onDelete,
  onSelect,
}: {
  clip: ClipMeta;
  onDelete: () => void;
  onSelect: () => void;
  selected: boolean;
}) {
  return (
    <li>
      <ContextMenu>
        <ContextMenuTrigger className="block">
          <button
            aria-current={selected ? 'true' : undefined}
            type="button"
            className={cn(
              'group relative flex w-full items-center gap-2 px-2 py-1.5 text-left',
              'transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40',
              selected
                ? 'bg-fill text-text'
                : 'text-text-secondary hover:bg-fill/60 hover:text-text',
            )}
            onClick={onSelect}
          >
            <span
              aria-hidden
              className={cn(
                'absolute inset-y-0 left-0 w-0.5 rounded-full transition-colors',
                selected ? 'bg-accent' : 'bg-transparent',
              )}
            />
            <Film
              aria-hidden
              className={cn(
                'size-3.5 shrink-0 transition-colors',
                selected ? 'text-accent' : 'text-text-quaternary',
              )}
            />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm">{clip.name}</div>
              <div className="mt-0.5 flex items-center gap-1.5 text-[10px] tabular-nums text-text-tertiary">
                <span>{formatSize(clip.size)}</span>
                {clip.lastModified ? (
                  <>
                    <span aria-hidden>·</span>
                    <span>{formatRelative(clip.lastModified)}</span>
                  </>
                ) : null}
              </div>
            </div>
          </button>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem destructive onClick={onDelete}>
            <Trash2 aria-hidden className="size-3.5 shrink-0" />
            <span>Delete from disk</span>
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    </li>
  );
}

function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  action?: React.ReactNode;
  description: string;
  icon: React.ReactNode;
  title: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-4 py-12 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-fill text-text-tertiary">
        {icon}
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium text-text">{title}</p>
        <p className="text-xs text-text-tertiary">{description}</p>
      </div>
      {action}
    </div>
  );
}
