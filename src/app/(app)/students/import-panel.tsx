"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/action-form";
import { showToast } from "@/components/toast";
import { fill } from "@/lib/i18n";
import { confirmImport, previewImport, type ImportState } from "./import-actions";

/**
 * Translated in the parent server component — a client component cannot be
 * handed the translator itself. The `…Template` strings keep their `{n}`
 * placeholder and are filled here, where the count is known.
 */
export type ImportLabels = {
  paste: string;
  columnsLead: string;
  and: string;
  areRequired: string;
  areOptional: string;
  checking: string;
  check: string;
  readyTemplate: string;
  skippedTemplate: string;
  importOneTemplate: string;
  importManyTemplate: string;
  importing: string;
  line: string;
  name: string;
  code: string;
  born: string;
  klass: string;
  parent: string;
  status: string;
  ready: string;
};

const SAMPLE = `firstName,lastName,code,dateOfBirth,class,parentEmail
Yasmin,Haddad,,2015-04-23,Grade 5 - A,parent@eduplus.school
Omar,Belhaj,STU-9001,12/09/2014,Grade 5 - A,
`;

/**
 * Two-step import: the first submit only reports what would happen, the second
 * writes it. The CSV is carried in a hidden field so the confirm step imports
 * exactly the text that was checked.
 */
export default function ImportPanel({ labels }: { labels: ImportLabels }) {
  const [state, action] = useActionState<ImportState, FormData>(
    async (prev, formData) => {
      const result =
        formData.get("intent") === "confirm"
          ? await confirmImport(prev, formData)
          : await previewImport(prev, formData);

      // Confirming an import revalidates the student list, which replaces this
      // subtree and discards the state before it renders — so the person who
      // just imported 90 students would be told nothing at all. The toast is
      // raised outside React's tree, here, where no re-render can remove it.
      // The preview step is not announced: its result is the panel itself.
      if (result.success && !result.preview) showToast(result.success, "success");
      else if (result.error) showToast(result.error, "error");

      return result;
    },
    {},
  );

  return (
    <div className="space-y-4">
      <form action={action} className="space-y-3">
        <div>
          <label className="label" htmlFor="csv">
            {labels.paste}
          </label>
          <textarea
            id="csv"
            name="csv"
            rows={7}
            className="input font-mono text-xs"
            placeholder={SAMPLE}
            defaultValue={state.preview?.csv}
            required
          />
          <p className="mt-1.5 text-xs text-ink-500">
            {labels.columnsLead} <code>firstName</code> {labels.and}{" "}
            <code>lastName</code> {labels.areRequired} <code>code</code>,{" "}
            <code>dateOfBirth</code>, <code>class</code> {labels.and}{" "}
            <code>parentEmail</code> {labels.areOptional}
          </p>
        </div>
        <input type="hidden" name="intent" value="preview" />
        <SubmitButton className="btn-secondary" pendingLabel={labels.checking}>
          {labels.check}
        </SubmitButton>
      </form>

      {state.error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {state.error}
        </p>
      )}
      {state.success && !state.preview && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
          {state.success}
        </p>
      )}

      {state.preview && (
        <div className="rounded-xl border border-ink-200">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-200 px-4 py-3">
            <p className="text-sm">
              <span className="font-medium text-emerald-700">
                {fill(labels.readyTemplate, { n: state.preview.ok })}
              </span>
              {state.preview.skipped > 0 && (
                <span className="ms-3 font-medium text-red-600">
                  {fill(labels.skippedTemplate, { n: state.preview.skipped })}
                </span>
              )}
            </p>
            {state.preview.ok > 0 && (
              <form action={action}>
                <input type="hidden" name="csv" value={state.preview.csv} />
                <input type="hidden" name="intent" value="confirm" />
                <SubmitButton pendingLabel={labels.importing}>
                  {fill(
                    state.preview.ok === 1
                      ? labels.importOneTemplate
                      : labels.importManyTemplate,
                    { n: state.preview.ok },
                  )}
                </SubmitButton>
              </form>
            )}
          </div>

          <div className="max-h-80 overflow-auto">
            <table className="table">
              <thead>
                <tr>
                  <th className="w-14">{labels.line}</th>
                  <th>{labels.name}</th>
                  <th>{labels.code}</th>
                  <th>{labels.born}</th>
                  <th>{labels.klass}</th>
                  <th>{labels.parent}</th>
                  <th>{labels.status}</th>
                </tr>
              </thead>
              <tbody>
                {state.preview.rows.map((row) => (
                  <tr key={row.line} className={row.problem ? "bg-red-50/40" : ""}>
                    <td className="text-xs text-ink-400">{row.line}</td>
                    <td className="text-ink-800">
                      {row.lastName}, {row.firstName}
                    </td>
                    <td className="font-mono text-xs text-ink-500">{row.code || "—"}</td>
                    <td className="text-xs text-ink-500">{row.dateOfBirth ?? "—"}</td>
                    <td className="text-xs text-ink-600">{row.className || "—"}</td>
                    <td className="text-xs text-ink-600">{row.parentEmail || "—"}</td>
                    <td>
                      {row.problem ? (
                        <span className="badge bg-red-50 text-red-700">{row.problem}</span>
                      ) : (
                        <span className="badge bg-emerald-50 text-emerald-700">
                          {labels.ready}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
