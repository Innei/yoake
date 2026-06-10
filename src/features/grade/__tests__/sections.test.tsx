import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { useEditStore } from '~/features/edit/editStore';
import { usePrefsStore } from '~/features/preferences/prefsStore';

import { ExposureSection } from '../components/ExposureSection';
import { LutSection } from '../components/LutSection';

afterEach(() => {
  cleanup();
  useEditStore.getState().reset();
  usePrefsStore.setState({
    clipDirHandle: undefined,
    exportDirHandle: undefined,
    lastSession: undefined,
    lutDirHandle: undefined,
  });
});

describe('LutSection', () => {
  it('renders without crashing when no lut directory is set', () => {
    const { getByText } = render(<LutSection />);
    expect(getByText(/pick lut folder/i)).toBeTruthy();
  });
});

describe('ExposureSection', () => {
  it('renders without crashing and shows the exposure meta', () => {
    const { getByLabelText, getByText } = render(<ExposureSection />);
    expect(getByLabelText('Exposure')).toBeTruthy();
    expect(getByText('+0.0 EV')).toBeTruthy();
  });
});
