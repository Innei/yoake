import {
  ChevronLeft,
  ChevronRight,
  PanelRightClose,
  PanelRightOpen,
  Pause,
  Play,
  Scissors,
  SkipBack,
  SkipForward,
  Volume1,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useEffect } from 'react';

import { Button } from '~/components/ui/button';
import { Slider } from '~/components/ui/slider';
import { cn } from '~/lib/cn';
import { useEditModeStore } from '~/state/editModeStore';
import { useEditStore } from '~/state/editStore';
import { useLayoutStore } from '~/state/layoutStore';
import { usePreviewCutStore } from '~/state/previewCutStore';

import { Timeline } from './transport/timeline';

const FALLBACK_FPS = 30;

function pad(n: number, w = 2): string {
  return n.toString().padStart(w, '0');
}

function formatTimecode(seconds: number, fps: number): string {
  const safe = Number.isFinite(seconds) && seconds >= 0 ? seconds : 0;
  const total = Math.floor(safe);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const f = Math.floor((safe - total) * fps);
  return `${pad(h)}:${pad(m)}:${pad(s)}:${pad(f)}`;
}

function frameIndex(seconds: number, fps: number): number {
  if (!Number.isFinite(seconds) || !Number.isFinite(fps) || fps <= 0) return 0;
  return Math.round(seconds * fps);
}

export function Transport() {
  const currentTime = useEditStore((s) => s.currentTime);
  const isPlaying = useEditStore((s) => s.isPlaying);
  const duration = useEditStore((s) => s.duration);
  const fps = useEditStore((s) => s.fps);
  const volume = useEditStore((s) => s.volume);
  const muted = useEditStore((s) => s.muted);
  const setCurrentTime = useEditStore((s) => s.setCurrentTime);
  const setPlaying = useEditStore((s) => s.setPlaying);
  const setVolume = useEditStore((s) => s.setVolume);
  const toggleMuted = useEditStore((s) => s.toggleMuted);
  const inspectorCollapsed = useLayoutStore((s) => s.inspectorCollapsed);
  const toggleInspector = useLayoutStore((s) => s.toggleInspector);
  const mode = useEditModeStore((s) => s.mode);
  const isEdit = mode === 'edit';
  const clipsWidth = useLayoutStore((s) =>
    mode === 'edit' ? s.edit.clipsWidth : s.view.clipsWidth,
  );
  const previewCut = usePreviewCutStore((s) => s.previewCut);
  const togglePreviewCut = usePreviewCutStore((s) => s.toggle);

  const effectiveFps = fps && fps > 0 ? fps : FALLBACK_FPS;
  const totalFrames = frameIndex(duration, effectiveFps);
  const currentFrame = frameIndex(currentTime, effectiveFps);
  const framesPerSecond = Math.max(1, Math.round(effectiveFps));
  const frameInSecond = currentFrame % framesPerSecond;

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (
          tag === 'INPUT' ||
          tag === 'TEXTAREA' ||
          target.isContentEditable
        ) {
          return;
        }
      }
      if (event.code === 'Space') {
        event.preventDefault();
        setPlaying(!useEditStore.getState().isPlaying);
        return;
      }
      if (event.code === 'ArrowLeft' || event.code === 'ArrowRight') {
        const state = useEditStore.getState();
        if (state.isPlaying) return;
        event.preventDefault();
        event.stopPropagation();
        const stride = event.shiftKey ? 10 : 1;
        const delta = (event.code === 'ArrowLeft' ? -1 : 1) * stride;
        const next = Math.max(
          0,
          Math.min(duration, state.currentTime + delta / effectiveFps),
        );
        setCurrentTime(next);
      }
    }
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [duration, effectiveFps, setCurrentTime, setPlaying]);

  const togglePlay = () => setPlaying(!isPlaying);
  const step = (delta: number) => {
    if (isPlaying) return;
    const next = Math.max(
      0,
      Math.min(duration, currentTime + delta / effectiveFps),
    );
    setCurrentTime(next);
  };

  const disabled = duration <= 0;

  return (
    <div className="flex h-full min-h-0 items-center gap-3 pr-3">
      <div
        className="flex shrink-0 flex-col justify-center px-3 leading-tight"
        style={{ width: clipsWidth }}
      >
        <div className="truncate font-mono text-sm tabular-nums text-text">
          {formatTimecode(currentTime, effectiveFps)}
        </div>
        <div className="truncate font-mono text-[10px] tabular-nums text-text-tertiary">
          {currentFrame}/{totalFrames}f · {effectiveFps.toFixed(2)} fps
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <TransportButton
          aria-label="Step back 1 frame"
          disabled={disabled || isPlaying}
          title="Step back (←)"
          onClick={() => step(-1)}
        >
          <ChevronLeft aria-hidden className="size-4" />
        </TransportButton>
        <TransportButton
          aria-label="Skip back 10 frames"
          disabled={disabled || isPlaying}
          title="Skip back 10f (Shift+←)"
          onClick={() => step(-10)}
        >
          <SkipBack aria-hidden className="size-3.5" />
        </TransportButton>
        <Button
          aria-label={isPlaying ? 'Pause' : 'Play'}
          className="size-9 rounded-full focus-visible:ring-offset-2 focus-visible:ring-offset-background-secondary"
          disabled={disabled}
          size="icon"
          title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
          type="button"
          variant="primary"
          onClick={togglePlay}
        >
          {isPlaying ? (
            <Pause aria-hidden className="size-4 fill-current" />
          ) : (
            <Play aria-hidden className="ml-0.5 size-4 fill-current" />
          )}
        </Button>
        <TransportButton
          aria-label="Skip forward 10 frames"
          disabled={disabled || isPlaying}
          title="Skip forward 10f (Shift+→)"
          onClick={() => step(10)}
        >
          <SkipForward aria-hidden className="size-3.5" />
        </TransportButton>
        <TransportButton
          aria-label="Step forward 1 frame"
          disabled={disabled || isPlaying}
          title="Step forward (→)"
          onClick={() => step(1)}
        >
          <ChevronRight aria-hidden className="size-4" />
        </TransportButton>
        <button
          aria-label="Preview cut"
          aria-pressed={previewCut}
          data-testid="transport-preview-cut-toggle"
          title="Preview cut (skip discard regions, respect speed/freeze)"
          type="button"
          className={cn(
            'ml-1 inline-flex size-7 items-center justify-center rounded-md',
            'transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40',
            previewCut
              ? 'bg-accent text-white shadow-xs hover:opacity-90'
              : 'text-text-secondary hover:bg-fill hover:text-text',
          )}
          onClick={togglePreviewCut}
        >
          <Scissors aria-hidden className="size-3.5" />
        </button>
      </div>

      <div className="flex h-full min-w-0 flex-1 items-center">
        <Timeline.Root
          data-testid="transport-timeline"
          duration={duration}
          fps={effectiveFps}
          readOnly={!isEdit}
          value={currentTime}
          onChange={setCurrentTime}
        >
          <Timeline.Track>
            <Timeline.Progress />
            <Timeline.SegmentLayer />
            <Timeline.MarkerLayer />
            <Timeline.Playhead />
          </Timeline.Track>
        </Timeline.Root>
      </div>

      <div className="shrink-0 font-mono text-xs tabular-nums text-text-tertiary">
        {pad(frameInSecond)}/{framesPerSecond}f
      </div>

      <VolumeControl
        muted={muted}
        volume={volume}
        onToggleMute={toggleMuted}
        onVolumeChange={setVolume}
      />

      <button
        type="button"
        aria-label={
          inspectorCollapsed ? 'Show inspector' : 'Hide inspector'
        }
        className={cn(
          'inline-flex size-7 shrink-0 items-center justify-center rounded-md',
          'text-text-tertiary transition-colors hover:bg-fill hover:text-text',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40',
        )}
        title={
          inspectorCollapsed
            ? 'Show inspector (⌘B)'
            : 'Hide inspector (⌘B)'
        }
        onClick={toggleInspector}
      >
        {inspectorCollapsed ? (
          <PanelRightOpen aria-hidden className="size-4" />
        ) : (
          <PanelRightClose aria-hidden className="size-4" />
        )}
      </button>
    </div>
  );
}

function VolumeControl({
  muted,
  volume,
  onToggleMute,
  onVolumeChange,
}: {
  muted: boolean;
  onToggleMute: () => void;
  onVolumeChange: (volume: number) => void;
  volume: number;
}) {
  const effective = muted ? 0 : volume;
  const Icon = muted || volume <= 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <button
        aria-label={muted ? 'Unmute' : 'Mute'}
        title={muted ? 'Unmute' : 'Mute'}
        type="button"
        className={cn(
          'inline-flex size-7 items-center justify-center rounded-md',
          'text-text-tertiary transition-colors hover:bg-fill hover:text-text',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40',
        )}
        onClick={onToggleMute}
      >
        <Icon aria-hidden className="size-4" />
      </button>
      <Slider
        aria-label="Volume"
        className="w-20"
        max={1}
        min={0}
        step={0.01}
        thumbClassName="size-3 border-0 bg-accent"
        value={effective}
        onValueChange={onVolumeChange}
      />
    </div>
  );
}

function TransportButton({
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        'inline-flex size-7 items-center justify-center rounded-md',
        'text-text-secondary transition-colors hover:bg-fill hover:text-text',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40',
        'disabled:pointer-events-none disabled:opacity-30',
        className,
      )}
    >
      {children}
    </button>
  );
}
