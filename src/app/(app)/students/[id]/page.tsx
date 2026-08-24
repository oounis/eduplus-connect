import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getStudentHistory, getStudentIfVisible } from "@/lib/queries";
import { addDays, formatDate, formatShortDate, today } from "@/lib/dates";
import {
  AttendanceBadge,
  AttendanceBar,
  Card,
  EmptyState,
  PageHeader,
  SentimentBadge,
  StatTile,
} from "@/components/ui";
import { OBSERVATION_CATEGORY_LABELS } from "@/lib/constants";
import { canEditStudentContact } from "@/lib/student-contact";
import { StudentContactForm } from "./contact-form";

const RANGES = [30, 90, 365] as const;

export default async function StudentProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ days?: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const { days } = await searchParams;

  const student = await getStudentIfVisible(user, id);
  if (!student) notFound();

  const window = RANGES.includes(Number(days) as (typeof RANGES)[number])
    ? Number(days)
    : 30;
  const from = addDays(today(), -window);
  const history = await getStudentHistory(student.id, from);

  // Supervisors may edit contact details, but only for their own classes.
  const contactPermission = await canEditStudentContact(user, student.id);
  const showContact = user.access.students?.view ?? false;

  const age = student.dateOfBirth
    ? Math.floor(
        (today().getTime() - student.dateOfBirth.getTime()) /
          (365.25 * 24 * 3600 * 1000),
      )
    : null;

  return (
    <>
      <PageHeader
        title={`${student.firstName} ${student.lastName}`}
        description={[
          student.code,
          student.class?.name ?? "Unassigned",
          age !== null ? `${age} years old` : null,
          student.isActive ? null : "Inactive",
        ]
          .filter(Boolean)
          .join(" · ")}
        actions={
          user.access.students?.view ? (
            <Link href="/students" className="btn-secondary btn-sm">
              All students
            </Link>
          ) : null
        }
      />

      {/* Range picker ------------------------------------------------------ */}
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-ink-500">
          Period
        </span>
        {RANGES.map((r) => (
          <Link
            key={r}
            href={`/students/${student.id}?days=${r}`}
            className={`badge ${
              r === window
                ? "bg-brand-50 text-brand-700"
                : "bg-ink-100 text-ink-600 hover:text-ink-900"
            }`}
          >
            Last {r} days
          </Link>
        ))}
        <span className="text-xs text-ink-400">
          {formatShortDate(from)} – {formatShortDate(today())}
        </span>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatTile
          label="Attendance rate"
          value={history.rate === null ? "—" : `${history.rate.toFixed(1)}%`}
          hint={`${history.recorded} days recorded`}
          tone={
            history.rate === null
              ? "neutral"
              : history.rate >= 90
                ? "positive"
                : "warning"
          }
        />
        <StatTile label="Absences" value={history.absent} tone="danger" />
        <StatTile label="Late" value={history.late} tone="warning" />
        <StatTile
          label="Observations"
          value={history.observations.length}
          hint={`${history.positives} positive · ${history.concerns} concern`}
          tone="brand"
        />
        <StatTile
          label="Excused"
          value={history.excused}
          hint={`${history.present} present`}
        />
      </div>

      <div className="mb-6">
        <Card title="Attendance mix" subtitle={`Last ${window} days`}>
          <div className="px-5 py-4">
            <AttendanceBar
              present={history.present}
              absent={history.absent}
              late={history.late}
              excused={history.excused}
            />
            <p className="mt-2 text-xs text-ink-500">
              {history.present} present · {history.late} late ·{" "}
              {history.excused} excused · {history.absent} absent
            </p>
          </div>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card
          title="Attendance history"
          subtitle={`${history.attendance.length} records`}
        >
          {history.attendance.length === 0 ? (
            <EmptyState>
              No attendance was recorded for this student in this period.
            </EmptyState>
          ) : (
            <div className="max-h-[28rem] overflow-y-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Status</th>
                    <th>Note</th>
                    <th className="text-right">Recorded by</th>
                  </tr>
                </thead>
                <tbody>
                  {history.attendance.map((row) => (
                    <tr key={row.id}>
                      <td className="whitespace-nowrap text-ink-600">
                        {formatDate(row.date)}
                      </td>
                      <td>
                        <AttendanceBadge status={row.status} />
                      </td>
                      <td className="text-ink-600">{row.note || "—"}</td>
                      <td className="text-right text-xs text-ink-400">
                        {row.recordedBy.firstName} {row.recordedBy.lastName}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card
          title="Observations"
          subtitle={`${history.observations.length} entries`}
        >
          {history.observations.length === 0 ? (
            <EmptyState>
              No observations were written for this student in this period.
            </EmptyState>
          ) : (
            <ul className="max-h-[28rem] divide-y divide-ink-100 overflow-y-auto">
              {history.observations.map((row) => (
                <li key={row.id} className="px-5 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs text-ink-500">
                      {formatDate(row.date)} ·{" "}
                      {
                        OBSERVATION_CATEGORY_LABELS[
                          row.category as keyof typeof OBSERVATION_CATEGORY_LABELS
                        ]
                      }
                    </span>
                    <SentimentBadge sentiment={row.sentiment} />
                  </div>
                  <p className="mt-1 text-sm text-ink-800">{row.note}</p>
                  <p className="mt-0.5 text-xs text-ink-400">
                    {row.author.firstName} {row.author.lastName}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Contact details — editable by staff, and by the class supervisor ---- */}
      {showContact && (
        <Card
          className="mt-6"
          title="Contact details"
          subtitle={
            contactPermission.allowed
              ? contactPermission.reason === "supervisor"
                ? "You supervise this class, so you may update these four fields"
                : undefined
              : "Read-only — this student is not in a class assigned to you"
          }
        >
          <StudentContactForm
            studentId={student.id}
            email={student.email}
            phone={student.phone}
            phone2={student.phone2}
            phone3={student.phone3}
            canEdit={contactPermission.allowed}
          />
        </Card>
      )}

      {/* Record — staff only ------------------------------------------------ */}
      {user.access.students?.view && (
        <Card className="mt-6" title="Record">
          <div className="grid gap-4 px-5 py-4 text-sm sm:grid-cols-3">
            <div>
              <p className="text-xs text-ink-500">Class</p>
              <p className="text-ink-800">
                {student.class ? (
                  <Link
                    href={`/classes/${student.class.id}`}
                    className="hover:text-brand-600"
                  >
                    {student.class.name}
                  </Link>
                ) : (
                  "Unassigned"
                )}
              </p>
            </div>
            <div>
              <p className="text-xs text-ink-500">Parent</p>
              <p className="text-ink-800">
                {student.parent
                  ? `${student.parent.firstName} ${student.parent.lastName}`
                  : "—"}
              </p>
              {student.parent?.phone && (
                <p className="text-xs text-ink-500">{student.parent.phone}</p>
              )}
              {student.parent?.email && (
                <p className="text-xs text-ink-500">{student.parent.email}</p>
              )}
            </div>
            <div>
              <p className="text-xs text-ink-500">Student account</p>
              <p className="text-ink-800">{student.user?.email ?? "None"}</p>
            </div>
          </div>
        </Card>
      )}
    </>
  );
}
