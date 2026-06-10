import { Palette } from 'lucide-react';
import { useCallback } from 'react';

import { ExposureControl } from '~/features/grade/components/ExposureControl';
import { LutPicker } from '~/features/grade/components/LutPicker';
import { Button } from '~/components/ui/button';
import { Panel, PanelHeader, PanelSection } from '~/components/ui/panel';
import type { GradeState } from '~/lib/fs/clipSidecar';
import { useClipDataStore } from '~/features/clips/clipDataStore';
import { useClipsStore } from '~/features/clips/clipsStore';
import { useEditModeStore } from '~/features/edit/editModeStore';
import { useEditStore } from '~/features/edit/editStore';
import type { LutDescriptor, ParsedLut } from '~/types';

function pad(n: number, w = 2): string {
  return n.toString().padStart(w, '0');
}

function formatTimecode(seconds: number): string {
  const safe = Number.isFinite(seconds) && seconds >= 0 ? seconds : 0;
  const totalMs = Math.round(safe * 1000);
  const hours = Math.floor(totalMs / 3_600_000);
  const minutes = Math.floor((totalMs % 3_600_000) / 60_000);
  const secs = Math.floor((totalMs % 60_000) / 1000);
  return `${pad(hours)}:${pad(minutes)}:${pad(secs)}`;
}

export function GradeTab() {
  const clipId = useClipsStore((s) => s.selectedClipId);
  const outlineSelection = useEditModeStore((s) => s.outlineSelection);
  const segId =
    outlineSelection.kind === 'segment' ? outlineSelection.id : undefined;

  const segment = useClipDataStore((s) => {
    if (!clipId || !segId) return undefined;
    return s.entries[clipId]?.segments.find((seg) => seg.id === segId);
  });
  const baseGrade = useClipDataStore((s) => {
    if (!clipId) return undefined;
    return s.entries[clipId]?.baseGrade;
  });

  const setBaseGrade = useClipDataStore((s) => s.setBaseGrade);
  const setSegmentGradeOverride = useClipDataStore(
    (s) => s.setSegmentGradeOverride,
  );
  const clearSegmentGradeOverride = useClipDataStore(
    (s) => s.clearSegmentGradeOverride,
  );

  const lutDescriptor = useEditStore((s) => s.lutDescriptor);
  const setLut = useEditStore((s) => s.setLut);
  const exposureFromEditStore = useEditStore((s) => s.grading.exposure);
  const setExposureOnEditStore = useEditStore((s) => s.setExposure);

  const overrideActive = segment?.gradeOverride !== undefined;
  const scope: 'base' | 'override' | 'segment-base' =
    segment && overrideActive
      ? 'override'
      : segment
        ? 'segment-base'
        : 'base';

  const effective: GradeState = (() => {
    if (!baseGrade) return {};
    if (scope === 'override' && segment?.gradeOverride) {
      return { ...baseGrade, ...segment.gradeOverride };
    }
    return baseGrade;
  })();

  const exposureValue = effective.exposure ?? exposureFromEditStore;

  const writeGradePatch = useCallback(
    (patch: Partial<GradeState>) => {
      if (!clipId) return;
      if (scope === 'override' && segId) {
        setSegmentGradeOverride(clipId, segId, patch);
      } else {
        setBaseGrade(clipId, patch);
      }
    },
    [clipId, scope, segId, setSegmentGradeOverride, setBaseGrade],
  );

  const handleLutSelect = useCallback(
    (descriptor: LutDescriptor, parsed: ParsedLut) => {
      setLut(descriptor, parsed);
      writeGradePatch({ lutId: descriptor.id });
    },
    [setLut, writeGradePatch],
  );

  const handleExposureChange = useCallback(
    (value: number) => {
      // override edits must not leak into the global fallback exposure,
      // or non-override segments inherit it at export time
      if (scope !== 'override') setExposureOnEditStore(value);
      writeGradePatch({ exposure: value });
    },
    [scope, setExposureOnEditStore, writeGradePatch],
  );

  const handleOverrideStart = useCallback(() => {
    if (!clipId || !segId) return;
    setSegmentGradeOverride(clipId, segId, {});
  }, [clipId, segId, setSegmentGradeOverride]);

  const handleOverrideReset = useCallback(() => {
    if (!clipId || !segId) return;
    clearSegmentGradeOverride(clipId, segId);
  }, [clipId, segId, clearSegmentGradeOverride]);

  return (
    <Panel className="h-full" data-testid="grade-tab">
      <PanelHeader
        icon={<Palette aria-hidden className="size-3.5" />}
        label="Grade"
      />

      <PanelSection>
        {scope === 'override' && segment ? (
          <div
            className="flex items-center justify-between gap-2"
            data-testid="grade-scope-override"
          >
            <span className="text-xs text-text-secondary">
              Override · segment{' '}
              <span className="font-mono tabular-nums">
                {formatTimecode(segment.in)}–{formatTimecode(segment.out)}
              </span>
            </span>
            <Button
              data-testid="grade-reset-to-base"
              size="sm"
              type="button"
              variant="secondary"
              onClick={handleOverrideReset}
            >
              Reset to base
            </Button>
          </div>
        ) : (
          <div
            className="flex flex-col gap-1.5"
            data-testid="grade-scope-base"
          >
            <span className="text-xs text-text-secondary">Base grade</span>
            {scope === 'segment-base' && segId ? (
              <Button
                data-testid="grade-override-segment"
                size="sm"
                type="button"
                variant="secondary"
                onClick={handleOverrideStart}
              >
                Override this segment
              </Button>
            ) : null}
          </div>
        )}
      </PanelSection>

      <div className="border-t border-border" />

      <LutPicker value={lutDescriptor} onSelect={handleLutSelect} />

      <div className="border-t border-border" />

      <ExposureControl value={exposureValue} onChange={handleExposureChange} />
    </Panel>
  );
}
