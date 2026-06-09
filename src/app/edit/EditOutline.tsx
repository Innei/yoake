import { Plus, Star } from 'lucide-react';
import { useEffect } from 'react';

import { Button } from '~/components/ui/button';
import { PanelSection } from '~/components/ui/panel';
import { useClipDataStore } from '~/state/clipDataStore';
import { useClipsStore } from '~/state/clipsStore';
import { useEditModeStore } from '~/state/editModeStore';
import { useEditStore } from '~/state/editStore';

import { MarkerRow } from './MarkerRow';

export function EditOutline() {
  const selectedClipId = useClipsStore((s) => s.selectedClipId);
  const entries = useClipDataStore((s) => s.entries);
  const load = useClipDataStore((s) => s.load);
  const addMarker = useClipDataStore((s) => s.addMarker);
  const removeMarker = useClipDataStore((s) => s.removeMarker);
  const outlineSelection = useEditModeStore((s) => s.outlineSelection);
  const selectMarker = useEditModeStore((s) => s.selectMarker);
  const clearSelection = useEditModeStore((s) => s.clearSelection);
  const currentTime = useEditStore((s) => s.currentTime);

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

  return (
    <div className="flex min-h-0 flex-col" data-testid="edit-outline">
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
