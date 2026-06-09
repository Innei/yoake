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
import { cn } from '~/lib/cn';
import { useEditModeStore } from '~/state/editModeStore';
import { useEditStore } from '~/state/editStore';
import { useLayoutStore } from '~/state/layoutStore';
import { usePreviewCutStore } from '~/state/previewCutStore';

import { MarkerLayer } from './transport/MarkerLayer';
import { SegmentLayer } from './transport/SegmentLayer';

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
  const clipsWidth = useLayoutStore((s) => s.clipsWidth);
  const mode = useEditModeStore((s) => s.mode);
  const isEdit = mode === 'edit';
  const previewCut = usePreviewCutStore((s) => s.previewCut);
  const togglePreviewCut = usePreviewCutStore((s) => s.toggle);

  const effectiveFps = fps && fps > 0 ? fps : FALLBACK_FPS;
  const totalFrames = frameIndex(duration, effectiveFps);
  const currentFrame = frameIndex(currentTime, effectiveFps);
  const framesPerSecond = Math.max(1, Math.round(effectiveFps));
  const frameInSecond = currentFrame % framesPerSecond;
  const progress = duration > 0 ? Math.min(1, currentTime / duration) : 0;

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
        const stride = event.shiftKey ? 10 : 1;
        const delta = (event.code === 'ArrowLeft' ? -1 : 1) * stride;
        const next = Math.max(
          0,
          Math.min(duration, state.currentTime + delta / effectiveFps),
        );
        setCurrentTime(next);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [duration, effectiveFps, setCurrentTime, setPlaying]);

  const togglePlay = () => setPlaying(!isPlaying);
  const onScrub = (event: React.ChangeEvent<HTMLInputElement>) => {
    setCurrentTime(Number(event.target.value));
  };
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

      <div className="flex h-full min-w-0 flex-1 flex-col justify-center">
        <div
          data-testid="transport-segment-row"
          style={{ height: isEdit ? 28 : 16 }}
          className={cn(
            'relative w-full shrink-0 overflow-hidden transition-[height] duration-200 ease-in-out',
            'motion-reduce:transition-none',
          )}
        >
          <SegmentLayer readOnly={!isEdit} />
          <MarkerLayer readOnly={!isEdit} />
        </div>
        <div className="relative flex h-full min-h-0 w-full flex-1 items-center">
        <div className="pointer-events-none absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-fill" />
        <div
          aria-hidden
          className="pointer-events-none absolute left-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-accent"
          style={{ width: `${progress * 100}%` }}
        />
        <input
          aria-label="Scrubber"
          disabled={disabled}
          max={duration > 0 ? duration : 0}
          min={0}
          step={1 / effectiveFps}
          type="range"
          value={currentTime}
          className={cn(
            'relative z-10 h-3.5 w-full cursor-pointer appearance-none bg-transparent',
            '[&::-webkit-slider-runnable-track]:h-1 [&::-webkit-slider-runnable-track]:bg-transparent',
            '[&::-webkit-slider-thumb]:size-3.5 [&::-webkit-slider-thumb]:appearance-none',
            '[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-background-secondary',
            '[&::-webkit-slider-thumb]:bg-accent [&::-webkit-slider-thumb]:shadow-xs',
            '[&::-webkit-slider-thumb]:[margin-top:-5px]',
            '[&::-webkit-slider-thumb]:transition-transform [&:active::-webkit-slider-thumb]:scale-125',
            '[&::-moz-range-track]:h-1 [&::-moz-range-track]:bg-transparent',
            '[&::-moz-range-thumb]:size-3.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2',
            '[&::-moz-range-thumb]:border-background-secondary [&::-moz-range-thumb]:bg-accent',
            'disabled:cursor-not-allowed disabled:opacity-40',
            'focus-visible:outline-none [&:focus-visible::-webkit-slider-thumb]:ring-2 [&:focus-visible::-webkit-slider-thumb]:ring-accent/40',
          )}
          onChange={onScrub}
        />
        </div>
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
      <input
        aria-label="Volume"
        max={1}
        min={0}
        step={0.01}
        type="range"
        value={effective}
        className={cn(
          'h-3.5 w-20 cursor-pointer appearance-none bg-transparent',
          '[&::-webkit-slider-runnable-track]:h-1 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-fill',
          '[&::-webkit-slider-thumb]:size-3 [&::-webkit-slider-thumb]:appearance-none',
          '[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent',
          '[&::-webkit-slider-thumb]:[margin-top:-4px]',
          '[&::-moz-range-track]:h-1 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-fill',
          '[&::-moz-range-thumb]:size-3 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-accent',
          'focus-visible:outline-none [&:focus-visible::-webkit-slider-thumb]:ring-2 [&:focus-visible::-webkit-slider-thumb]:ring-accent/40',
        )}
        onChange={(event) => onVolumeChange(Number(event.target.value))}
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
