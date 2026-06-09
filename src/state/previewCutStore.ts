import { create } from 'zustand';

interface PreviewCutState {
  previewCut: boolean;
  setPreviewCut: (v: boolean) => void;
  toggle: () => void;
}

export const usePreviewCutStore = create<PreviewCutState>((set) => ({
  previewCut: false,
  setPreviewCut: (v) => set({ previewCut: v }),
  toggle: () => set((state) => ({ previewCut: !state.previewCut })),
}));
