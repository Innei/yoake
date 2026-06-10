import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useClipsStore } from '~/features/clips/clipsStore';
import { useEditModeStore } from '~/features/edit/editModeStore';

import { EditToggleButton } from '../components/EditToggleButton';

function resetStores(): void {
  useEditModeStore.setState({ mode: 'view', outlineSelection: { kind: 'none' } });
  useClipsStore.setState({
    clips: [],
    selectedClipId: undefined,
    directoryHandle: undefined,
  });
}

beforeEach(() => {
  resetStores();
});

afterEach(() => {
  cleanup();
});

describe('EditToggleButton', () => {
  it('renders Edit text for variant="edit"', () => {
    const { getByTestId } = render(<EditToggleButton variant="edit" />);
    const btn = getByTestId('edit-toggle-edit');
    expect(btn.textContent).toContain('Edit');
    expect(btn.textContent).toContain('E');
  });

  it('renders Done text for variant="done"', () => {
    const { getByTestId } = render(<EditToggleButton variant="done" />);
    const btn = getByTestId('edit-toggle-done');
    expect(btn.textContent).toContain('Done');
    expect(btn.textContent).toContain('Esc');
  });

  it('is disabled when no clip is selected (variant=edit)', () => {
    const { getByTestId } = render(<EditToggleButton variant="edit" />);
    const btn = getByTestId('edit-toggle-edit') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.getAttribute('aria-disabled')).toBe('true');
    expect(btn.getAttribute('title')).toBe('Select a clip first');
  });

  it('is enabled when a clip is selected and toggles edit mode on click', () => {
    useClipsStore.setState({ selectedClipId: 'clip-1' });
    const toggleSpy = vi.spyOn(useEditModeStore.getState(), 'toggle');

    const { getByTestId } = render(<EditToggleButton variant="edit" />);
    const btn = getByTestId('edit-toggle-edit') as HTMLButtonElement;

    expect(btn.disabled).toBe(false);
    fireEvent.click(btn);
    expect(toggleSpy).toHaveBeenCalledTimes(1);

    toggleSpy.mockRestore();
  });

  it('does not invoke toggle when disabled button is clicked', () => {
    const toggleSpy = vi.spyOn(useEditModeStore.getState(), 'toggle');

    const { getByTestId } = render(<EditToggleButton variant="edit" />);
    const btn = getByTestId('edit-toggle-edit') as HTMLButtonElement;

    fireEvent.click(btn);
    expect(toggleSpy).not.toHaveBeenCalled();

    toggleSpy.mockRestore();
  });

  it('done variant remains enabled regardless of clip selection', () => {
    const { getByTestId } = render(<EditToggleButton variant="done" />);
    const btn = getByTestId('edit-toggle-done') as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
  });
});
