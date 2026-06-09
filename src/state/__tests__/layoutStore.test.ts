import { beforeEach, describe, expect, it } from 'vitest';

import {
  CLIPS_WIDTH_DEFAULT,
  CLIPS_WIDTH_MAX,
  CLIPS_WIDTH_MIN,
  INSPECTOR_WIDTH_DEFAULT,
  INSPECTOR_WIDTH_MAX,
  INSPECTOR_WIDTH_MIN,
  useLayoutStore,
} from '../layoutStore';

function resetStore(): void {
  useLayoutStore.setState({
    view: { clipsWidth: CLIPS_WIDTH_DEFAULT, inspectorWidth: INSPECTOR_WIDTH_DEFAULT },
    edit: { clipsWidth: CLIPS_WIDTH_DEFAULT, inspectorWidth: INSPECTOR_WIDTH_DEFAULT },
    inspectorCollapsed: false,
  });
}

describe('useLayoutStore', () => {
  beforeEach(() => {
    resetStore();
  });

  it('widthsFor returns the correct mode-scoped widths', () => {
    useLayoutStore.setState({
      view: { clipsWidth: 222, inspectorWidth: 333 },
      edit: { clipsWidth: 244, inspectorWidth: 355 },
    });
    const state = useLayoutStore.getState();
    expect(state.widthsFor('view')).toEqual({ clipsWidth: 222, inspectorWidth: 333 });
    expect(state.widthsFor('edit')).toEqual({ clipsWidth: 244, inspectorWidth: 355 });
  });

  it('setClipsWidth("edit", x) does not affect view widths', () => {
    const { setClipsWidth } = useLayoutStore.getState();
    setClipsWidth('edit', 300);
    const state = useLayoutStore.getState();
    expect(state.edit.clipsWidth).toBe(300);
    expect(state.view.clipsWidth).toBe(CLIPS_WIDTH_DEFAULT);
  });

  it('setClipsWidth("view", x) does not affect edit widths', () => {
    const { setClipsWidth } = useLayoutStore.getState();
    setClipsWidth('view', 260);
    const state = useLayoutStore.getState();
    expect(state.view.clipsWidth).toBe(260);
    expect(state.edit.clipsWidth).toBe(CLIPS_WIDTH_DEFAULT);
  });

  it('setInspectorWidth scopes per mode', () => {
    const { setInspectorWidth } = useLayoutStore.getState();
    setInspectorWidth('edit', 400);
    const state = useLayoutStore.getState();
    expect(state.edit.inspectorWidth).toBe(400);
    expect(state.view.inspectorWidth).toBe(INSPECTOR_WIDTH_DEFAULT);
  });

  it('clamps clipsWidth to the configured min/max', () => {
    const { setClipsWidth } = useLayoutStore.getState();
    setClipsWidth('view', CLIPS_WIDTH_MIN - 50);
    expect(useLayoutStore.getState().view.clipsWidth).toBe(CLIPS_WIDTH_MIN);
    setClipsWidth('view', CLIPS_WIDTH_MAX + 99);
    expect(useLayoutStore.getState().view.clipsWidth).toBe(CLIPS_WIDTH_MAX);
  });

  it('clamps inspectorWidth to the configured min/max', () => {
    const { setInspectorWidth } = useLayoutStore.getState();
    setInspectorWidth('edit', INSPECTOR_WIDTH_MIN - 100);
    expect(useLayoutStore.getState().edit.inspectorWidth).toBe(INSPECTOR_WIDTH_MIN);
    setInspectorWidth('edit', INSPECTOR_WIDTH_MAX + 100);
    expect(useLayoutStore.getState().edit.inspectorWidth).toBe(INSPECTOR_WIDTH_MAX);
  });

  it('toggleInspector flips inspectorCollapsed', () => {
    const initial = useLayoutStore.getState().inspectorCollapsed;
    useLayoutStore.getState().toggleInspector();
    expect(useLayoutStore.getState().inspectorCollapsed).toBe(!initial);
    useLayoutStore.getState().toggleInspector();
    expect(useLayoutStore.getState().inspectorCollapsed).toBe(initial);
  });

  it('setInspectorCollapsed sets explicit value', () => {
    useLayoutStore.getState().setInspectorCollapsed(true);
    expect(useLayoutStore.getState().inspectorCollapsed).toBe(true);
    useLayoutStore.getState().setInspectorCollapsed(false);
    expect(useLayoutStore.getState().inspectorCollapsed).toBe(false);
  });
});

describe('useLayoutStore persist migration', () => {
  beforeEach(() => {
    resetStore();
  });

  it('migrates the legacy v0 shape into per-mode widths', () => {
    const persistOptions = (
      useLayoutStore as unknown as {
        persist: { getOptions: () => { migrate?: (s: unknown, v: number) => unknown } };
      }
    ).persist.getOptions();
    const migrate = persistOptions.migrate;
    expect(migrate).toBeDefined();
    const result = migrate!(
      { clipsWidth: 250, inspectorWidth: 350, inspectorCollapsed: true },
      0,
    ) as {
      edit: { clipsWidth: number; inspectorWidth: number };
      inspectorCollapsed: boolean;
      view: { clipsWidth: number; inspectorWidth: number };
    };
    expect(result.view).toEqual({ clipsWidth: 250, inspectorWidth: 350 });
    expect(result.edit).toEqual({ clipsWidth: 250, inspectorWidth: 350 });
    expect(result.inspectorCollapsed).toBe(true);
  });

  it('falls back to defaults when legacy fields are missing', () => {
    const persistOptions = (
      useLayoutStore as unknown as {
        persist: { getOptions: () => { migrate?: (s: unknown, v: number) => unknown } };
      }
    ).persist.getOptions();
    const result = persistOptions.migrate!({}, 0) as {
      edit: { clipsWidth: number; inspectorWidth: number };
      inspectorCollapsed: boolean;
      view: { clipsWidth: number; inspectorWidth: number };
    };
    expect(result.view).toEqual({
      clipsWidth: CLIPS_WIDTH_DEFAULT,
      inspectorWidth: INSPECTOR_WIDTH_DEFAULT,
    });
    expect(result.edit).toEqual({
      clipsWidth: CLIPS_WIDTH_DEFAULT,
      inspectorWidth: INSPECTOR_WIDTH_DEFAULT,
    });
    expect(result.inspectorCollapsed).toBe(false);
  });
});
