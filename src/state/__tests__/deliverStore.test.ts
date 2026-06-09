import { beforeEach, describe, expect, it } from 'vitest';

import { useDeliverStore } from '~/state/deliverStore';

function resetDeliverStore(): void {
  useDeliverStore.setState({
    container: 'mp4-h264',
    resolution: 'source',
    colorspace: 'rec709',
    bakeTrim: true,
    bakeSpeed: true,
    bakeGrade: true,
    outputMode: 'single',
  });
}

beforeEach(() => {
  resetDeliverStore();
});

describe('deliverStore defaults', () => {
  it('starts with the documented defaults', () => {
    const s = useDeliverStore.getState();
    expect(s.container).toBe('mp4-h264');
    expect(s.resolution).toBe('source');
    expect(s.colorspace).toBe('rec709');
    expect(s.bakeTrim).toBe(true);
    expect(s.bakeSpeed).toBe(true);
    expect(s.bakeGrade).toBe(true);
    expect(s.outputMode).toBe('single');
  });
});

describe('deliverStore actions', () => {
  it('setContainer updates the container', () => {
    useDeliverStore.getState().setContainer('mov-prores');
    expect(useDeliverStore.getState().container).toBe('mov-prores');
  });

  it('setResolution updates the resolution', () => {
    useDeliverStore.getState().setResolution('4k');
    expect(useDeliverStore.getState().resolution).toBe('4k');
  });

  it('setColorspace updates the colorspace', () => {
    useDeliverStore.getState().setColorspace('rec2020-hdr');
    expect(useDeliverStore.getState().colorspace).toBe('rec2020-hdr');
  });

  it('toggleBake flips bakeTrim', () => {
    useDeliverStore.getState().toggleBake('bakeTrim');
    expect(useDeliverStore.getState().bakeTrim).toBe(false);
    useDeliverStore.getState().toggleBake('bakeTrim');
    expect(useDeliverStore.getState().bakeTrim).toBe(true);
  });

  it('toggleBake flips bakeSpeed', () => {
    useDeliverStore.getState().toggleBake('bakeSpeed');
    expect(useDeliverStore.getState().bakeSpeed).toBe(false);
  });

  it('toggleBake flips bakeGrade', () => {
    useDeliverStore.getState().toggleBake('bakeGrade');
    expect(useDeliverStore.getState().bakeGrade).toBe(false);
  });

  it('setOutputMode switches between single and multi', () => {
    useDeliverStore.getState().setOutputMode('multi');
    expect(useDeliverStore.getState().outputMode).toBe('multi');
    useDeliverStore.getState().setOutputMode('single');
    expect(useDeliverStore.getState().outputMode).toBe('single');
  });
});
