"use client";

import { useActionState, useRef, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

export type ActionState = { error?: string; success?: string };

export function SubmitButton({
  children,
  className = "btn-primary",
  pendingLabel = "Saving…",
}: {
  children: ReactNode;
  className?: string;
  pendingLabel?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending}>
      {pending ? pendingLabel : children}
    </button>
  );
}

/**
 * Wraps a server action with useActionState and renders its error / success
 * message. Used by every create-and-edit form in the app.
 */
export function ActionForm({
  action,
  children,
  submitLabel = "Save",
  submitClassName = "btn-primary",
  className = "",
  resetOnSuccess = false,
  hideSubmit = false,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  children: ReactNode;
  submitLabel?: string;
  submitClassName?: string;
  className?: string;
  resetOnSuccess?: boolean;
  /** Read-only views keep the layout but drop the submit control. */
  hideSubmit?: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction] = useActionState<ActionState, FormData>(
    async (prev, formData) => {
      const result = await action(prev, formData);
      if (resetOnSuccess && result.success) formRef.current?.reset();
      return result;
    },
    {},
  );

  return (
    <form ref={formRef} action={formAction} className={className}>
      {children}

      {state.error && (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {state.error}
        </p>
      )}
      {state.success && (
        <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
          {state.success}
        </p>
      )}

      {!hideSubmit && (
        <div className="mt-4">
          <SubmitButton className={submitClassName}>{submitLabel}</SubmitButton>
        </div>
      )}
    </form>
  );
}

/** Collapsible panel used for the "add new…" forms. */
export function Disclosure({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <details className="card group">
      <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-3.5 text-sm font-medium text-ink-800">
        {label}
        <span className="text-ink-400 transition-transform group-open:rotate-45">
          +
        </span>
      </summary>
      <div className="border-t border-ink-200 px-5 py-4">{children}</div>
    </details>
  );
}
