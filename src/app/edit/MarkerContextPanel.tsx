import { Bookmark, SkipForward, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Button } from '~/components/ui/button';
import { Panel, PanelHeader, PanelSection } from '~/components/ui/panel';
import { useClipDataStore } from '~/state/clipDataStore';
import { useClipsStore } from '~/state/clipsStore';
import { useEditModeStore } from '~/state/editModeStore';
import { useEditStore } from '~/state/editStore';

interface Props {
  id: string;
}

function pad(n: number, w = 2): string {
  return n.toString().padStart(w, '0');
}

function formatMarkerTime(seconds: number): string {
  const safe = Number.isFinite(seconds) && seconds >= 0 ? seconds : 0;
  const total = Math.floor(safe);
  const m = Math.floor(total / 60);
  const s = total % 60;
  const ms = Math.floor((safe - total) * 1000);
  return `${pad(m)}:${pad(s)}.${pad(ms, 3)}`;
}

const DEBOUNCE_MS = 250;

export function MarkerContextPanel({ id }: Props) {
  const clipId = useClipsStore((s) => s.selectedClipId);
  const marker = useClipDataStore((s) => {
    if (!clipId) return undefined;
    return s.entries[clipId]?.markers.find((m) => m.id === id);
  });
  const updateMarker = useClipDataStore((s) => s.updateMarker);
  const removeMarker = useClipDataStore((s) => s.removeMarker);
  const setCurrentTime = useEditStore((s) => s.setCurrentTime);
  const clearSelection = useEditModeStore((s) => s.clearSelection);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<string | null>(null);
  const [labelValue, setLabelValue] = useState(marker?.label ?? '');
  const [labelSource, setLabelSource] = useState(marker?.label ?? '');

  if (marker && marker.label !== labelSource) {
    setLabelSource(marker.label);
    setLabelValue(marker.label);
    pendingRef.current = null;
  }

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [id]);

  const flush = useCallback(() => {
    if (!clipId) return;
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const next = pendingRef.current;
    if (next === null) return;
    pendingRef.current = null;
    updateMarker(clipId, id, { label: next });
  }, [clipId, id, updateMarker]);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, []);

  if (!marker || !clipId) return null;

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const next = event.target.value;
    setLabelValue(next);
    pendingRef.current = next;
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      if (pendingRef.current === null) return;
      const value = pendingRef.current;
      pendingRef.current = null;
      updateMarker(clipId, id, { label: value });
    }, DEBOUNCE_MS);
  };

  const handleBlur = () => flush();

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      flush();
      inputRef.current?.blur();
    }
  };

  const handleJump = () => {
    flush();
    setCurrentTime(marker.time);
  };

  const handleDelete = () => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    pendingRef.current = null;
    removeMarker(clipId, id);
    clearSelection();
  };

  return (
    <Panel className="h-full" data-testid="marker-context-panel">
      <PanelHeader
        icon={<Bookmark aria-hidden className="size-3.5" />}
        label="Edit · Marker"
      />

      <PanelSection label="Time">
        <div
          className="font-mono text-sm tabular-nums text-text"
          data-testid="marker-time"
        >
          {formatMarkerTime(marker.time)}
        </div>
      </PanelSection>

      <div className="border-t border-border" />

      <PanelSection label="Label">
        <input
          aria-label="Marker label"
          className="h-8 w-full rounded-md border border-border bg-background px-2 text-sm text-text shadow-xs transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          data-testid="marker-label-input"
          placeholder="Add a label…"
          ref={inputRef}
          type="text"
          value={labelValue}
          onBlur={handleBlur}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
        />
      </PanelSection>

      <div className="border-t border-border" />

      <PanelSection>
        <div className="flex flex-col gap-1.5">
          <Button
            data-testid="marker-jump"
            type="button"
            variant="secondary"
            onClick={handleJump}
          >
            <SkipForward aria-hidden className="size-3.5" />
            Jump to time
          </Button>
          <Button
            data-testid="marker-delete"
            type="button"
            variant="secondary"
            onClick={handleDelete}
          >
            <Trash2 aria-hidden className="size-3.5" />
            Delete marker
          </Button>
        </div>
      </PanelSection>
    </Panel>
  );
}
