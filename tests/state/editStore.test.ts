import { beforeEach, describe, expect, it } from 'vitest';

import { useEditStore } from '~/state/editStore';
import type { LutDescriptor, ParsedLut } from '~/types';

describe('editStore', () => {
  beforeEach(() => {
    useEditStore.getState().reset();
  });

  it('has the expected initial state', () => {
    const state = useEditStore.getState();
    expect(state.currentTime).toBe(0);
    expect(state.isPlaying).toBe(false);
    expect(state.lutDescriptor).toBeUndefined();
    expect(state.parsedLut).toBeUndefined();
    expect(state.grading).toEqual({ exposure: 0 });
    expect(state.hdr).toEqual({ peakNits: 1000, strength: 0.2 });
    expect(state.hdrEnabled).toBe(false);
    expect(state.renderMode).toBe('graded');
  });

  it('setCurrentTime updates currentTime', () => {
    useEditStore.getState().setCurrentTime(12.5);
    expect(useEditStore.getState().currentTime).toBe(12.5);
  });

  it('setPlaying toggles isPlaying', () => {
    useEditStore.getState().setPlaying(true);
    expect(useEditStore.getState().isPlaying).toBe(true);
    useEditStore.getState().setPlaying(false);
    expect(useEditStore.getState().isPlaying).toBe(false);
  });

  it('setLut stores descriptor and parsed data', () => {
    const descriptor: LutDescriptor = {
      id: 'lut-1',
      name: 'DJI.cube',
      handle: {} as FileSystemFileHandle,
    };
    const parsed: ParsedLut = { size: 2, data: new Float32Array(8) };
    useEditStore.getState().setLut(descriptor, parsed);
    const state = useEditStore.getState();
    expect(state.lutDescriptor).toBe(descriptor);
    expect(state.parsedLut).toBe(parsed);
  });

  it('setExposure updates grading.exposure without dropping other grading fields', () => {
    useEditStore.getState().setExposure(1.5);
    expect(useEditStore.getState().grading.exposure).toBe(1.5);
  });

  it('setPeakNits updates hdr.peakNits', () => {
    useEditStore.getState().setPeakNits(400);
    expect(useEditStore.getState().hdr.peakNits).toBe(400);
    useEditStore.getState().setPeakNits(600);
    expect(useEditStore.getState().hdr.peakNits).toBe(600);
  });

  it('setHdrStrength updates hdr.strength', () => {
    useEditStore.getState().setHdrStrength(0.45);
    expect(useEditStore.getState().hdr.strength).toBe(0.45);
  });

  it('setRenderMode switches preview rendering mode', () => {
    useEditStore.getState().setRenderMode('original');
    expect(useEditStore.getState().renderMode).toBe('original');
    useEditStore.getState().setRenderMode('graded');
    expect(useEditStore.getState().renderMode).toBe('graded');
  });

  it('reset returns state to initial defaults', () => {
    const store = useEditStore.getState();
    store.setCurrentTime(42);
    store.setPlaying(true);
    store.setExposure(2);
    store.setPeakNits(400);
    store.setHdrStrength(0.65);
    store.setHdrEnabled(true);
    store.setRenderMode('original');
    store.reset();
    const state = useEditStore.getState();
    expect(state.currentTime).toBe(0);
    expect(state.isPlaying).toBe(false);
    expect(state.grading).toEqual({ exposure: 0 });
    expect(state.hdr).toEqual({ peakNits: 1000, strength: 0.2 });
    expect(state.hdrEnabled).toBe(false);
    expect(state.renderMode).toBe('graded');
    expect(state.lutDescriptor).toBeUndefined();
    expect(state.parsedLut).toBeUndefined();
  });
});
