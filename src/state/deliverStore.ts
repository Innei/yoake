import { create } from 'zustand';

export type DeliverContainer = 'mp4-h264' | 'mp4-h265' | 'mov-prores';
export type DeliverResolution = 'source' | '1080p' | '4k';
export type DeliverColorspace = 'rec709' | 'rec2020-hdr';
export type DeliverOutputMode = 'single' | 'multi';
export type DeliverBakeField = 'bakeTrim' | 'bakeSpeed' | 'bakeGrade';

interface DeliverState {
  bakeGrade: boolean;
  bakeSpeed: boolean;
  bakeTrim: boolean;
  colorspace: DeliverColorspace;
  container: DeliverContainer;
  outputMode: DeliverOutputMode;
  resolution: DeliverResolution;
  setColorspace: (value: DeliverColorspace) => void;
  setContainer: (value: DeliverContainer) => void;
  setOutputMode: (value: DeliverOutputMode) => void;
  setResolution: (value: DeliverResolution) => void;
  toggleBake: (field: DeliverBakeField) => void;
}

export const useDeliverStore = create<DeliverState>((set) => ({
  container: 'mp4-h264',
  resolution: 'source',
  colorspace: 'rec709',
  bakeTrim: true,
  bakeSpeed: true,
  bakeGrade: true,
  outputMode: 'single',
  setContainer: (value) => set({ container: value }),
  setResolution: (value) => set({ resolution: value }),
  setColorspace: (value) => set({ colorspace: value }),
  setOutputMode: (value) => set({ outputMode: value }),
  toggleBake: (field) =>
    set((state) => ({ [field]: !state[field] }) as Pick<DeliverState, DeliverBakeField>),
}));
