import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';

import { cn } from '~/lib/cn';

export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  return (
    <button
      aria-label="Toggle theme"
      type="button"
      className={cn(
        'inline-flex size-9 items-center justify-center rounded-md',
        'border border-border bg-background text-text',
        'transition-colors hover:bg-background-secondary',
        className,
      )}
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
    >
      {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  );
}
