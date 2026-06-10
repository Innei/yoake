import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { HdrSection } from '~/features/grade/components/HdrSection';
import { useEditStore } from '~/features/edit/editStore';

describe('HdrSection', () => {
  beforeEach(() => {
    useEditStore.getState().reset();
  });

  it('updates the HDR strength control and store value', () => {
    render(<HdrSection />);

    const strength = screen.getByLabelText('HDR strength') as HTMLInputElement;
    expect(strength.disabled).toBe(true);
    expect(strength.value).toBe('0.2');

    fireEvent.click(screen.getByRole('switch'));
    expect(strength.disabled).toBe(false);

    fireEvent.change(strength, { target: { value: '0.35' } });

    expect(strength.value).toBe('0.35');
    expect(screen.getByText('0.35')).toBeTruthy();
    expect(useEditStore.getState().hdr.strength).toBe(0.35);
  });
});
