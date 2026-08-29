"use client";

import { useActionState, useEffect, useRef, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { showToast } from "./toast";

export type ActionState = { error?: string; success?: string };

/**
 * Carries a form's result across the remount that refreshing the route causes.
 *
 * Module scope, so it survives a component being unmounted and recreated, but
 * dies with the tab — it is a hand-off, not a cache. Keyed by submit label,
 * which is unique per form on a page; the timestamp means a stale message
 * cannot reappear when the page is opened again later.
 */
const RECALL_WINDOW_MS = 10_000;
const recallStore = new Map<string, { state: ActionState; at: number }>();

function recall(key: string): ActionState {
  const entry = recallStore.get(key);
  if (!entry) return {};
  if (Date.now() - entry.at > RECALL_WINDOW_MS) {
    recallStore.delete(key);
    return {};
  }
  return entry.state;
}

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
  const router = useRouter();

  // True only on the instance that actually submitted, so the instance that
  // replaces it after the refresh does not refresh again — that would loop.
  const didSubmit = useRef(false);

  const [state, formAction] = useActionState<ActionState, FormData>(
    async (previous, formData) => {
      const result = await action(previous, formData);
      didSubmit.current = true;

      // Raised HERE, the moment the result arrives — not in an effect.
      //
      // A Server Action that revalidates anything hands React a fresh RSC
      // payload along with its result, and React applies it by replacing this
      // subtree. When that happens the component is remounted before the new
      // state is ever committed, so an effect watching `state` never runs and
      // the rendered message never appears — which is exactly how a teacher
      // ended up adding an observation, being told nothing, and adding it
      // again. This call does not depend on React committing anything.
      if (result.success) {
        recallStore.set(submitLabel, { state: result, at: Date.now() });
        showToast(result.success, "success");
      } else {
        recallStore.delete(submitLabel);
        if (result.error) showToast(result.error, "error");
      }
      return result;
    },
    // Seeded from the store so a remount does not lose the inline message.
    recall(submitLabel),
  );

  /**
   * After a successful submit: clear the fields, then pull fresh data.
   *
   * Both halves of this are load-bearing, and they fight each other.
   *
   * When a form is rendered directly by a *server* component, anything that
   * produces a new RSC payload for the current route — the action calling
   * `revalidatePath` on its own route, or `router.refresh()` — makes React
   * replace this subtree. The form is remounted and `useActionState` resets, so
   * the success message never renders. In development it appeared to work; in a
   * production build the row was written and the person was told nothing at
   * all, so they would reasonably submit it again. (A form rendered inside a
   * client component does not have this problem, which is why the attendance
   * register always worked and the "add" forms did not.)
   *
   * So the refresh stays — the new row does have to appear in the list — and
   * the result is carried across the remount in `recallStore` instead.
   */
  useEffect(() => {
    if (!state.success || !didSubmit.current) return;
    didSubmit.current = false;
    if (resetOnSuccess) formRef.current?.reset();
    router.refresh();
  }, [resetOnSuccess, router, state]);

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
