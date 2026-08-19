"use client";

import { useState } from "react";
import { ActionForm } from "@/components/action-form";
import {
  ATTENDANCE_LABELS,
  ATTENDANCE_STATUSES,
  type AttendanceStatus,
} from "@/lib/constants";
import { saveAttendance } from "./actions";

export type RegisterStudent = {
  id: string;
  code: string;
  firstName: string;
  lastName: string;
  status: AttendanceStatus | null;
  note: string;
};

const TONES: Record<AttendanceStatus, string> = {
  PRESENT: "has-checked:border-emerald-400 has-checked:bg-emerald-50 has-checked:text-emerald-800",
  ABSENT: "has-checked:border-red-400 has-checked:bg-red-50 has-checked:text-red-800",
  LATE: "has-checked:border-amber-400 has-checked:bg-amber-50 has-checked:text-amber-800",
  EXCUSED: "has-checked:border-sky-400 has-checked:bg-sky-50 has-checked:text-sky-800",
};

export default function Register({
  classId,
  date,
  students,
  readOnly,
}: {
  classId: string;
  date: string;
  students: RegisterStudent[];
  readOnly: boolean;
}) {
  // Controlled so that "mark everyone present" can update the whole roster.
  const [statuses, setStatuses] = useState<Record<string, string>>(() =>
    Object.fromEntries(students.map((s) => [s.id, s.status ?? ""])),
  );

  const markAll = (status: AttendanceStatus | "") =>
    setStatuses(Object.fromEntries(students.map((s) => [s.id, status])));

  const marked = Object.values(statuses).filter(Boolean).length;

  return (
    <ActionForm
      action={saveAttendance}
      submitLabel="Save register"
      hideSubmit={readOnly}
    >
      <input type="hidden" name="classId" value={classId} />
      <input type="hidden" name="date" value={date} />

      {!readOnly && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="text-xs text-ink-500">Quick fill:</span>
          <button
            type="button"
            onClick={() => markAll("PRESENT")}
            className="btn-secondary btn-sm"
          >
            All present
          </button>
          <button
            type="button"
            onClick={() => markAll("")}
            className="btn-secondary btn-sm"
          >
            Clear
          </button>
          <span className="ml-auto text-xs text-ink-500">
            {marked} of {students.length} marked
          </span>
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th className="w-24">Code</th>
                <th>Student</th>
                <th className="w-[420px]">Status</th>
                <th className="w-56">Note</th>
              </tr>
            </thead>
            <tbody>
              {students.map((student) => (
                <tr key={student.id}>
                  <td className="font-mono text-xs text-ink-500">{student.code}</td>
                  <td className="font-medium text-ink-900">
                    {student.lastName}, {student.firstName}
                  </td>
                  <td>
                    <div className="flex flex-wrap gap-1.5">
                      {ATTENDANCE_STATUSES.map((status) => (
                        <label
                          key={status}
                          className={`cursor-pointer rounded-lg border border-ink-200 px-2.5 py-1 text-xs text-ink-600 transition-colors ${TONES[status]} ${
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
                              setStatuses((prev) => ({
                                ...prev,
                                [student.id]: status,
                              }))
                            }
                            className="sr-only"
                          />
                          {ATTENDANCE_LABELS[status]}
                        </label>
                      ))}
                    </div>
                  </td>
                  <td>
                    <input
                      name={`note:${student.id}`}
                      defaultValue={student.note}
                      disabled={readOnly}
                      className="input py-1 text-xs"
                      placeholder="Optional"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </ActionForm>
  );
}
