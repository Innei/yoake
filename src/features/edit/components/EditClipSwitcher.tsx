import { ChevronLeft, ChevronRight, Film } from 'lucide-react';

import { Button } from '~/components/ui/button';
import { cn } from '~/lib/cn';
import { useClipsStore } from '~/features/clips/clipsStore';

export function EditClipSwitcher() {
  const clips = useClipsStore((s) => s.clips);
  const selectedClipId = useClipsStore((s) => s.selectedClipId);
  const select = useClipsStore((s) => s.select);

  if (!clips.length || selectedClipId === undefined) {
    return (
      <div
        className="px-3 py-2 text-xs text-text-tertiary"
        data-testid="edit-clip-switcher-empty"
      >
        No clip selected
      </div>
    );
  }

  const idx = clips.findIndex((c) => c.id === selectedClipId);
  const safeIdx = idx === -1 ? 0 : idx;
  const prevIdx = Math.max(0, safeIdx - 1);
  const nextIdx = Math.max(0, Math.min(clips.length - 1, safeIdx + 1));
  const atStart = safeIdx === 0;
  const atEnd = safeIdx === clips.length - 1;

  return (
    <div
      className="flex items-center gap-1 border-b border-border px-2 py-1.5"
      data-testid="edit-clip-switcher"
    >
      <Button
        aria-label="Previous clip"
        data-testid="edit-clip-switcher-prev"
        disabled={atStart}
        size="icon"
        title="Previous clip (↑)"
        type="button"
        variant="ghost"
        onClick={() => {
          if (atStart) return;
          const target = clips[prevIdx];
          if (target) select(target.id);
        }}
      >
        <ChevronLeft aria-hidden className="size-3.5" />
      </Button>

      <div className="relative min-w-0 flex-1">
        <Film
          aria-hidden
          className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-text-quaternary"
        />
        <select
          aria-label="Active clip"
          data-testid="edit-clip-switcher-select"
          value={selectedClipId}
          className={cn(
            'h-7 w-full appearance-none rounded-md border border-border bg-background-secondary',
            'pl-7 pr-2 text-xs text-text shadow-xs',
            'focus:border-accent/40 focus:outline-none focus:ring-2 focus:ring-accent/20',
          )}
          onChange={(e) => select(e.target.value)}
        >
          {clips.map((clip) => (
            <option key={clip.id} value={clip.id}>
              {clip.name}
            </option>
          ))}
        </select>
      </div>

      <Button
        aria-label="Next clip"
        data-testid="edit-clip-switcher-next"
        disabled={atEnd}
        size="icon"
        title="Next clip (↓)"
        type="button"
        variant="ghost"
        onClick={() => {
          if (atEnd) return;
          const target = clips[nextIdx];
          if (target) select(target.id);
        }}
      >
        <ChevronRight aria-hidden className="size-3.5" />
      </Button>
    </div>
  );
}
