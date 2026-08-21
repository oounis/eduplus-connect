"use client";

import type { ReactNode } from "react";

/**
 * A submit button for destructive actions (disable an account, delete a task,
 * reset access rights). One stray click should never be enough: the browser
 * asks first, and a "no" cancels the submission. Found by the 2026-08-21
 * smoke test, which disabled three demo accounts by clicking through a page.
 */
export function ConfirmSubmit({
  message,
  children,
  className = "btn-secondary btn-sm",
}: {
  message: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="submit"
      className={className}
      onClick={(event) => {
        if (!window.confirm(message)) event.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
