import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useEditModeStore } from '~/state/editModeStore';
import {
  CLIPS_WIDTH_DEFAULT,
  INSPECTOR_WIDTH_DEFAULT,
  useLayoutStore,
} from '~/state/layoutStore';

import { Shell } from '../Shell';

vi.mock('../Preview', () => ({
  Preview: () => <div data-testid="preview-mock" />,
}));

vi.mock('../Transport', () => ({
  Transport: () => <div data-testid="transport-mock" />,
}));

vi.mock('../ClipList', () => ({
  ClipList: () => <div data-testid="clip-list-mock" />,
}));

vi.mock('../Inspector', () => ({
  Inspector: () => <div data-testid="inspector-mock" />,
}));

vi.mock('../ExportPanel', () => ({
  ExportPanel: () => <div data-testid="export-panel-mock" />,
}));

function resetEditMode(): void {
  useEditModeStore.setState({ mode: 'view', outlineSelection: { kind: 'none' } });
}

function resetLayout(): void {
  useLayoutStore.setState({
    view: { clipsWidth: CLIPS_WIDTH_DEFAULT, inspectorWidth: INSPECTOR_WIDTH_DEFAULT },
    edit: { clipsWidth: CLIPS_WIDTH_DEFAULT, inspectorWidth: INSPECTOR_WIDTH_DEFAULT },
    inspectorCollapsed: false,
  });
}

beforeEach(() => {
  resetEditMode();
  resetLayout();
});

afterEach(() => {
  cleanup();
});

describe('Shell', () => {
  it('renders the ViewLeftPanel content in view mode', () => {
    const { getByTestId, queryByTestId } = render(<Shell />);
    expect(getByTestId('clip-list-mock')).toBeTruthy();
    expect(getByTestId('view-edit-button-slot')).toBeTruthy();
    expect(queryByTestId('edit-left-placeholder')).toBeNull();
  });

  it('renders the ViewRightPanel content in view mode', () => {
    const { getByTestId, queryByTestId } = render(<Shell />);
    expect(getByTestId('inspector-mock')).toBeTruthy();
    expect(queryByTestId('edit-right-placeholder')).toBeNull();
  });

  it('renders the edit placeholders in edit mode', () => {
    useEditModeStore.setState({ mode: 'edit' });
    const { getByTestId, queryByTestId } = render(<Shell />);
    expect(getByTestId('edit-left-placeholder')).toBeTruthy();
    expect(getByTestId('edit-right-placeholder')).toBeTruthy();
    expect(queryByTestId('clip-list-mock')).toBeNull();
    expect(queryByTestId('inspector-mock')).toBeNull();
  });

  it('resizing clips in edit mode updates edit widths only', () => {
    useEditModeStore.setState({ mode: 'edit' });
    const { container } = render(<Shell />);
    const handles = container.querySelectorAll('[role="separator"]');
    expect(handles.length).toBeGreaterThanOrEqual(1);
    const clipsHandle = handles[0]!;
    clipsHandle.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));

    const state = useLayoutStore.getState();
    expect(state.edit.clipsWidth).not.toBe(CLIPS_WIDTH_DEFAULT);
    expect(state.view.clipsWidth).toBe(CLIPS_WIDTH_DEFAULT);
  });

  it('resizing inspector in view mode updates view widths only', () => {
    const { container } = render(<Shell />);
    const handles = container.querySelectorAll('[role="separator"]');
    expect(handles.length).toBe(2);
    const inspectorHandle = handles[1]!;
    inspectorHandle.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));

    const state = useLayoutStore.getState();
    expect(state.view.inspectorWidth).not.toBe(INSPECTOR_WIDTH_DEFAULT);
    expect(state.edit.inspectorWidth).toBe(INSPECTOR_WIDTH_DEFAULT);
  });
});
