import { Plus, Star } from 'lucide-react';
import { useEffect } from 'react';

import { Button } from '~/components/ui/button';
import { PanelSection } from '~/components/ui/panel';
import { requestPermission } from '~/fs/handleStore';
import { useClipDataStore } from '~/state/clipDataStore';
import { useClipsStore } from '~/state/clipsStore';
import { useEditModeStore } from '~/state/editModeStore';
import { useEditStore } from '~/state/editStore';
import { usePrefsStore } from '~/state/prefsStore';
import { toast } from '~/state/toastStore';

import { MarkerRow } from './MarkerRow';

export function EditOutline() {
  const selectedClipId = useClipsStore((s) => s.selectedClipId);
  const entries = useClipDataStore((s) => s.entries);
  const load = useClipDataStore((s) => s.load);
  const addMarker = useClipDataStore((s) => s.addMarker);
  const removeMarker = useClipDataStore((s) => s.removeMarker);
  const markReadOnly = useClipDataStore((s) => s.markReadOnly);
  const outlineSelection = useEditModeStore((s) => s.outlineSelection);
  const selectMarker = useEditModeStore((s) => s.selectMarker);
  const clearSelection = useEditModeStore((s) => s.clearSelection);
  const currentTime = useEditStore((s) => s.currentTime);
  const clipDirHandle = usePrefsStore((s) => s.clipDirHandle);

  useEffect(() => {
    if (!selectedClipId) return;
    void load(selectedClipId);
  }, [selectedClipId, load]);

  if (!selectedClipId) {
    return (
      <PanelSection
        icon={<Star aria-hidden className="size-3.5" />}
        label="Markers"
      >
        <p className="text-xs text-text-tertiary" data-testid="edit-outline-empty-clip">
          No clip selected
        </p>
      </PanelSection>
    );
  }

  const entry = entries[selectedClipId];
  const markers = entry?.markers ?? [];
  const selectedMarkerId =
    outlineSelection.kind === 'marker' ? outlineSelection.id : undefined;
  const isReadOnly = entry?.readOnly === true;

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
      <PanelSection
        icon={<Star aria-hidden className="size-3.5" />}
        label="Markers"
        meta={markers.length || undefined}
      >
        {markers.length === 0 ? (
          <p
            className="text-xs text-text-tertiary"
            data-testid="edit-outline-empty-markers"
          >
            No markers yet · press M to add one
          </p>
        ) : (
          <ul className="-mx-3 flex flex-col gap-0.5">
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
        )}
      </PanelSection>

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
