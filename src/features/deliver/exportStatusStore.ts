import { create } from 'zustand';

export interface ExportRunningStatus {
  cancel: () => void;
  description: string;
  kind: 'running';
  ratio: number | null;
}

export type ExportStatus = { kind: 'idle' } | ExportRunningStatus;

interface ExportStatusState {
  setStatus: (status: ExportStatus) => void;
  status: ExportStatus;
  updateRunning: (patch: Partial<Omit<ExportRunningStatus, 'kind'>>) => void;
}

export const useExportStatusStore = create<ExportStatusState>((set) => ({
  status: { kind: 'idle' },
  setStatus: (status) => set({ status }),
  updateRunning: (patch) =>
    set((state) =>
      state.status.kind === 'running'
        ? { status: { ...state.status, ...patch } }
        : state,
    ),
}));
