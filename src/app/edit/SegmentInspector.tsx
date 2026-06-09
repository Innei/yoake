import { Scissors, SkipBack, SkipForward, Split, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { Button } from '~/components/ui/button';
import { Panel, PanelHeader, PanelSection } from '~/components/ui/panel';
import type { SegmentPlayMode } from '~/fs/clipSidecar';
import { cn } from '~/lib/cn';
import { useClipDataStore } from '~/state/clipDataStore';
import { useClipsStore } from '~/state/clipsStore';
import { useEditModeStore } from '~/state/editModeStore';
import { useEditStore } from '~/state/editStore';

function pad(n: number, w = 2): string {
  return n.toString().padStart(w, '0');
}

function formatTimecode(seconds: number): string {
  const safe = Number.isFinite(seconds) && seconds >= 0 ? seconds : 0;
  const totalMs = Math.round(safe * 1000);
  const hours = Math.floor(totalMs / 3_600_000);
  const minutes = Math.floor((totalMs % 3_600_000) / 60_000);
  const secs = Math.floor((totalMs % 60_000) / 1000);
  const ms = totalMs % 1000;
  return `${pad(hours)}:${pad(minutes)}:${pad(secs)}.${pad(ms, 3)}`;
}

function parseTimecode(input: string): number | undefined {
  const trimmed = input.trim();
  if (trimmed === '') return undefined;
  const match = trimmed.match(/^(?:(\d+):)?(?:(\d+):)?(\d+)(?:\.(\d{1,3}))?$/);
  if (!match) return undefined;
  const [, a, b, c, frac] = match;
  let h: number;
  let m: number;
  let s: number;
  if (a !== undefined && b !== undefined) {
    h = Number(a);
    m = Number(b);
    s = Number(c);
  } else if (a !== undefined) {
    h = 0;
    m = Number(a);
    s = Number(c);
  } else {
    h = 0;
    m = 0;
    s = Number(c);
  }
  const ms = frac !== undefined ? Number(frac.padEnd(3, '0')) : 0;
  if ([h, m, s, ms].some((n) => Number.isNaN(n))) return undefined;
  return h * 3600 + m * 60 + s + ms / 1000;
}

const PLAY_MODES: readonly { label: string; value: SegmentPlayMode }[] = [
  { value: 'normal', label: 'Normal' },
  { value: 'reverse', label: 'Reverse' },
  { value: 'freeze', label: 'Freeze' },
];

const SPEED_PRESETS: readonly number[] = [0.25, 0.5, 0.75, 1, 1.5, 2, 4];
const DEFAULT_FREEZE_SEC = 2;

export function SegmentInspector() {
  const clipId = useClipsStore((s) => s.selectedClipId);
  const outlineSelection = useEditModeStore((s) => s.outlineSelection);
  const clearSelection = useEditModeStore((s) => s.clearSelection);
  const segId = outlineSelection.kind === 'segment' ? outlineSelection.id : undefined;
  const segment = useClipDataStore((s) => {
    if (!clipId || !segId) return undefined;
    return s.entries[clipId]?.segments.find((seg) => seg.id === segId);
  });
  const updateSegment = useClipDataStore((s) => s.updateSegment);
  const removeSegment = useClipDataStore((s) => s.removeSegment);
  const setSegmentPlayMode = useClipDataStore((s) => s.setSegmentPlayMode);
  const setSegmentSpeed = useClipDataStore((s) => s.setSegmentSpeed);
  const setSegmentFreezeDuration = useClipDataStore(
    (s) => s.setSegmentFreezeDuration,
  );
  const splitAtTime = useClipDataStore((s) => s.splitAtTime);
  const setCurrentTime = useEditStore((s) => s.setCurrentTime);

  if (!clipId || !segId || !segment) {
    return (
      <Panel className="h-full" data-testid="segment-inspector">
        <PanelHeader
          icon={<Scissors aria-hidden className="size-3.5" />}
          label="Edit · Segment"
        />
        <PanelSection>
          <p
            className="text-xs text-text-tertiary"
            data-testid="segment-inspector-empty"
          >
            Segment not found
          </p>
          <Button
            className="mt-2"
            data-testid="segment-inspector-clear"
            size="sm"
            type="button"
            variant="secondary"
            onClick={clearSelection}
          >
            Clear selection
          </Button>
        </PanelSection>
      </Panel>
    );
  }

  const handlePlayModeChange = (mode: SegmentPlayMode) => {
    setSegmentPlayMode(clipId, segment.id, mode);
    if (mode === 'freeze' && segment.freezeDurationSec === undefined) {
      setSegmentFreezeDuration(clipId, segment.id, DEFAULT_FREEZE_SEC);
    }
  };

  return (
    <SegmentInspectorBody
      clipId={clipId}
      key={segment.id}
      segFreezeDuration={segment.freezeDurationSec}
      segIn={segment.in}
      segLabel={segment.label ?? ''}
      segOut={segment.out}
      segPlayMode={segment.playMode}
      segSpeed={segment.speed}
      onClearSelection={clearSelection}
      onJumpIn={() => setCurrentTime(segment.in)}
      onJumpOut={() => setCurrentTime(segment.out)}
      onPlayModeChange={handlePlayModeChange}
      onSpeedChange={(speed) => setSegmentSpeed(clipId, segment.id, speed)}
      onSplit={() => splitAtTime(clipId, useEditStore.getState().currentTime)}
      onUpdate={(patch) => updateSegment(clipId, segment.id, patch)}
      onDelete={() => {
        removeSegment(clipId, segment.id);
        clearSelection();
      }}
      onFreezeDurationChange={(secs) =>
        setSegmentFreezeDuration(clipId, segment.id, secs)
      }
    />
  );
}

interface BodyProps {
  clipId: string;
  onClearSelection: () => void;
  onDelete: () => void;
  onFreezeDurationChange: (secs: number) => void;
  onJumpIn: () => void;
  onJumpOut: () => void;
  onPlayModeChange: (mode: SegmentPlayMode) => void;
  onSpeedChange: (speed: number) => void;
  onSplit: () => void;
  onUpdate: (patch: { in?: number; label?: string; out?: number }) => void;
  segFreezeDuration?: number;
  segIn: number;
  segLabel: string;
  segOut: number;
  segPlayMode: SegmentPlayMode;
  segSpeed: number;
}

function SegmentInspectorBody({
  segIn,
  segOut,
  segLabel,
  segPlayMode,
  segSpeed,
  segFreezeDuration,
  onUpdate,
  onPlayModeChange,
  onSpeedChange,
  onFreezeDurationChange,
  onDelete,
  onSplit,
  onJumpIn,
  onJumpOut,
}: BodyProps) {
  const [inValue, setInValue] = useState(() => formatTimecode(segIn));
  const [outValue, setOutValue] = useState(() => formatTimecode(segOut));
  const [labelValue, setLabelValue] = useState(segLabel);
  const [inSource, setInSource] = useState(segIn);
  const [outSource, setOutSource] = useState(segOut);
  const [labelSource, setLabelSource] = useState(segLabel);
  const [speedValue, setSpeedValue] = useState(() => segSpeed.toString());
  const [speedSource, setSpeedSource] = useState(segSpeed);
  const [freezeValue, setFreezeValue] = useState(() =>
    (segFreezeDuration ?? DEFAULT_FREEZE_SEC).toFixed(3),
  );
  const [freezeSource, setFreezeSource] = useState(segFreezeDuration);

  if (inSource !== segIn) {
    setInSource(segIn);
    setInValue(formatTimecode(segIn));
  }
  if (outSource !== segOut) {
    setOutSource(segOut);
    setOutValue(formatTimecode(segOut));
  }
  if (labelSource !== segLabel) {
    setLabelSource(segLabel);
    setLabelValue(segLabel);
  }
  if (speedSource !== segSpeed) {
    setSpeedSource(segSpeed);
    setSpeedValue(segSpeed.toString());
  }
  if (freezeSource !== segFreezeDuration) {
    setFreezeSource(segFreezeDuration);
    setFreezeValue((segFreezeDuration ?? DEFAULT_FREEZE_SEC).toFixed(3));
  }

  const duration = Math.max(0, segOut - segIn);

  const commitIn = () => {
    const parsed = parseTimecode(inValue);
    if (parsed === undefined || parsed === segIn) {
      setInValue(formatTimecode(segIn));
      return;
    }
    onUpdate({ in: parsed });
  };
  const commitOut = () => {
    const parsed = parseTimecode(outValue);
    if (parsed === undefined || parsed === segOut) {
      setOutValue(formatTimecode(segOut));
      return;
    }
    onUpdate({ out: parsed });
  };
  const commitLabel = () => {
    if (labelValue === segLabel) return;
    onUpdate({ label: labelValue });
  };
  const commitSpeed = () => {
    const parsed = Number(speedValue);
    if (!Number.isFinite(parsed) || parsed < 0.05 || parsed > 10) {
      setSpeedValue(segSpeed.toString());
      return;
    }
    if (parsed === segSpeed) {
      setSpeedValue(segSpeed.toString());
      return;
    }
    onSpeedChange(parsed);
  };
  const commitFreeze = () => {
    const parsed = Number(freezeValue);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setFreezeValue((segFreezeDuration ?? DEFAULT_FREEZE_SEC).toFixed(3));
      return;
    }
    if (parsed === segFreezeDuration) return;
    onFreezeDurationChange(parsed);
  };

  const handleKey = (commit: () => void) =>
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        commit();
        (event.target as HTMLInputElement).blur();
      }
    };

  return (
    <Panel className="h-full" data-testid="segment-inspector">
      <PanelHeader
        icon={<Scissors aria-hidden className="size-3.5" />}
        label="Edit · Segment"
      />

      <PanelSection label="Range">
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-text-tertiary">In</span>
            <input
              aria-label="Segment in"
              className="h-8 w-full rounded-md border border-border bg-background px-2 font-mono text-xs tabular-nums text-text shadow-xs transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              data-testid="segment-in-input"
              type="text"
              value={inValue}
              onBlur={commitIn}
              onChange={(e) => setInValue(e.target.value)}
              onKeyDown={handleKey(commitIn)}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-text-tertiary">Out</span>
            <input
              aria-label="Segment out"
              className="h-8 w-full rounded-md border border-border bg-background px-2 font-mono text-xs tabular-nums text-text shadow-xs transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              data-testid="segment-out-input"
              type="text"
              value={outValue}
              onBlur={commitOut}
              onChange={(e) => setOutValue(e.target.value)}
              onKeyDown={handleKey(commitOut)}
            />
          </label>
        </div>
        <div className="mt-1 flex items-center gap-2 text-xs text-text-tertiary">
          <span>Duration</span>
          <span
            className="font-mono tabular-nums text-text-secondary"
            data-testid="segment-duration"
          >
            {formatTimecode(duration)}
          </span>
        </div>
      </PanelSection>

      <div className="border-t border-border" />

      <PanelSection label="Play mode">
        <div
          aria-label="Segment play mode"
          className="inline-flex w-full overflow-hidden rounded-md border border-border"
          data-testid="segment-playmode-group"
          role="radiogroup"
        >
          {PLAY_MODES.map((mode) => {
            const checked = segPlayMode === mode.value;
            return (
              <label
                key={mode.value}
                className={cn(
                  'flex flex-1 cursor-pointer items-center justify-center px-2 py-1 text-xs transition-colors',
                  checked
                    ? 'bg-fill text-text'
                    : 'text-text-secondary hover:bg-fill/60',
                )}
              >
                <input
                  checked={checked}
                  className="sr-only"
                  data-testid={`segment-playmode-${mode.value}`}
                  name="segment-playmode"
                  type="radio"
                  value={mode.value}
                  onChange={() => onPlayModeChange(mode.value)}
                />
                {mode.label}
              </label>
            );
          })}
        </div>
      </PanelSection>

      <div className="border-t border-border" />

      {segPlayMode === 'normal' || segPlayMode === 'reverse' ? (
        <PanelSection label="Speed">
          <div
            className="flex flex-wrap gap-1"
            data-testid="segment-speed-chips"
          >
            {SPEED_PRESETS.map((preset) => {
              const active = Math.abs(segSpeed - preset) < 1e-6;
              return (
                <button
                  data-testid={`segment-speed-${preset}`}
                  key={preset}
                  type="button"
                  className={cn(
                    'inline-flex h-7 items-center justify-center rounded-md border px-2 text-xs font-medium transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40',
                    active
                      ? 'border-accent bg-accent/15 text-text'
                      : 'border-border bg-background-secondary text-text-secondary hover:bg-fill',
                  )}
                  onClick={() => onSpeedChange(preset)}
                >
                  {preset}x
                </button>
              );
            })}
            <input
              aria-label="Segment speed"
              className="ml-1 h-7 w-16 rounded-md border border-border bg-background px-2 font-mono text-xs tabular-nums text-text shadow-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              data-testid="segment-speed-input"
              max={10}
              min={0.05}
              step={0.05}
              type="number"
              value={speedValue}
              onBlur={commitSpeed}
              onChange={(e) => setSpeedValue(e.target.value)}
              onKeyDown={handleKey(commitSpeed)}
            />
          </div>
          {segPlayMode === 'reverse' ? (
            <p
              className="mt-2 text-xs text-text-tertiary"
              data-testid="segment-reverse-hint"
            >
              Preview plays normal direction. Reverse is applied at export.
            </p>
          ) : null}
        </PanelSection>
      ) : null}

      {segPlayMode === 'freeze' ? (
        <PanelSection label="Freeze duration">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-text-tertiary">Seconds</span>
            <input
              aria-label="Segment freeze duration"
              className="h-8 w-full rounded-md border border-border bg-background px-2 font-mono text-xs tabular-nums text-text shadow-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              data-testid="segment-freeze-input"
              min={0.001}
              step={0.05}
              type="number"
              value={freezeValue}
              onBlur={commitFreeze}
              onChange={(e) => setFreezeValue(e.target.value)}
              onKeyDown={handleKey(commitFreeze)}
            />
          </label>
        </PanelSection>
      ) : null}

      <div className="border-t border-border" />

      <PanelSection label="Label">
        <input
          aria-label="Segment label"
          className="h-8 w-full rounded-md border border-border bg-background px-2 text-sm text-text shadow-xs transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          data-testid="segment-label-input"
          placeholder="Add a label…"
          type="text"
          value={labelValue}
          onBlur={commitLabel}
          onChange={(e) => setLabelValue(e.target.value)}
          onKeyDown={handleKey(commitLabel)}
        />
      </PanelSection>

      <div className="border-t border-border" />

      <PanelSection>
        <div className="flex flex-col gap-1.5">
          <Button
            data-testid="segment-split"
            type="button"
            variant="secondary"
            onClick={onSplit}
          >
            <Split aria-hidden className="size-3.5" />
            Split here
          </Button>
          <div className="flex gap-1.5">
            <Button
              className="flex-1"
              data-testid="segment-jump-in"
              type="button"
              variant="secondary"
              onClick={onJumpIn}
            >
              <SkipBack aria-hidden className="size-3.5" />
              Jump to in
            </Button>
            <Button
              className="flex-1"
              data-testid="segment-jump-out"
              type="button"
              variant="secondary"
              onClick={onJumpOut}
            >
              <SkipForward aria-hidden className="size-3.5" />
              Jump to out
            </Button>
          </div>
          <Button
            data-testid="segment-delete"
            type="button"
            variant="secondary"
            onClick={onDelete}
          >
            <Trash2 aria-hidden className="size-3.5" />
            Delete segment
          </Button>
        </div>
      </PanelSection>
    </Panel>
  );
}
