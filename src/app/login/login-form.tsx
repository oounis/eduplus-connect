"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { login, type LoginState } from "./actions";

function SubmitButton({ label, busy }: { label: string; busy: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary w-full" disabled={pending}>
      {pending ? busy : label}
    </button>
  );
}

// Client component, so the translated strings arrive as props.
export default function LoginForm({
  emailLabel,
  passwordLabel,
  submitLabel,
  submittingLabel,
}: {
  emailLabel: string;
  passwordLabel: string;
  submitLabel: string;
  submittingLabel: string;
}) {
  const [state, formAction] = useActionState<LoginState, FormData>(login, {});

  return (
    <form action={formAction} className="mt-6 space-y-4">
      <div>
        <label className="label" htmlFor="email">
          {emailLabel}
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          defaultValue="admin@eduplus.school"
          className="input"
          placeholder="you@eduplus.school"
        />
      </div>

      <div>
        <label className="label" htmlFor="password">
          {passwordLabel}
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          defaultValue="Passw0rd!"
          className="input"
          placeholder="••••••••"
        />
      </div>

      {state.error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {state.error}
        </p>
      )}

      <SubmitButton label={submitLabel} busy={submittingLabel} />
    </form>
  );
}
