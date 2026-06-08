import type { ButtonHTMLAttributes } from 'react';

import { cn } from '~/lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost';
type Size = 'sm' | 'md' | 'icon';

const base =
  'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md text-sm font-medium ' +
  'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ' +
  'disabled:pointer-events-none disabled:opacity-40';

const variants: Record<Variant, string> = {
  primary: 'bg-accent text-white shadow-xs hover:opacity-90',
  secondary:
    'border border-border bg-background-secondary text-text shadow-xs hover:bg-background-tertiary',
  ghost: 'text-text-secondary hover:bg-fill hover:text-text',
};

const sizes: Record<Size, string> = {
  sm: 'h-7 px-2 text-xs',
  md: 'h-9 px-3',
  icon: 'size-7 p-0',
};

export const Button = ({
  ref,
  className,
  variant = 'primary',
  size = 'md',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  ref?: React.RefObject<HTMLButtonElement | null>;
  size?: Size;
  variant?: Variant;
}) => (
  <button
    className={cn(base, variants[variant], sizes[size], className)}
    ref={ref}
    {...props}
  />
);
Button.displayName = 'Button';
