import { ChevronDown, ChevronRight, Plus, Scissors, Star } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button } from '~/components/ui/button';
import { toast } from '~/components/ui/toast/toastStore';
import { useClipDataStore } from '~/features/clips/clipDataStore';
import { useClipsStore } from '~/features/clips/clipsStore';
import { useEditModeStore } from '~/features/edit/editModeStore';
import { useEditStore } from '~/features/edit/editStore';
import { usePrefsStore } from '~/features/preferences/prefsStore';
import { cn } from '~/lib/cn';
import type { Segment, SegmentPlayMode } from '~/lib/fs/clipSidecar';
import { requestPermission } from '~/lib/fs/handleStore';

import { MarkerRow } from './MarkerRow';
import { SegmentPresetMenu } from './SegmentPresetMenu';

function pad(n: number, w = 2): string {
  return n.toString().padStart(w, '0');
}

function formatRowTime(seconds: number): string {
  const safe = Number.isFinite(seconds) && seconds >= 0 ? seconds : 0;
  const total = Math.floor(safe);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

const PLAY_MODE_BADGE: Record<SegmentPlayMode, string> = {
  normal: 'normal',
  reverse: 'reverse',
  freeze: 'freeze',
};

export function EditOutline() {
  const selectedClipId = useClipsStore((s) => s.selectedClipId);
  const entries = useClipDataStore((s) => s.entries);
  const load = useClipDataStore((s) => s.load);
  const addMarker = useClipDataStore((s) => s.addMarker);
  const removeMarker = useClipDataStore((s) => s.removeMarker);
  const markReadOnly = useClipDataStore((s) => s.markReadOnly);
  const outlineSelection = useEditModeStore((s) => s.outlineSelection);
  const selectMarker = useEditModeStore((s) => s.selectMarker);
  const selectSegment = useEditModeStore((s) => s.selectSegment);
  const clearSelection = useEditModeStore((s) => s.clearSelection);
  const currentTime = useEditStore((s) => s.currentTime);
  const clipDirHandle = usePrefsStore((s) => s.clipDirHandle);

  const [segmentsCollapsed, setSegmentsCollapsed] = useState(false);
  const [markersCollapsed, setMarkersCollapsed] = useState(false);

  useEffect(() => {
    if (!selectedClipId) return;
    void load(selectedClipId);
  }, [selectedClipId, load]);

  if (!selectedClipId) {
    return (
      <div className="px-3 py-3" data-testid="edit-outline">
        <p className="text-xs text-text-tertiary" data-testid="edit-outline-empty-clip">
          No clip selected
        </p>
      </div>
    );
  }

  const entry = entries[selectedClipId];
  const markers = entry?.markers ?? [];
  const segments = entry?.segments ?? [];
  const selectedMarkerId =
    outlineSelection.kind === 'marker' ? outlineSelection.id : undefined;
  const selectedSegmentId =
    outlineSelection.kind === 'segment' ? outlineSelection.id : undefined;
  const isReadOnly = entry?.readOnly === true;
  const bothEmpty = segments.length === 0 && markers.length === 0;

  const handleGrantWrite = async () => {
    if (!clipDirHandle) return;
    try {
      const status = await requestPermission(clipDirHandle, 'readwrite');
      if (status === 'granted') {
        markReadOnly(selectedClipId, false);
        void load(selectedClipId);
      } else {
        toast.warning('Write permission still denied');
      }
    } catch (cause) {
      toast.warning('Could not request write permission', {
        description: cause instanceof Error ? cause.message : String(cause),
      });
    }
  };

  return (
    <div className="flex min-h-0 flex-col" data-testid="edit-outline">
      {isReadOnly ? (
        <div
          className="mx-3 mt-2 flex items-center justify-between gap-2 rounded-md border border-border bg-fill/40 px-2.5 py-1.5 text-xs text-text-secondary"
          data-testid="edit-outline-readonly-banner"
          role="status"
        >
          <span>Markers in this session only</span>
          <button
            className="rounded px-1.5 py-0.5 text-[11px] text-accent transition-colors hover:bg-fill"
            data-testid="edit-outline-grant-write"
            type="button"
            onClick={() => {
              void handleGrantWrite();
            }}
          >
            Grant write
          </button>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <section
          className="border-b border-border"
          data-testid="outline-segments-section"
        >
          <SectionHeader
            action={<SegmentPresetMenu />}
            collapsed={segmentsCollapsed}
            count={segments.length}
            icon={<Scissors aria-hidden className="size-3.5" />}
            label="Segments"
            testId="outline-segments-toggle"
            onToggle={() => setSegmentsCollapsed((v) => !v)}
          />
          {!segmentsCollapsed ? (
            segments.length === 0 ? (
              <p
                className="px-3 pb-3 text-xs text-text-tertiary"
                data-testid="edit-outline-empty-segments"
              >
                No segments yet · press S to split at current time
              </p>
            ) : (
              <ul className="flex flex-col gap-0.5 pb-1">
                {segments.map((seg) => (
                  <SegmentRow
                    key={seg.id}
                    segment={seg}
                    selected={seg.id === selectedSegmentId}
                    onSelect={() => selectSegment(seg.id)}
                  />
                ))}
              </ul>
            )
          ) : null}
        </section>

        <section data-testid="outline-markers-section">
          <SectionHeader
            collapsed={markersCollapsed}
            count={markers.length}
            icon={<Star aria-hidden className="size-3.5" />}
            label="Markers"
            testId="outline-markers-toggle"
            onToggle={() => setMarkersCollapsed((v) => !v)}
          />
          {!markersCollapsed ? (
            markers.length === 0 ? (
              <p
                className="px-3 pb-3 text-xs text-text-tertiary"
                data-testid="edit-outline-empty-markers"
              >
                No markers yet · press M to add one
              </p>
            ) : (
              <ul className="flex flex-col gap-0.5 pb-1">
                {markers.map((marker) => (
                  <MarkerRow
                    key={marker.id}
                    marker={marker}
                    selected={marker.id === selectedMarkerId}
                    onRename={() => selectMarker(marker.id)}
                    onSelect={() => selectMarker(marker.id)}
                    onDelete={() => {
                      removeMarker(selectedClipId, marker.id);
                      if (selectedMarkerId === marker.id) clearSelection();
                    }}
                  />
                ))}
              </ul>
            )
          ) : null}
        </section>

        {bothEmpty ? (
          <p
            className="px-3 py-3 text-xs text-text-tertiary"
            data-testid="edit-outline-empty-all"
          >
            No edits yet — split with S, add marker with M
          </p>
        ) : null}
      </div>

      <div className="mt-auto border-t border-border px-3 py-2">
        <Button
          className="w-full"
          data-testid="edit-outline-add-marker"
          size="sm"
          type="button"
          variant="secondary"
          onClick={() => {
            const id = addMarker(selectedClipId, currentTime, '');
            selectMarker(id);
          }}
        >
          <Plus aria-hidden className="size-3.5" />
          <span>Add marker at current time</span>
        </Button>
      </div>
    </div>
  );
}

interface SectionHeaderProps {
  action?: React.ReactNode;
  collapsed: boolean;
  count: number;
  icon: React.ReactNode;
  label: string;
  onToggle: () => void;
  testId: string;
}

function SectionHeader({
  action,
  collapsed,
  count,
  icon,
  label,
  onToggle,
  testId,
}: SectionHeaderProps) {
  return (
    <div className="flex w-full items-center gap-2 pr-3 transition-colors hover:bg-fill/40">
      <button
        aria-expanded={!collapsed}
        className="flex min-w-0 flex-1 items-center gap-1.5 px-3 py-2 text-left"
        data-testid={testId}
        type="button"
        onClick={onToggle}
      >
        {collapsed ? (
          <ChevronRight aria-hidden className="size-3.5 text-text-tertiary" />
        ) : (
          <ChevronDown aria-hidden className="size-3.5 text-text-tertiary" />
        )}
        <span aria-hidden className="text-text-tertiary">
          {icon}
        </span>
        <h3 className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
          {label}
        </h3>
      </button>
      {action}
      <span className="rounded-sm bg-fill px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-text-secondary">
        {count}
      </span>
    </div>
  );
}

interface SegmentRowProps {
  onSelect: () => void;
  segment: Segment;
  selected: boolean;
}

function SegmentRow({ segment, selected, onSelect }: SegmentRowProps) {
  return (
    <li>
      <button
        aria-current={selected ? 'true' : undefined}
        data-testid={`segment-row-${segment.id}`}
        type="button"
        className={cn(
          'group relative flex w-full items-center gap-2 px-3 py-1.5 text-left',
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
        <span className="shrink-0 font-mono text-[11px] tabular-nums text-text-tertiary">
          {formatRowTime(segment.in)} — {formatRowTime(segment.out)}
        </span>
        <span
          className="ml-auto shrink-0 rounded-sm bg-fill px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-text-tertiary"
          data-testid={`segment-row-${segment.id}-mode`}
        >
          {PLAY_MODE_BADGE[segment.playMode]}
        </span>
      </button>
    </li>
  );
}
