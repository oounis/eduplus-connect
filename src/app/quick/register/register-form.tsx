"use client";

import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/action-form";
import { showToast } from "@/components/toast";
import { fill } from "@/lib/i18n";
import type { AttendanceStatus } from "@/lib/constants";
import type { PeriodRosterStudent } from "@/lib/periods";
import { saveQuickAttendance, type QuickState } from "../actions";

const TONES: Record<string, string> = {
  PRESENT: "has-checked:border-emerald-400 has-checked:bg-emerald-50 has-checked:text-emerald-800",
  ABSENT: "has-checked:border-red-400 has-checked:bg-red-50 has-checked:text-red-800",
  EXCUSED: "has-checked:border-sky-400 has-checked:bg-sky-50 has-checked:text-sky-800",
};

/**
 * Present, absent, excused — three, not the four the desk register offers.
 *
 * "Late" is a judgement made minutes into a lesson; this page is used at the
 * door with a class waiting, and a fourth button there is a fourth thing to
 * get wrong. The desk register still has it, and an administrator can still
 * set it, so nothing is lost from the record.
 */
const CLASSROOM_STATUSES = ["PRESENT", "ABSENT", "EXCUSED"] as const;

/**
 * The register as it appears on a classroom device: one row per student, big
 * touch targets, no table. This is used standing up, on a phone, with a class
 * waiting — so it is a list rather than the wide grid the desk version uses.
 */
export default function QuickRegister({
  classId,
  periodId,
  students,
  readOnly,
  labels,
}: {
  classId: string;
  periodId: string;
  students: PeriodRosterStudent[];
  readOnly: boolean;
  labels: {
    save: string;
    allPresent: string;
    quickFill: string;
    clear: string;
    markedTemplate: string;
    statusLabels: Record<AttendanceStatus, string>;
  };
}) {
  const [statuses, setStatuses] = useState<Record<string, string>>(() =>
    Object.fromEntries(students.map((s) => [s.id, s.status ?? ""])),
  );

  const [state, action] = useActionState<QuickState, FormData>(
    async (previous, formData) => {
      const result = await saveQuickAttendance(previous, formData);
      // Raised here rather than from an effect: the page re-renders after the
      // save and would take an in-tree message with it. See components/toast.
      if (result.success) showToast(result.success, "success");
      else if (result.error) showToast(result.error, "error");
      return result;
    },
    {},
  );

  const markAll = (status: AttendanceStatus | "") =>
    setStatuses(Object.fromEntries(students.map((s) => [s.id, status])));

  const marked = Object.values(statuses).filter(Boolean).length;

  return (
    <form action={action}>
      <input type="hidden" name="classId" value={classId} />
      <input type="hidden" name="periodId" value={periodId} />

      {!readOnly && (
        <>
          {/* Save at the top as well as the bottom: with thirty students the
              bottom button is a long scroll away, and the teacher usually
              finishes by tapping "all present" and one or two exceptions. */}
          <div className="mb-3">
            <SubmitButton className="btn-primary w-full py-3">
              {labels.save}
            </SubmitButton>
          </div>

          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="text-xs text-ink-500">{labels.quickFill}</span>
            <button type="button" onClick={() => markAll("PRESENT")} className="btn-secondary btn-sm">
              {labels.allPresent}
            </button>
            <button type="button" onClick={() => markAll("")} className="btn-secondary btn-sm">
              {labels.clear}
            </button>
            <span className="ms-auto text-xs text-ink-500">
              {fill(labels.markedTemplate, { marked, total: students.length })}
            </span>
          </div>
        </>
      )}

      <div className="space-y-2">
        {students.map((student) => (
          <div key={student.id} className="card px-4 py-3">
            <p className="mb-2 font-medium text-ink-900">
              {student.lastName}, {student.firstName}
              <span className="ms-2 font-mono text-xs font-normal text-ink-400">
                {student.code}
              </span>
            </p>
            <div className="grid grid-cols-3 gap-1.5">
              {CLASSROOM_STATUSES.map((status) => (
                <label
                  key={status}
                  className={`cursor-pointer rounded-lg border border-ink-200 px-2 py-2 text-center text-xs text-ink-600 transition-colors ${TONES[status]} ${
                    readOnly ? "cursor-default opacity-70" : "hover:bg-ink-50"
                  }`}
                >
                  <input
                    type="radio"
                    name={`status:${student.id}`}
                    value={status}
                    checked={statuses[student.id] === status}
                    disabled={readOnly}
                    onChange={() =>
                      setStatuses((prev) => ({ ...prev, [student.id]: status }))
                    }
                    className="sr-only"
                  />
                  {labels.statusLabels[status]}
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>

      {state.error && (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {state.error}
        </p>
      )}

      {!readOnly && (
        <div className="sticky bottom-4 mt-5">
          <SubmitButton className="btn-primary w-full py-3">{labels.save}</SubmitButton>
        </div>
      )}
    </form>
  );
}
