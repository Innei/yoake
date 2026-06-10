import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  confirm,
  confirmModal,
  createModal,
  ModalHost,
} from '~/components/ui/modal';

afterEach(() => {
  cleanup();
});

function clickButton(label: string | RegExp): void {
  const btn = screen.getByRole('button', { name: label });
  fireEvent.click(btn);
}

describe('confirm', () => {
  it('resolves false when Cancel is clicked', async () => {
    render(<ModalHost />);
    let promise!: Promise<boolean>;
    act(() => {
      promise = confirm({ title: 'Delete?', content: 'Are you sure?' });
    });

    expect(await screen.findByText('Delete?')).toBeTruthy();
    act(() => clickButton('Cancel'));
    await expect(promise).resolves.toBe(false);
  });

  it('resolves true when OK is clicked', async () => {
    render(<ModalHost />);
    let promise!: Promise<boolean>;
    act(() => {
      promise = confirm({ title: 'Delete?', okText: 'Delete' });
    });
    expect(await screen.findByText('Delete?')).toBeTruthy();
    act(() => clickButton('Delete'));
    await expect(promise).resolves.toBe(true);
  });

  it('resolves false on ESC dismiss', async () => {
    render(<ModalHost />);
    let promise!: Promise<boolean>;
    act(() => {
      promise = confirm({ title: 'Pick' });
    });
    const dialog = await screen.findByRole('dialog');
    act(() => {
      fireEvent.keyDown(dialog, { key: 'Escape', code: 'Escape' });
    });
    await expect(promise).resolves.toBe(false);
  });
});

describe('confirmModal async onOk', () => {
  it('disables buttons while onOk is pending, then closes on resolve', async () => {
    render(<ModalHost />);
    let release!: () => void;
    const pending = new Promise<void>((r) => {
      release = r;
    });
    act(() => {
      confirmModal({ title: 'Run', onOk: () => pending });
    });

    expect(await screen.findByText('Run')).toBeTruthy();
    act(() => clickButton('OK'));

    const ok = screen.getByRole('button', { name: 'OK' }) as HTMLButtonElement;
    const cancel = screen.getByRole('button', { name: 'Cancel' }) as HTMLButtonElement;
    expect(ok.disabled).toBe(true);
    expect(cancel.disabled).toBe(true);

    await act(async () => {
      release();
      await pending;
    });

    await waitFor(() => expect(screen.queryByText('Run')).toBeNull());
  });

  it('stays open if onOk rejects', async () => {
    render(<ModalHost />);
    const err = new Error('boom');
    act(() => {
      confirmModal({
        title: 'Run',
        onOk: () => Promise.reject(err),
      });
    });
    expect(await screen.findByText('Run')).toBeTruthy();

    await act(async () => {
      clickButton('OK');
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText('Run')).toBeTruthy();
    const ok = screen.getByRole('button', { name: 'OK' }) as HTMLButtonElement;
    expect(ok.disabled).toBe(false);
  });
});

describe('createModal stack', () => {
  it('closing the top modal leaves the bottom one open', async () => {
    render(<ModalHost />);
    let bottom!: ReturnType<typeof createModal>;
    let top!: ReturnType<typeof createModal>;
    act(() => {
      bottom = createModal({ title: 'Bottom', content: <div>Bottom body</div> });
      top = createModal({ title: 'Top', content: <div>Top body</div> });
    });

    expect(await screen.findByText('Top')).toBeTruthy();
    expect(screen.getByText('Bottom')).toBeTruthy();

    act(() => top.close());
    await waitFor(() => expect(screen.queryByText('Top')).toBeNull());
    expect(screen.getByText('Bottom')).toBeTruthy();

    act(() => bottom.close());
    await waitFor(() => expect(screen.queryByText('Bottom')).toBeNull());
  });

  it('update merges new props into a live modal', async () => {
    render(<ModalHost />);
    let instance!: ReturnType<typeof createModal>;
    act(() => {
      instance = createModal({ title: 'Old', content: <div>body</div> });
    });
    expect(await screen.findByText('Old')).toBeTruthy();
    act(() => instance.update({ title: 'New' }));
    expect(await screen.findByText('New')).toBeTruthy();
    act(() => instance.destroy());
  });
});

describe('confirm onCancel side effect', () => {
  it('invokes config.onCancel on dismiss', async () => {
    render(<ModalHost />);
    const onCancel = vi.fn();
    let promise!: Promise<boolean>;
    act(() => {
      promise = confirm({ title: 'X', onCancel });
    });
    expect(await screen.findByText('X')).toBeTruthy();
    act(() => clickButton('Cancel'));
    await expect(promise).resolves.toBe(false);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
