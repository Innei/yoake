import { Share2 } from 'lucide-react';
import { useCallback, useMemo } from 'react';

import { Button } from '~/components/ui/button';
import { Panel, PanelHeader, PanelSection } from '~/components/ui/panel';
import { useClipDataStore } from '~/features/clips/clipDataStore';
import { useClipsStore } from '~/features/clips/clipsStore';
import type {
  DeliverBakeField,
  DeliverColorspace,
  DeliverContainer,
  DeliverOutputMode,
  DeliverQuality,
  DeliverResolution,
} from '~/features/deliver/deliverStore';
import { useDeliverStore } from '~/features/deliver/deliverStore';
import { useExportStatusStore } from '~/features/deliver/exportStatusStore';
import { usePrefsStore } from '~/features/preferences/prefsStore';
import { cn } from '~/lib/cn';

import { pickExportDir } from '../pickExportDir';
import { useExport } from '../useExport';
import { useFrameExtract } from '../useFrameExtract';
import { DeliverContainerPicker } from './DeliverContainerPicker';
import { DeliverExportProgress } from './DeliverExportProgress';

const UNSUPPORTED_COLORSPACE_HINT =
  'HDR (Rec.2020) export is not supported in this build.';
const NO_CLIP_HINT = 'Pick a clip in the sidebar to export.';
const NO_FOLDER_HINT = 'Choose an export folder above before exporting.';
const EXPORT_RUNNING_HINT = 'Export in progress.';

const RESOLUTIONS: readonly { label: string; value: DeliverResolution }[] = [
  { value: 'source', label: 'Source' },
  { value: '1080p', label: '1080p' },
  { value: '4k', label: '4K' },
];

const QUALITIES: readonly { label: string; value: DeliverQuality }[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'very-high', label: 'Very high' },
];

const COLORSPACES: readonly {
  disabled?: boolean;
  label: string;
  value: DeliverColorspace;
}[] = [
  { value: 'rec709', label: 'Rec.709 (LUT baked)' },
  { value: 'rec2020-hdr', label: 'Rec.2020 HDR', disabled: true },
];

const BAKE_FIELDS: readonly {
  field: DeliverBakeField;
  hint: string;
  label: string;
}[] = [
  {
    field: 'bakeTrim',
    label: 'Apply trim / segments',
    hint: 'Discard regions outside keep-segments at export.',
  },
  {
    field: 'bakeSpeed',
    label: 'Apply speed / playMode',
    hint: 'Bake per-segment speed, freeze, and reverse.',
  },
  {
    field: 'bakeGrade',
    label: 'Apply grade (base + override)',
    hint: 'Bake LUT, exposure, and per-segment grade override.',
  },
];

const OUTPUT_MODES: readonly {
  hint: string;
  label: string;
  value: DeliverOutputMode;
}[] = [
  {
    value: 'single',
    label: 'Single file (ripple)',
    hint: 'All keep-segments concatenated into one file.',
  },
  {
    value: 'multi',
    label: 'Multiple files (one per segment)',
    hint: 'One output file per keep-segment.',
  },
];

function stripExt(name: string): string {
  return name.replace(/\.[^./]+$/, '');
}

function extensionFor(container: DeliverContainer): string {
  return container === 'mov-prores' ? 'mov' : 'mp4';
}

function computeFilenames(
  basename: string,
  ext: string,
  mode: DeliverOutputMode,
  segmentCount: number,
): string[] {
  if (mode === 'multi' && segmentCount > 0) {
    return Array.from(
      { length: segmentCount },
      (_, i) => `${basename}_seg${(i + 1).toString().padStart(2, '0')}.${ext}`,
    );
  }
  return [`${basename}_edit.${ext}`];
}

export function DeliverTab() {
  const clipName = useClipsStore(
    (s) => s.clips.find((c) => c.id === s.selectedClipId)?.name,
  );
  const selectedClipId = useClipsStore((s) => s.selectedClipId);
  const segmentCount = useClipDataStore((s) =>
    selectedClipId ? (s.entries[selectedClipId]?.segments.length ?? 0) : 0,
  );

  const container = useDeliverStore((s) => s.container);
  const resolution = useDeliverStore((s) => s.resolution);
  const quality = useDeliverStore((s) => s.quality);
  const colorspace = useDeliverStore((s) => s.colorspace);
  const bakeTrim = useDeliverStore((s) => s.bakeTrim);
  const bakeSpeed = useDeliverStore((s) => s.bakeSpeed);
  const bakeGrade = useDeliverStore((s) => s.bakeGrade);
  const outputMode = useDeliverStore((s) => s.outputMode);
  const setContainer = useDeliverStore((s) => s.setContainer);
  const setResolution = useDeliverStore((s) => s.setResolution);
  const setQuality = useDeliverStore((s) => s.setQuality);
  const setColorspace = useDeliverStore((s) => s.setColorspace);
  const toggleBake = useDeliverStore((s) => s.toggleBake);
  const setOutputMode = useDeliverStore((s) => s.setOutputMode);

  const exportDirHandle = usePrefsStore((s) => s.exportDirHandle);
  const setPrefHandle = usePrefsStore((s) => s.setHandle);
  const exporting = useExportStatusStore((s) => s.status.kind === 'running');

  const extractFrame = useFrameExtract();
  const runExport = useExport();

  const basename = useMemo(() => stripExt(clipName ?? 'output'), [clipName]);
  const exportDisabled = !selectedClipId || !exportDirHandle || exporting;
  const exportHint = exporting
    ? EXPORT_RUNNING_HINT
    : !selectedClipId
      ? NO_CLIP_HINT
      : exportDirHandle
        ? 'Export with current Deliver settings.'
        : NO_FOLDER_HINT;
  const ext = extensionFor(container);
  const filenames = useMemo(
    () => computeFilenames(basename, ext, outputMode, segmentCount),
    [basename, ext, outputMode, segmentCount],
  );

  const bakeValues: Record<DeliverBakeField, boolean> = {
    bakeTrim,
    bakeSpeed,
    bakeGrade,
  };

  const handlePickFolder = useCallback(() => {
    void pickExportDir((handle) => setPrefHandle('exportDirHandle', handle));
  }, [setPrefHandle]);

  return (
    <Panel className="h-full" data-testid="deliver-tab">
      <PanelHeader
        icon={<Share2 aria-hidden className="size-3.5" />}
        label="Deliver"
      />

      <PanelSection label="Output">
        <div
          className="flex flex-col gap-3"
          data-testid="deliver-output-section"
        >
        <DeliverContainerPicker container={container} onSelect={setContainer} />

        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-text-tertiary">Resolution</span>
          <select
            className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs text-text shadow-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            data-testid="deliver-resolution-select"
            value={resolution}
            onChange={(e) => setResolution(e.target.value as DeliverResolution)}
          >
            {RESOLUTIONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-text-tertiary">Quality</span>
          <select
            className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs text-text shadow-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            data-testid="deliver-quality-select"
            value={quality}
            onChange={(e) => setQuality(e.target.value as DeliverQuality)}
          >
            {QUALITIES.map((q) => (
              <option key={q.value} value={q.value}>
                {q.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-text-tertiary">Colorspace</span>
          <select
            aria-describedby="deliver-colorspace-hint"
            className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs text-text shadow-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            data-testid="deliver-colorspace-select"
            value={colorspace}
            onChange={(e) => setColorspace(e.target.value as DeliverColorspace)}
          >
            {COLORSPACES.map((c) => (
              <option disabled={c.disabled === true} key={c.value} value={c.value}>
                {c.label}
                {c.disabled ? ' (unsupported)' : ''}
              </option>
            ))}
          </select>
          <span
            className="text-[11px] text-text-tertiary"
            id="deliver-colorspace-hint"
          >
            {UNSUPPORTED_COLORSPACE_HINT}
          </span>
        </label>
        </div>
      </PanelSection>

      <div className="border-t border-border" />

      <PanelSection label="Bake options">
        <div className="flex flex-col gap-2" data-testid="deliver-bake-section">
          {BAKE_FIELDS.map(({ field, label, hint }) => {
            const checked = bakeValues[field];
            return (
              <label
                className="flex cursor-pointer items-start gap-2 text-xs"
                key={field}
              >
                <input
                  checked={checked}
                  className="mt-0.5 size-3.5 accent-accent"
                  type="checkbox"
                  data-testid={`deliver-${field
                    .replace('bake', 'bake-')
                    .toLowerCase()}`}
                  onChange={() => toggleBake(field)}
                />
                <span className="flex flex-col gap-0.5">
                  <span className="text-text">{label}</span>
                  <span className="text-[11px] text-text-tertiary">{hint}</span>
                </span>
              </label>
            );
          })}
        </div>
      </PanelSection>

      <div className="border-t border-border" />

      <PanelSection label="Output mode">
        <div
          className="flex flex-col gap-2"
          data-testid="deliver-mode-section"
        >
        <div
          aria-label="Output mode"
          className="flex flex-col gap-1"
          role="radiogroup"
        >
          {OUTPUT_MODES.map((m) => {
            const active = outputMode === m.value;
            return (
              <label
                key={m.value}
                className={cn(
                  'flex cursor-pointer flex-col gap-0.5 rounded-md border px-2 py-1.5 text-xs transition-colors',
                  active
                    ? 'border-accent bg-accent/10 text-text'
                    : 'border-border bg-background-secondary text-text-secondary hover:bg-fill/60',
                )}
              >
                <span className="flex items-center gap-2">
                  <input
                    checked={active}
                    className="sr-only"
                    data-testid={`deliver-mode-${m.value}`}
                    name="deliver-mode"
                    type="radio"
                    value={m.value}
                    onChange={() => setOutputMode(m.value)}
                  />
                  <span
                    aria-hidden
                    className={cn(
                      'inline-block size-2 rounded-full',
                      active ? 'bg-accent' : 'bg-border',
                    )}
                  />
                  {m.label}
                </span>
                <span className="pl-4 text-[11px] text-text-tertiary">
                  {m.hint}
                </span>
              </label>
            );
          })}
        </div>

        <div className="mt-2 flex flex-col gap-1">
          <span className="text-[11px] text-text-tertiary">
            Filename preview
          </span>
          <ul
            className="flex flex-col gap-0.5 rounded-md border border-border bg-background-secondary px-2 py-1.5 font-mono text-[11px] tabular-nums text-text-secondary"
            data-testid="deliver-filename-list"
          >
            {filenames.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
          {segmentCount === 0 ? (
            <span
              className="text-[11px] text-text-tertiary"
              data-testid="deliver-no-segments-hint"
            >
              Source video will export entirely.
            </span>
          ) : null}
        </div>
        </div>
      </PanelSection>

      <div className="border-t border-border" />

      <PanelSection label="Output location">
        <div
          className="flex flex-col gap-1"
          data-testid="deliver-location-section"
        >
        {exportDirHandle ? (
          <div className="flex items-center justify-between gap-2">
            <span
              className="truncate text-xs text-text"
              data-testid="deliver-location-name"
              title={exportDirHandle.name}
            >
              {exportDirHandle.name}
            </span>
            <Button
              data-testid="deliver-location-pick"
              size="sm"
              type="button"
              variant="secondary"
              onClick={handlePickFolder}
            >
              Change folder
            </Button>
          </div>
        ) : (
          <div
            className="flex items-center justify-between gap-2"
            data-testid="deliver-location-empty"
          >
            <span className="text-xs text-text-tertiary">
              No export folder set
            </span>
            <Button
              data-testid="deliver-location-pick"
              size="sm"
              type="button"
              variant="secondary"
              onClick={handlePickFolder}
            >
              Choose folder…
            </Button>
          </div>
        )}
        </div>
      </PanelSection>

      <div className="border-t border-border" />

      <PanelSection>
        <div className="flex flex-col gap-1.5">
          {exporting ? <DeliverExportProgress /> : null}
          <Button
            aria-disabled={exportDisabled}
            aria-label={exportHint}
            data-testid="deliver-export-button"
            disabled={exportDisabled}
            title={exportHint}
            type="button"
            variant="primary"
            onClick={() => {
              void runExport();
            }}
          >
            Export
          </Button>
          <Button
            data-testid="deliver-frame-extract-button"
            type="button"
            variant="secondary"
            onClick={() => {
              void extractFrame();
            }}
          >
            Extract frame
          </Button>
        </div>
      </PanelSection>
    </Panel>
  );
}
