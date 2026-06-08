import { create } from 'zustand';

import type {
  GradingParams,
  HdrSettings,
  LutDescriptor,
  ParsedLut,
  PeakNits,
  RenderMode,
} from '~/types';

interface EditState {
  currentTime: number;
  duration: number;
  fps: number;
  grading: GradingParams;
  hdr: HdrSettings;
  hdrEnabled: boolean;
  isPlaying: boolean;
  lutDescriptor: LutDescriptor | undefined;
  muted: boolean;
  parsedLut: ParsedLut | undefined;
  renderMode: RenderMode;
  reset: () => void;
  setCurrentTime: (time: number) => void;
  setDuration: (duration: number) => void;
  setExposure: (value: number) => void;
  setFps: (fps: number) => void;
  setHdrEnabled: (enabled: boolean) => void;
  setHdrStrength: (value: number) => void;
  setLut: (descriptor: LutDescriptor, parsed: ParsedLut) => void;
  setMuted: (muted: boolean) => void;
  setPeakNits: (value: PeakNits) => void;
  setPlaying: (playing: boolean) => void;
  setRenderMode: (mode: RenderMode) => void;
  setVolume: (volume: number) => void;
  toggleMuted: () => void;
  volume: number;
}

const initialState = {
  currentTime: 0,
  duration: 0,
  fps: 0,
  isPlaying: false,
  lutDescriptor: undefined,
  muted: false,
  parsedLut: undefined,
  grading: { exposure: 0 },
  hdr: { peakNits: 1000 as PeakNits, strength: 0.2 },
  hdrEnabled: false,
  renderMode: 'graded' as RenderMode,
  volume: 1,
};

export const useEditStore = create<EditState>((set) => ({
  ...initialState,
  setCurrentTime: (time) => set({ currentTime: time }),
  setDuration: (duration) => set({ duration }),
  setFps: (fps) => set({ fps }),
  setPlaying: (playing) => set({ isPlaying: playing }),
  setLut: (descriptor, parsed) =>
    set({ lutDescriptor: descriptor, parsedLut: parsed }),
  setExposure: (value) =>
    set((state) => ({ grading: { ...state.grading, exposure: value } })),
  setPeakNits: (value) =>
    set((state) => ({ hdr: { ...state.hdr, peakNits: value } })),
  setHdrStrength: (value) =>
    set((state) => ({ hdr: { ...state.hdr, strength: value } })),
  setHdrEnabled: (enabled) => set({ hdrEnabled: enabled }),
  setRenderMode: (mode) => set({ renderMode: mode }),
  setVolume: (volume) =>
    set({ volume: Math.max(0, Math.min(1, volume)), muted: volume <= 0 }),
  setMuted: (muted) => set({ muted }),
  toggleMuted: () => set((state) => ({ muted: !state.muted })),
  reset: () => set({ ...initialState }),
}));
