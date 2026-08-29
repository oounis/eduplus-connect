"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { SubmitButton } from "@/components/action-form";
import { quickSignIn, type QuickState } from "./actions";

/**
 * Step two: the PIN, for a teacher already chosen in the URL.
 *
 * The chosen name is NOT held in client state. Any server action re-renders
 * the route and replaces this component, so a mistyped PIN would clear the
 * teacher's name and make them find it in the list again — in front of a
 * waiting class. It comes from the URL instead, which a failed submit cannot
 * disturb.
 */
export default function QuickSignInForm({
  teacherId,
  labels,
  pinLength,
}: {
  teacherId: string;
  /** Translated on the server — this is a client component. */
  labels: { pin: string; pinHint: string; submit: string };
  pinLength: number;
}) {
  const router = useRouter();
  const [state, action] = useActionState<QuickState, FormData>(quickSignIn, {});

  useEffect(() => {
    if (state.redirectTo) router.push(state.redirectTo);
  }, [router, state.redirectTo]);

  return (
    <form action={action} className="mt-5 space-y-4">
      <input type="hidden" name="teacherId" value={teacherId} />

      <div>
        <label className="label" htmlFor="pin">
          {labels.pin}
        </label>
        <input
          id="pin"
          name="pin"
          // type=password so the PIN is not readable over the shoulder of a
          // teacher standing in front of a class.
          type="password"
          inputMode="numeric"
          autoComplete="off"
          pattern={`\\d{${pinLength}}`}
          maxLength={pinLength}
          className="input text-center text-lg tracking-[0.4em]"
          autoFocus
          required
        />
        <p className="mt-1.5 text-xs text-ink-500">{labels.pinHint}</p>
      </div>

      {state.error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {state.error}
        </p>
      )}

      <SubmitButton className="btn-primary w-full py-2.5" pendingLabel="…">
        {labels.submit}
      </SubmitButton>
    </form>
  );
}
