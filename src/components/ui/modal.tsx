/* eslint-disable react-refresh/only-export-components -- imperative API + host share module-scoped stack state */
import { Dialog } from '@base-ui/react/dialog';
import { X } from 'lucide-react';
import { AnimatePresence, domAnimation, LazyMotion, m } from 'motion/react';
import type { ReactNode } from 'react';
import {
  memo,
  useCallback,
  useEffect,
  useState,
  useSyncExternalStore,
} from 'react';
import { createPortal } from 'react-dom';

import { cn } from '~/lib/cn';

import { Button } from './button';

const BACKDROP_TRANSITION = { duration: 0.15, ease: 'easeOut' as const };
const POPUP_TRANSITION = { duration: 0.18, ease: [0.22, 1, 0.36, 1] as const };
const POPUP_INITIAL = { opacity: 0, scale: 0.96, y: 4 };
const POPUP_ANIMATE = { opacity: 1, scale: 1, y: 0 };
const POPUP_EXIT = { opacity: 0, scale: 0.96, y: 2 };

export interface ImperativeModalProps {
  className?: string;
  content?: ReactNode;
  footer?: ReactNode;
  maskClosable?: boolean;
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
  title?: ReactNode;
  width?: number | string;
}

export interface ModalInstance {
  close: () => void;
  destroy: () => void;
  update: (next: Partial<ImperativeModalProps>) => void;
}

export interface ModalConfirmConfig {
  cancelText?: ReactNode;
  content?: ReactNode;
  danger?: boolean;
  okText?: ReactNode;
  onCancel?: () => void;
  onOk?: () => void | Promise<void>;
  title?: ReactNode;
}

type StackEntry = { id: string; props: ImperativeModalProps };

let stack: StackEntry[] = [];
let seed = 0;
const listeners = new Set<() => void>();

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const getSnapshot = () => stack;
const EMPTY: StackEntry[] = [];
const getServerSnapshot = () => EMPTY;
const notify = () => {
  for (const l of listeners) l();
};

function updateEntry(id: string, patch: Partial<ImperativeModalProps>): void {
  let changed = false;
  stack = stack.map((e) => {
    if (e.id !== id) return e;
    changed = true;
    return { ...e, props: { ...e.props, ...patch } };
  });
  if (changed) notify();
}

function destroyEntry(id: string): void {
  const next = stack.filter((e) => e.id !== id);
  if (next.length === stack.length) return;
  stack = next;
  notify();
}

function pushEntry(props: ImperativeModalProps): string {
  const id = `modal-${++seed}`;
  stack = [...stack, { id, props: { ...props, open: props.open ?? true } }];
  notify();
  return id;
}

export function createModal(props: ImperativeModalProps): ModalInstance {
  const id = pushEntry(props);
  return {
    close: () => updateEntry(id, { open: false }),
    destroy: () => destroyEntry(id),
    update: (patch) => updateEntry(id, patch),
  };
}

export function confirmModal(config: ModalConfirmConfig): {
  close: () => void;
  destroy: () => void;
} {
  const id = `modal-${++seed}`;
  const close = () => updateEntry(id, { open: false });
  const destroy = () => destroyEntry(id);

  let settled = false;
  const fireCancel = () => {
    if (settled) return;
    settled = true;
    config.onCancel?.();
  };
  const wrappedConfig: ModalConfirmConfig = {
    ...config,
    onCancel: fireCancel,
    onOk: async () => {
      await config.onOk?.();
      settled = true;
    },
  };

  stack = [
    ...stack,
    {
      id,
      props: {
        content: <ConfirmBody close={close} config={wrappedConfig} />,
        onOpenChange: (open) => {
          if (!open) fireCancel();
        },
        open: true,
        title: config.title,
      },
    },
  ];
  notify();
  return { close, destroy };
}

export function confirm(config: ModalConfirmConfig): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    let settled = false;
    const settleOnce = (value: boolean) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    confirmModal({
      ...config,
      onCancel: () => {
        config.onCancel?.();
        settleOnce(false);
      },
      onOk: async () => {
        await config.onOk?.();
        settleOnce(true);
      },
    });
  });
}

function ConfirmBody({
  close,
  config,
}: {
  close: () => void;
  config: ModalConfirmConfig;
}): JSX.Element {
  const {
    cancelText = 'Cancel',
    content,
    danger,
    okText = 'OK',
    onCancel,
    onOk,
  } = config;
  const [loading, setLoading] = useState(false);

  const handleCancel = useCallback(() => {
    onCancel?.();
    close();
  }, [close, onCancel]);

  const handleOk = useCallback(async () => {
    if (!onOk) {
      close();
      return;
    }
    try {
      const ret = onOk();
      if (ret && typeof (ret as Promise<void>).then === 'function') {
        setLoading(true);
        await ret;
      }
    } catch {
      setLoading(false);
      return;
    }
    setLoading(false);
    close();
  }, [close, onOk]);

  return (
    <div className="flex flex-col">
      {content ? (
        <div className="px-4 pb-3 text-sm text-text-secondary">{content}</div>
      ) : null}
      <div className="flex justify-end gap-2 px-4 pb-4">
        <Button
          disabled={loading}
          type="button"
          variant="secondary"
          onClick={handleCancel}
        >
          {cancelText}
        </Button>
        <Button
          disabled={loading}
          type="button"
          variant={danger ? 'danger' : 'primary'}
          onClick={handleOk}
        >
          {okText}
        </Button>
      </div>
    </div>
  );
}

const StackItem = memo(function StackItem({ entry }: { entry: StackEntry }) {
  const {
    id,
    props: {
      className,
      content,
      footer,
      maskClosable = true,
      onOpenChange,
      open = true,
      title,
      width,
    },
  } = entry;

  const handleOpenChange = useCallback(
    (next: boolean, details?: { reason?: string }) => {
      if (!next && maskClosable === false && details?.reason === 'outside-press')
        return;
      if (!next) updateEntry(id, { open: false });
      onOpenChange?.(next);
    },
    [id, maskClosable, onOpenChange],
  );

  const handleExitComplete = useCallback(() => {
    destroyEntry(id);
  }, [id]);

  const widthStyle =
    typeof width === 'number'
      ? { maxWidth: `${width}px` }
      : width
        ? { maxWidth: width }
        : undefined;

  return (
    <Dialog.Root modal open onOpenChange={handleOpenChange}>
      <Dialog.Portal keepMounted>
        <Dialog.Backdrop
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
          render={
            <m.div
              animate={{ opacity: open ? 1 : 0 }}
              initial={{ opacity: 0 }}
              transition={BACKDROP_TRANSITION}
            />
          }
        />
        <Dialog.Popup className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 focus:outline-none">
          <AnimatePresence onExitComplete={handleExitComplete}>
            {open ? (
              <m.div
                animate={POPUP_ANIMATE}
                exit={POPUP_EXIT}
                initial={POPUP_INITIAL}
                key="popup"
                style={widthStyle}
                transition={POPUP_TRANSITION}
                className={cn(
                  'w-[min(420px,calc(100vw-2rem))] overflow-hidden rounded-xl',
                  'bg-background-secondary/95 text-text ring-1 ring-border/80',
                  'shadow-2xl shadow-black/20 backdrop-blur dark:shadow-black/50',
                  className,
                )}
              >
                {title !== undefined && title !== false && title !== null ? (
                  <div className="flex items-center justify-between gap-4 px-4 pb-2 pt-4">
                    <Dialog.Title className="text-sm font-semibold text-text">
                      {title}
                    </Dialog.Title>
                    <Dialog.Close
                      aria-label="Close"
                      className="-mr-1 inline-flex size-6 shrink-0 items-center justify-center rounded-md text-text-tertiary transition-colors hover:bg-fill hover:text-text"
                    >
                      <X aria-hidden className="size-3.5" />
                    </Dialog.Close>
                  </div>
                ) : null}
                {content}
                {footer}
              </m.div>
            ) : null}
          </AnimatePresence>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
});

export function ModalHost(): JSX.Element | null {
  const entries = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  if (entries.length === 0) return null;
  return createPortal(
    <LazyMotion strict features={domAnimation}>
      {entries.map((e) => (
        <StackItem entry={e} key={e.id} />
      ))}
    </LazyMotion>,
    document.body,
  );
}
