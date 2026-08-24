"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { updateStudentContact } from "../actions";
import type { ActionState } from "../actions";

type Props = {
  studentId: string;
  email: string | null;
  phone: string | null;
  phone2: string | null;
  phone3: string | null;
  /** False for a supervisor viewing a class that is not theirs. */
  canEdit: boolean;
};

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary btn-sm" disabled={pending}>
      {pending ? "Saving…" : "Save contact details"}
    </button>
  );
}

const FIELDS = [
  { name: "email", label: "Email", type: "email", placeholder: "name@example.com" },
  { name: "phone", label: "Phone", type: "tel", placeholder: "+973 …" },
  { name: "phone2", label: "Phone 2", type: "tel", placeholder: "Second number" },
  { name: "phone3", label: "Phone 3", type: "tel", placeholder: "Third number" },
] as const;

export function StudentContactForm({
  studentId,
  email,
  phone,
  phone2,
  phone3,
  canEdit,
}: Props) {
  const [state, formAction] = useActionState<ActionState, FormData>(
    updateStudentContact,
    {},
  );

  const values: Record<string, string> = {
    email: email ?? "",
    phone: phone ?? "",
    phone2: phone2 ?? "",
    phone3: phone3 ?? "",
  };

  // Read-only view: a supervisor can see contact details for any student they
  // can already see, but only edit the ones in their own classes.
  if (!canEdit) {
    return (
      <div className="grid gap-4 px-5 py-4 text-sm sm:grid-cols-4">
        {FIELDS.map((field) => (
          <div key={field.name}>
            <p className="text-xs text-ink-500">{field.label}</p>
            <p className="text-ink-800">{values[field.name] || "—"}</p>
          </div>
        ))}
      </div>
    );
  }

  return (
    <form action={formAction} className="px-5 py-4">
      <input type="hidden" name="id" value={studentId} />

      <div className="grid gap-4 sm:grid-cols-4">
        {FIELDS.map((field) => (
          <label key={field.name} className="block text-sm">
            <span className="mb-1 block text-xs text-ink-500">{field.label}</span>
            <input
              name={field.name}
              type={field.type}
              defaultValue={values[field.name]}
              placeholder={field.placeholder}
              autoComplete="off"
              className="input"
            />
          </label>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <SaveButton />
        <span aria-live="polite" className="text-sm">
          {state.error && <span className="text-rose-600">{state.error}</span>}
          {state.success && <span className="text-emerald-600">{state.success}</span>}
        </span>
      </div>

      <p className="mt-3 text-xs text-ink-500">
        Leave a field empty to clear it. Every change is written to the audit trail.
      </p>
    </form>
  );
}
