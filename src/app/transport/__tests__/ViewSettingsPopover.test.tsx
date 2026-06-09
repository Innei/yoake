import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useEditStore } from '~/state/editStore';

import { ViewSettingsPopover } from '../ViewSettingsPopover';

beforeEach(() => {
  useEditStore.getState().reset();
});

afterEach(() => {
  cleanup();
});

describe('ViewSettingsPopover', () => {
  it('renders a trigger button with accessible name', () => {
    render(<ViewSettingsPopover />);
    const trigger = screen.getByTestId('transport-view-settings-trigger');
    expect(trigger).toBeTruthy();
    expect(trigger.getAttribute('aria-label')).toBe('View settings');
    expect(trigger.getAttribute('aria-haspopup')).toBeTruthy();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('opens the popover with the render-mode section when trigger is clicked', () => {
    render(<ViewSettingsPopover />);
    const trigger = screen.getByTestId('transport-view-settings-trigger');

    fireEvent.click(trigger);

    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByLabelText('Render mode')).toBeTruthy();
    expect(screen.queryByLabelText('HDR peak nits')).toBeNull();
    expect(screen.queryByLabelText('HDR strength')).toBeNull();
  });

  it('closes the popover on Escape', () => {
    render(<ViewSettingsPopover />);
    const trigger = screen.getByTestId('transport-view-settings-trigger');

    fireEvent.click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');

    fireEvent.keyDown(document.body, { key: 'Escape' });

    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('closes the popover when clicking outside', () => {
    render(
      <div>
        <button data-testid="outside" type="button">
          outside
        </button>
        <ViewSettingsPopover />
      </div>,
    );
    const trigger = screen.getByTestId('transport-view-settings-trigger');
    fireEvent.click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');

    const outside = screen.getByTestId('outside');
    fireEvent.pointerDown(outside);
    fireEvent.mouseDown(outside);
    fireEvent.click(outside);

    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });
});
