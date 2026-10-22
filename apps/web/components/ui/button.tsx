import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';
import { LoaderCircle } from 'lucide-react';
import { cn } from '@/lib/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'tertiary' | 'danger' | 'ai';
export type ButtonSize = 'sm' | 'md' | 'icon';

const base =
  'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap text-body font-normal ' +
  'transition-colors duration-150 disabled:cursor-not-allowed aria-disabled:cursor-not-allowed';

const variants: Record<ButtonVariant, string> = {
  primary:
    'bg-accent text-white hover:bg-accent-hover disabled:bg-control disabled:text-muted aria-disabled:bg-control aria-disabled:text-muted',
  secondary:
    'border border-control bg-surface text-text hover:border-accent-line hover:bg-accent-soft hover:text-accent-ink ' +
    'disabled:border-control disabled:bg-raised disabled:text-subtle aria-disabled:text-subtle',
  tertiary: 'bg-transparent text-accent hover:bg-accent-soft hover:text-accent-ink disabled:text-subtle aria-disabled:text-subtle',
  danger:
    'border border-negative/40 bg-surface text-negative hover:bg-negative-soft disabled:border-control disabled:text-subtle',
  // AI actions only (fill a section with AI, regenerate a summary): cyan-to-blue fill, white label and icon.
  ai:
    'bg-brand-grad text-white hover:brightness-90 disabled:bg-control disabled:bg-none disabled:text-muted ' +
    'aria-disabled:bg-control aria-disabled:bg-none aria-disabled:text-muted',
};

// Phones get taller hit areas (44 / 40px); from 640px up the contract sizes apply (36 / 32px).
// `icon` is a round icon-only button: give it an aria-label.
const sizes: Record<ButtonSize, string> = {
  md: 'h-11 rounded-control px-3.5 sm:h-9',
  sm: 'h-10 rounded-control px-3 sm:h-8',
  icon: 'size-11 rounded-full sm:size-9',
};

/** Tertiary buttons sit flush with text, so they get less horizontal padding. */
const tertiarySizes: Record<ButtonSize, string> = {
  md: 'h-11 rounded-control px-2 sm:h-9',
  sm: 'h-10 rounded-control px-1.5 sm:h-8',
  icon: 'size-11 rounded-full sm:size-9',
};

export function buttonClass(variant: ButtonVariant = 'secondary', size: ButtonSize = 'md', className?: string): string {
  return cn(base, variants[variant], variant === 'tertiary' ? tertiarySizes[size] : sizes[size], className);
}

export type ButtonProps = ComponentProps<'button'> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a 16px spinner in place of the icon and disables the button; the label stays. */
  loading?: boolean;
};

export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  disabled,
  className,
  children,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClass(variant, size, className)}
      {...props}
    >
      {loading ? <LoaderCircle aria-hidden className="size-4 animate-spin" strokeWidth={1.75} /> : null}
      {children}
    </button>
  );
}

export type ButtonLinkProps = Omit<ComponentProps<typeof Link>, 'className' | 'children'> & {
  href: ComponentProps<typeof Link>['href'];
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  children: ReactNode;
};

export function ButtonLink({ href, variant = 'secondary', size = 'md', className, children, ...props }: ButtonLinkProps) {
  return (
    <Link href={href} className={buttonClass(variant, size, className)} {...props}>
      {children}
    </Link>
  );
}
