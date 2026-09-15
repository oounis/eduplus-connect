"use client";

import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/action-form";
import { showToast } from "@/components/toast";
import { fill } from "@/lib/i18n";
import { PHONE_FIELDS, type PhoneField, type RosterStudent } from "@/lib/student-data";
import { CONTACT_LIMITS } from "@/lib/student-contact";
import { saveStudentContacts, type DataState } from "../actions";

export type WorkspaceLabels = {
  roster: string;
  rosterHint: string;
  showStudent: string;
  allStudents: string;
  save: string;
  saving: string;
  selectAll: string;
  selectNone: string;
  selectedCount: string;
  selectionHint: string;
  colIndex: string;
  colCode: string;
  colStudent: string;
  colPhone: string;
  colPhone2: string;
  colPhone3: string;
  colEmail: string;

  exports: string;
  exportStudents: string;
  exportStudentsHint: string;
  exportAttendance: string;
  exportAttendanceHint: string;
  scope: string;
  scopeClass: string;
  scopeAll: string;
  fromMonth: string;
  toMonth: string;

  messages: string;
  messagesHint: string;
  msgType: string;
  msgNamed: string;
  msgGeneral: string;
  msgNamedTemplate: string;
  msgText: string;
  msgPlaceholder: string;
  msgPreview: string;
  msgNumbers: string;
  msgNumbersHint: string;
  msgBuild: string;
  msgEmpty: string;
  exampleName: string;
};

/**
 * Everything a supervisor does with their class, in one client component.
 *
 * It is one component rather than four because a single thing is shared across
 * all of them: which students are ticked. The tick boxes decide what the three
 * Excel files cover, and keeping that in one place is what stops the roster and
 * the exports disagreeing about "the selected students".
 *
 * The exports are plain HTML form posts to route handlers, not server actions.
 * A file download has to arrive as a response the browser saves; an action
 * returns a value to React, which cannot become a file. Posting rather than
 * linking also keeps three hundred student ids out of the URL.
 */
export default function Workspace({
  classId,
  students,
  months,
  labels,
}: {
  classId: string;
  students: RosterStudent[];
  /**
   * Every month of the academic year, already labelled in the interface
   * language, plus the two that start selected. A <select> of exactly these,
   * rather than <input type="month">: the native control renders in the
   * browser's locale rather than the page's, and Firefox does not implement it
   * at all — it degrades to a free-text box that accepts anything.
   */
  months: {
    options: { value: string; label: string }[];
    from: string;
    to: string;
  };
  labels: WorkspaceLabels;
}) {
  // Nothing ticked means "the whole class", which is what somebody who exports
  // without touching the boxes expects. An empty set is that state, so it is
  // also the starting state.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<string>("ALL");
  const [named, setNamed] = useState(true);
  const [text, setText] = useState("");
  const [fields, setFields] = useState<PhoneField[]>(["phone"]);

  const [state, action] = useActionState<DataState, FormData>(
    async (previous, formData) => {
      const result = await saveStudentContacts(previous, formData);
      // Raised the moment the result arrives rather than from an effect: an
      // effect watching state never runs if React replaces this subtree first,
      // which is how a save ends up invisible in a production build.
      if (result.success) showToast(result.success, "success");
      else if (result.error) showToast(result.error, "error");
      return result;
    },
    {},
  );

  const toggle = (id: string) =>
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  /** Repeated hidden inputs, so an export covers exactly what is ticked. */
  const selectionInputs = [...selected].map((id) => (
    <input key={id} type="hidden" name="student" value={id} />
  ));

  const preview = named
    ? `${labels.msgNamedTemplate.replace("{name}", labels.exampleName)} ${text || labels.msgPlaceholder}`
    : text || labels.msgPlaceholder;

  return (
    <div className="space-y-6">
      {/* ---------------------------------------------------------------- */}
      {/*  The roster, and the one button that saves all of it              */}
      {/* ---------------------------------------------------------------- */}
      <section className="card">
        <div className="card-header">
          <div>
            <h2 className="card-title">{labels.roster}</h2>
            <p className="card-subtitle">{labels.rosterHint}</p>
          </div>
          <div className="flex items-end gap-2">
            <div>
              <label className="label" htmlFor="filter">
                {labels.showStudent}
              </label>
              <select
                id="filter"
                className="select min-w-52"
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
              >
                <option value="ALL">{labels.allStudents}</option>
                {students.map((student) => (
                  <option key={student.id} value={student.id}>
                    {student.lastName} {student.firstName}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-ink-200 px-5 py-3">
          <button
            type="button"
            className="btn-secondary btn-sm"
            onClick={() => setSelected(new Set(students.map((s) => s.id)))}
          >
            {labels.selectAll}
          </button>
          <button
            type="button"
            className="btn-secondary btn-sm"
            onClick={() => setSelected(new Set())}
          >
            {labels.selectNone}
          </button>
          <span className="text-xs text-ink-500">
            {fill(labels.selectedCount, {
              n: selected.size,
              total: students.length,
            })}
          </span>
          <span className="ms-auto text-xs text-ink-400">
            {labels.selectionHint}
          </span>
        </div>

        <form action={action}>
          <input type="hidden" name="classId" value={classId} />

          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th className="w-10" />
                  <th className="w-14">{labels.colIndex}</th>
                  <th>{labels.colCode}</th>
                  <th>{labels.colStudent}</th>
                  <th>{labels.colPhone}</th>
                  <th>{labels.colPhone2}</th>
                  <th>{labels.colPhone3}</th>
                  <th>{labels.colEmail}</th>
                </tr>
              </thead>
              <tbody>
                {/*
                 * Every student is rendered, always. The filter only *hides*
                 * rows.
                 *
                 * Removing them from the tree instead unmounts their inputs,
                 * and these inputs are uncontrolled — so a supervisor who
                 * edited twenty numbers and then picked one student from the
                 * dropdown to check something lost all twenty on the way back,
                 * with no warning. It also meant "one button" quietly saved
                 * only the visible row while reporting success.
                 */}
                {students.map((student, index) => (
                  <tr
                    key={student.id}
                    className={
                      filter === "ALL" || filter === student.id ? "" : "hidden"
                    }
                  >
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`${student.lastName} ${student.firstName}`}
                        className="h-4 w-4 cursor-pointer accent-brand-600"
                        checked={selected.has(student.id)}
                        onChange={() => toggle(student.id)}
                      />
                    </td>
                    <td className="tabular-nums text-ink-500">{index + 1}</td>
                    <td className="font-mono text-xs text-ink-500">
                      {student.code}
                    </td>
                    <td className="whitespace-nowrap font-medium">
                      {student.firstName} {student.lastName}
                    </td>
                    {(["phone", "phone2", "phone3"] as const).map((field) => (
                      <td key={field}>
                        <input
                          name={`${field}:${student.id}`}
                          type="tel"
                          dir="ltr"
                          defaultValue={student[field] ?? ""}
                          maxLength={CONTACT_LIMITS[field]}
                          autoComplete="off"
                          className="input min-w-36"
                        />
                      </td>
                    ))}
                    <td>
                      <input
                        name={`email:${student.id}`}
                        type="email"
                        dir="ltr"
                        defaultValue={student.email ?? ""}
                        maxLength={CONTACT_LIMITS.email}
                        autoComplete="off"
                        className="input min-w-52"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {state.error && (
            <p className="mx-5 mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {state.error}
            </p>
          )}
          {/* Said in the page as well as in the toast: a corner toast is
              missed on a phone, and an unconfirmed save gets done twice. */}
          {state.success && (
            <p className="mx-5 mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">
              {state.success}
            </p>
          )}

          {/* Sticky: with thirty-five students the button is a long scroll
              from the row being edited, and a save that needs hunting for is a
              save that does not happen. */}
          <div className="sticky bottom-0 border-t border-ink-200 bg-white/95 px-5 py-4 backdrop-blur">
            <SubmitButton className="btn-primary" pendingLabel={labels.saving}>
              {labels.save}
            </SubmitButton>
          </div>
        </form>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/*  The two list exports                                            */}
      {/* ---------------------------------------------------------------- */}
      <section className="card">
        <div className="card-header">
          <h2 className="card-title">{labels.exports}</h2>
        </div>

        <div className="grid gap-5 px-5 py-5 md:grid-cols-2">
          <form
            method="post"
            action="/student-data/export/students"
            className="space-y-3"
          >
            <input type="hidden" name="classId" value={classId} />
            {selectionInputs}
            <p className="text-sm font-medium text-ink-800">
              {labels.exportStudents}
            </p>
            <p className="text-xs text-ink-500">{labels.exportStudentsHint}</p>
            <div>
              <label className="label" htmlFor="students-scope">
                {labels.scope}
              </label>
              <select id="students-scope" name="scope" className="select">
                <option value="class">{labels.scopeClass}</option>
                <option value="all">{labels.scopeAll}</option>
              </select>
            </div>
            <button type="submit" className="btn-secondary">
              {labels.exportStudents}
            </button>
          </form>

          <form
            method="post"
            action="/student-data/export/attendance"
            className="space-y-3"
          >
            <input type="hidden" name="classId" value={classId} />
            {selectionInputs}
            <p className="text-sm font-medium text-ink-800">
              {labels.exportAttendance}
            </p>
            <p className="text-xs text-ink-500">{labels.exportAttendanceHint}</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label" htmlFor="from">
                  {labels.fromMonth}
                </label>
                <select
                  id="from"
                  name="from"
                  defaultValue={months.from}
                  className="select"
                >
                  {months.options.map((month) => (
                    <option key={month.value} value={month.value}>
                      {month.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="to">
                  {labels.toMonth}
                </label>
                <select
                  id="to"
                  name="to"
                  defaultValue={months.to}
                  className="select"
                >
                  {months.options.map((month) => (
                    <option key={month.value} value={month.value}>
                      {month.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="label" htmlFor="attendance-scope">
                {labels.scope}
              </label>
              {/* This one defaults to all classes where the other two default
                  to the open class, and that is deliberate: the monthly table
                  was asked for as "all students, by class", one workbook the
                  supervisor hands over. The other two are about the class in
                  front of them. */}
              <select id="attendance-scope" name="scope" className="select">
                <option value="all">{labels.scopeAll}</option>
                <option value="class">{labels.scopeClass}</option>
              </select>
            </div>
            <button type="submit" className="btn-secondary">
              {labels.exportAttendance}
            </button>
          </form>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/*  The message file                                                */}
      {/* ---------------------------------------------------------------- */}
      <section className="card">
        <div className="card-header">
          <div>
            <h2 className="card-title">{labels.messages}</h2>
            <p className="card-subtitle">{labels.messagesHint}</p>
          </div>
        </div>

        <form
          method="post"
          action="/student-data/export/messages"
          className="space-y-4 px-5 py-5"
        >
          <input type="hidden" name="classId" value={classId} />
          {selectionInputs}

          {/* The same scope choice the lists have. A supervisor telling three
              classes the same thing should not have to build three files. */}
          <div className="max-w-xs">
            <label className="label" htmlFor="messages-scope">
              {labels.scope}
            </label>
            <select id="messages-scope" name="scope" className="select">
              <option value="class">{labels.scopeClass}</option>
              <option value="all">{labels.scopeAll}</option>
            </select>
          </div>

          <fieldset>
            <legend className="label">{labels.msgType}</legend>
            <div className="space-y-2">
              {[
                { value: "named", label: labels.msgNamed, on: named },
                { value: "general", label: labels.msgGeneral, on: !named },
              ].map((option) => (
                <label
                  key={option.value}
                  className="flex cursor-pointer items-center gap-2 text-sm text-ink-800"
                >
                  <input
                    type="radio"
                    name="mode"
                    value={option.value}
                    checked={option.on}
                    onChange={() => setNamed(option.value === "named")}
                    className="h-4 w-4 accent-brand-600"
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </fieldset>

          <div>
            <label className="label" htmlFor="text">
              {labels.msgText}
            </label>
            <textarea
              id="text"
              name="text"
              rows={3}
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder={labels.msgPlaceholder}
              maxLength={1000}
              className="input"
              required
            />
          </div>

          <div className="rounded-lg border border-ink-200 bg-ink-50 px-3 py-2">
            <p className="text-xs text-ink-500">{labels.msgPreview}</p>
            <p className="mt-1 text-sm text-ink-800">{preview}</p>
          </div>

          <fieldset>
            <legend className="label">{labels.msgNumbers}</legend>
            <div className="flex flex-wrap gap-4">
              {PHONE_FIELDS.map((field) => (
                <label
                  key={field}
                  className="flex cursor-pointer items-center gap-2 text-sm text-ink-800"
                >
                  <input
                    type="checkbox"
                    name="field"
                    value={field}
                    checked={fields.includes(field)}
                    onChange={() =>
                      setFields((previous) =>
                        previous.includes(field)
                          ? previous.filter((f) => f !== field)
                          : [...previous, field],
                      )
                    }
                    className="h-4 w-4 accent-brand-600"
                  />
                  {field === "phone"
                    ? labels.colPhone
                    : field === "phone2"
                      ? labels.colPhone2
                      : labels.colPhone3}
                </label>
              ))}
            </div>
            <p className="mt-2 text-xs text-ink-500">{labels.msgNumbersHint}</p>
          </fieldset>

          <button
            type="submit"
            className="btn-primary"
            disabled={text.trim() === "" || fields.length === 0}
          >
            {labels.msgBuild}
          </button>
          {text.trim() === "" && (
            <p className="text-xs text-ink-500">{labels.msgEmpty}</p>
          )}
        </form>
      </section>
    </div>
  );
}
