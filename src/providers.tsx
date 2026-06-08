import { Provider as JotaiProvider } from 'jotai';
import { ThemeProvider } from 'next-themes';
import type { ReactNode } from 'react';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider enableSystem attribute="data-theme" defaultTheme="system">
      <JotaiProvider>{children}</JotaiProvider>
    </ThemeProvider>
  );
}
