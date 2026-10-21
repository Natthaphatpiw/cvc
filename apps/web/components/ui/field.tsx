'use client';

import {
  Children,
  cloneElement,
  isValidElement,
  useId,
  type ComponentProps,
  type ReactElement,
  type ReactNode,
} from 'react';
import { cn } from '@/lib/cn';

export type FieldProps = {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  /** Shows a quiet "(ไม่บังคับ)" or the required mark next to the label. */
  required?: boolean;
  optional?: boolean;
  /**
   * Single form control: Field wires id, aria-describedby and aria-invalid into it.
   * For a group of controls (chips, radios) set `group` and the label becomes a fieldset legend.
   */
  children: ReactNode;
  group?: boolean;
  /** Explicit id for the control (otherwise generated, or taken from the child's id). */
  htmlFor?: string;
  className?: string;
};

type ControlProps = { id?: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean | 'true' | 'false'; required?: boolean };

/** Label above (13/400), hint below (12 muted), error in red linked with aria-describedby. */
export function Field({ label, hint, error, required, optional, children, group = false, htmlFor, className }: FieldProps) {
  const autoId = useId();
  const hintId = `${autoId}-hint`;
  const errorId = `${autoId}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined;

  const marker = required ? (
    <span className="text-negative" aria-hidden>
      {' '}
      *
    </span>
  ) : optional ? (
    <span className="font-light text-muted"> (ไม่บังคับ)</span>
  ) : null;

  const messages = (
    <>
      {hint ? (
        <p id={hintId} className="mt-1.5 text-meta text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="mt-1.5 text-meta text-negative">
          {error}
        </p>
      ) : null}
    </>
  );

  if (group) {
    return (
      <fieldset className={cn('min-w-0', className)} aria-describedby={describedBy} aria-invalid={error ? true : undefined}>
        <legend className="mb-2 text-label font-normal text-text">
          {label}
          {marker}
        </legend>
        {children}
        {messages}
      </fieldset>
    );
  }

  const only = Children.only(children);
  const child = isValidElement(only) ? (only as ReactElement<ControlProps>) : null;
  const controlId = htmlFor ?? child?.props.id ?? `${autoId}-control`;
  const control = child
    ? cloneElement(child, {
        id: controlId,
        'aria-describedby': [child.props['aria-describedby'], describedBy].filter(Boolean).join(' ') || undefined,
        'aria-invalid': error ? true : child.props['aria-invalid'],
        required: required ?? child.props.required,
      })
    : only;

  return (
    <div className={cn('min-w-0', className)}>
      <label htmlFor={controlId} className="mb-1.5 block text-label font-normal text-text">
        {label}
        {marker}
      </label>
      {control}
      {messages}
    </div>
  );
}

// 16px text on phones stops iOS from zooming into focused fields; 14px (text-body) from 640px up.
const controlBase =
  'w-full rounded-control border border-input bg-surface text-[16px] leading-[22px] font-light text-text transition-colors duration-150 sm:text-body ' +
  'hover:border-muted disabled:cursor-not-allowed disabled:bg-raised disabled:text-subtle ' +
  'aria-[invalid=true]:border-negative';

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input className={cn(controlBase, 'h-11 px-3 sm:h-9', className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return <textarea className={cn(controlBase, 'block min-h-24 resize-y px-3 py-2', className)} {...props} />;
}

export function Select({ className, children, ...props }: ComponentProps<'select'>) {
  return (
    <select className={cn(controlBase, 'h-11 appearance-auto px-2.5 sm:h-9', className)} {...props}>
      {children}
    </select>
  );
}
