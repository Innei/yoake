import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Inspector } from '~/app/Inspector';
import { useEditStore } from '~/state/editStore';

afterEach(() => {
  cleanup();
  useEditStore.getState().reset();
});

describe('Inspector view-mode panel', () => {
  it('renders LUT and Exposure sections', () => {
    render(<Inspector />);
    expect(screen.getByText(/inspect/i)).toBeTruthy();
    expect(screen.getByLabelText('Exposure')).toBeTruthy();
  });

  it('does not render render-mode or HDR sections (moved to Transport)', () => {
    render(<Inspector />);
    expect(screen.queryByLabelText('Render mode')).toBeNull();
    expect(screen.queryByLabelText('HDR peak nits')).toBeNull();
    expect(screen.queryByLabelText('HDR strength')).toBeNull();
  });
});
