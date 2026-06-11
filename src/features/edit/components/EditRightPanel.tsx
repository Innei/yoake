import { useEffect, useRef, useState } from 'react';

import { ContextExportAction } from '~/features/deliver/components/ContextExportAction';
import { DeliverTab } from '~/features/deliver/components/DeliverTab';
import { QuickExportBar } from '~/features/deliver/components/QuickExportBar';
import { useEditModeStore } from '~/features/edit/editModeStore';
import { GradeTab } from '~/features/grade/components/GradeTab';
import { cn } from '~/lib/cn';

import { InspectTab } from './InspectTab';

type TabKey = 'inspect' | 'grade' | 'deliver';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'inspect', label: 'Inspect' },
  { key: 'grade', label: 'Grade' },
  { key: 'deliver', label: 'Deliver' },
];

export function EditRightPanel() {
  const [active, setActive] = useState<TabKey>('inspect');
  const outlineSelection = useEditModeStore((s) => s.outlineSelection);
  const mode = useEditModeStore((s) => s.mode);
  const navRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (outlineSelection.kind !== 'none') {
      setActive('inspect');
    }
  }, [outlineSelection]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const index = TABS.findIndex((t) => t.key === active);
    const delta = event.key === 'ArrowRight' ? 1 : -1;
    const next = TABS[(index + delta + TABS.length) % TABS.length]!;
    setActive(next.key);
    const buttons = navRef.current?.querySelectorAll<HTMLButtonElement>(
      'button[role="tab"]',
    );
    buttons?.[(index + delta + TABS.length) % TABS.length]?.focus();
  };

  return (
    <div
      className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)_auto]"
      data-testid="edit-right-panel"
    >
      <div
        aria-label="Edit panel tabs"
        className="flex shrink-0 items-center gap-1 border-b border-border px-2 py-1"
        data-testid="edit-right-tabs"
        ref={navRef}
        role="tablist"
        tabIndex={0}
        onKeyDown={handleKeyDown}
      >
        {TABS.map((tab) => {
          const isActive = tab.key === active;
          const className = cn(
            'h-7 rounded-md px-2.5 text-xs font-medium transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40',
            isActive
              ? 'bg-fill text-text'
              : 'text-text-secondary hover:bg-fill/60 hover:text-text',
          );
          return (
            <button
              aria-selected={isActive}
              className={className}
              data-active={isActive}
              data-testid={`edit-right-tab-${tab.key}`}
              key={tab.key}
              role="tab"
              tabIndex={isActive ? 0 : -1}
              type="button"
              onClick={() => setActive(tab.key)}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      <div className="min-h-0 overflow-auto" data-testid="edit-right-tab-body">
        {active === 'inspect' ? <InspectTab /> : null}
        {active === 'grade' ? <GradeTab /> : null}
        {active === 'deliver' ? <DeliverTab /> : null}
      </div>
      <div className="min-h-0 border-t border-border">
        {mode === 'edit' ? <QuickExportBar /> : <ContextExportAction />}
      </div>
    </div>
  );
}
