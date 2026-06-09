import { beforeEach, describe, expect, it } from 'vitest';

import { usePreviewCutStore } from '../previewCutStore';

beforeEach(() => {
  usePreviewCutStore.setState({ previewCut: false });
});

describe('previewCutStore', () => {
  it('defaults to false', () => {
    expect(usePreviewCutStore.getState().previewCut).toBe(false);
  });

  it('setPreviewCut flips the value', () => {
    usePreviewCutStore.getState().setPreviewCut(true);
    expect(usePreviewCutStore.getState().previewCut).toBe(true);
  });

  it('toggle inverts the value', () => {
    usePreviewCutStore.getState().toggle();
    expect(usePreviewCutStore.getState().previewCut).toBe(true);
    usePreviewCutStore.getState().toggle();
    expect(usePreviewCutStore.getState().previewCut).toBe(false);
  });
});
