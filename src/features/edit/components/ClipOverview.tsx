import { Film } from 'lucide-react';

import { Panel, PanelHeader, PanelSection } from '~/components/ui/panel';
import { useClipDataStore } from '~/features/clips/clipDataStore';
import { useClipsStore } from '~/features/clips/clipsStore';
import { useEditStore } from '~/features/edit/editStore';

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0.0s';
  return `${seconds.toFixed(1)}s`;
}

function formatResolution(width: number, height: number): string | undefined {
  if (!width || !height) return undefined;
  return `${width} × ${height}`;
}

export function ClipOverview() {
  const clip = useClipsStore((s) =>
    s.clips.find((c) => c.id === s.selectedClipId),
  );
  const selectedClipId = useClipsStore((s) => s.selectedClipId);
  const entry = useClipDataStore((s) =>
    selectedClipId ? s.entries[selectedClipId] : undefined,
  );
  const duration = useEditStore((s) => s.duration);
  const fps = useEditStore((s) => s.fps);

  if (!clip) {
    return (
      <Panel className="h-full" data-testid="clip-overview">
        <PanelHeader
          icon={<Film aria-hidden className="size-3.5" />}
          label="Clip Overview"
        />
        <PanelSection>
          <p className="text-xs text-text-tertiary">No clip selected</p>
        </PanelSection>
      </Panel>
    );
  }

  const segments = entry?.segments ?? [];
  const markers = entry?.markers ?? [];
  const outputDuration =
    segments.length > 0
      ? segments.reduce((sum, s) => sum + Math.max(0, s.out - s.in), 0)
      : duration;

  const resolution = formatResolution(0, 0);
  const colorspace: string | undefined = undefined;

  return (
    <Panel className="h-full" data-testid="clip-overview">
      <PanelHeader
        icon={<Film aria-hidden className="size-3.5" />}
        label="Clip Overview"
      />

      <PanelSection label="File">
        <div
          className="truncate font-mono text-xs text-text"
          data-testid="clip-overview-filename"
          title={clip.name}
        >
          {clip.name}
        </div>
      </PanelSection>

      <div className="border-t border-border" />

      <PanelSection label="Source">
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          <dt className="text-text-tertiary">FPS</dt>
          <dd
            className="font-mono tabular-nums text-text"
            data-testid="clip-overview-fps"
          >
            {fps > 0 ? fps.toFixed(2) : '—'}
          </dd>
          <dt className="text-text-tertiary">Resolution</dt>
          <dd
            className="font-mono tabular-nums text-text"
            data-testid="clip-overview-resolution"
          >
            {resolution ?? '—'}
          </dd>
          <dt className="text-text-tertiary">Duration</dt>
          <dd
            className="font-mono tabular-nums text-text"
            data-testid="clip-overview-duration"
          >
            {duration > 0 ? formatDuration(duration) : '—'}
          </dd>
          {colorspace !== undefined ? (
            <>
              <dt className="text-text-tertiary">Colorspace</dt>
              <dd
                className="font-mono text-text"
                data-testid="clip-overview-colorspace"
              >
                {colorspace}
              </dd>
            </>
          ) : null}
        </dl>
      </PanelSection>

      <div className="border-t border-border" />

      <PanelSection label="Edit">
        <p
          className="text-xs text-text-secondary"
          data-testid="clip-overview-stats"
        >
          {segments.length} segments · {markers.length} markers · output
          duration {formatDuration(outputDuration)}
        </p>
      </PanelSection>
    </Panel>
  );
}
