import { ConfirmSubmit } from "@/components/confirm-submit";
import Link from "next/link";
import { requireModule } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  endOfWeek,
  formatDate,
  formatShortDate,
  startOfWeek,
  today,
  toISODate,
} from "@/lib/dates";
import {
  getCurrentYear,
  getObservationSummaryForWeek,
  getVisibleClassIds,
} from "@/lib/queries";
import {
  Card,
  EmptyState,
  PageHeader,
  SentimentBadge,
  StatTile,
} from "@/components/ui";
import { ActionForm, Disclosure } from "@/components/action-form";
import {
  OBSERVATION_CATEGORIES,
  OBSERVATION_CATEGORY_LABELS,
  SENTIMENTS,
  SENTIMENT_LABELS,
} from "@/lib/constants";
import { createObservation, deleteObservation } from "./actions";

export default async function ObservationsPage({
  searchParams,
}: {
  searchParams: Promise<{ classId?: string; date?: string }>;
}) {
  const user = await requireModule("observations");
  const params = await searchParams;

  const year = await getCurrentYear();
  const visible = await getVisibleClassIds(user);

  const classes = year
    ? await prisma.class.findMany({
        where: {
          academicYearId: year.id,
          ...(visible === "ALL" ? {} : { id: { in: visible } }),
        },
        orderBy: { name: "asc" },
      })
    : [];

  const selectedClassId =
    params.classId && classes.some((c) => c.id === params.classId)
      ? params.classId
      : classes[0]?.id;
  const dateParam = params.date ?? toISODate(today());

  const isOwnClass =
    user.role === "ADMIN" ||
    user.role === "DEPUTY" ||
    (visible !== "ALL" && selectedClassId ? visible.includes(selectedClassId) : false);
  const canWrite = user.access.observations.edit && isOwnClass;

  const weekStart = startOfWeek(today());
  const weekEnd = endOfWeek(today());

  const [roster, weekObservations, summary] = await Promise.all([
    selectedClassId
      ? prisma.student.findMany({
          where: { classId: selectedClassId, isActive: true },
          orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
        })
      : Promise.resolve([]),
    prisma.observation.findMany({
      where: {
        classId: { in: classes.map((c) => c.id) },
        date: { gte: weekStart, lte: weekEnd },
        ...(selectedClassId ? { classId: selectedClassId } : {}),
      },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      include: { student: true, author: true, class: true },
      take: 200,
    }),
    getObservationSummaryForWeek(
      today(),
      classes.map((c) => c.id),
    ),
  ]);

  const totals = summary.rows.reduce(
    (acc, row) => ({
      total: acc.total + row.total,
      positive: acc.positive + row.positive,
      concern: acc.concern + row.concern,
    }),
    { total: 0, positive: 0, concern: 0 },
  );

  // Group the week's entries by day for the list view.
  const byDay = new Map<string, typeof weekObservations>();
  for (const row of weekObservations) {
    const key = toISODate(row.date);
    byDay.set(key, [...(byDay.get(key) ?? []), row]);
  }
  const days = [...byDay.keys()].sort().reverse();

  return (
    <>
      <PageHeader
        title="Observations"
        description={`Week of ${formatDate(weekStart)} — ${
          visible === "ALL" ? "all classes" : "your assigned classes"
        }`}
      />

      <form className="mb-6 flex flex-wrap items-end gap-3" action="/observations">
        <div>
          <label className="label" htmlFor="classId">Class</label>
          <select
            id="classId"
            name="classId"
            className="select w-56"
            defaultValue={selectedClassId ?? ""}
          >
            {classes.length === 0 && <option value="">No classes available</option>}
            {classes.map((klass) => (
              <option key={klass.id} value={klass.id}>{klass.name}</option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn-secondary">Show class</button>
      </form>

      {classes.length === 0 ? (
        <Card>
          <EmptyState>
            No classes are available to you. An administrator assigns classes
            under Assignments.
          </EmptyState>
        </Card>
      ) : (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile label="This week" value={totals.total} tone="brand" hint="all your classes" />
            <StatTile label="Positive" value={totals.positive} tone="positive" />
            <StatTile label="Concerns" value={totals.concern} tone="danger" />
            <StatTile
              label="Entries shown"
              value={weekObservations.length}
              hint={selectedClassId ? "selected class" : "all classes"}
            />
          </div>

          {canWrite && selectedClassId && roster.length > 0 && (
            <div className="mb-6">
              <Disclosure label="Add an observation">
                <ActionForm
                  action={createObservation}
                  submitLabel="Add observation"
                  resetOnSuccess
                >
                  <input type="hidden" name="classId" value={selectedClassId} />
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <div>
                      <label className="label" htmlFor="studentId">Student</label>
                      <select id="studentId" name="studentId" className="select" required>
                        {roster.map((student) => (
                          <option key={student.id} value={student.id}>
                            {student.lastName}, {student.firstName}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="label" htmlFor="date">Date</label>
                      <input
                        id="date"
                        name="date"
                        type="date"
                        className="input"
                        defaultValue={dateParam}
                        max={toISODate(today())}
                        required
                      />
                    </div>
                    <div>
                      <label className="label" htmlFor="category">Category</label>
                      <select id="category" name="category" className="select" defaultValue="BEHAVIOR">
                        {OBSERVATION_CATEGORIES.map((category) => (
                          <option key={category} value={category}>
                            {OBSERVATION_CATEGORY_LABELS[category]}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="label" htmlFor="sentiment">Sentiment</label>
                      <select id="sentiment" name="sentiment" className="select" defaultValue="NEUTRAL">
                        {SENTIMENTS.map((sentiment) => (
                          <option key={sentiment} value={sentiment}>
                            {SENTIMENT_LABELS[sentiment]}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="sm:col-span-2 lg:col-span-4">
                      <label className="label" htmlFor="note">Observation</label>
                      <textarea
                        id="note"
                        name="note"
                        rows={2}
                        className="input"
                        placeholder="What did you observe?"
                        required
                      />
                    </div>
                  </div>
                </ActionForm>
              </Disclosure>
            </div>
          )}

          {!isOwnClass && (
            <div className="mb-5 rounded-xl border border-ink-200 bg-white px-5 py-3 text-sm text-ink-600">
              You are viewing this class read-only — you are not assigned to
              teach it.
            </div>
          )}

          <div className="grid gap-6 lg:grid-cols-3">
            <div className="space-y-5 lg:col-span-2">
              {days.length === 0 ? (
                <Card>
                  <EmptyState>No observations recorded this week.</EmptyState>
                </Card>
              ) : (
                days.map((day) => {
                  const rows = byDay.get(day)!;
                  return (
                    <Card
                      key={day}
                      title={formatDate(new Date(`${day}T00:00:00.000Z`))}
                      subtitle={`${rows.length} ${rows.length === 1 ? "entry" : "entries"}`}
                    >
                      <ul className="divide-y divide-ink-100">
                        {rows.map((row) => {
                          const mine = row.authorId === user.userId;
                          const canDelete =
                            user.access.observations.edit &&
                            (mine || user.role === "ADMIN" || user.role === "DEPUTY");
                          return (
                            <li key={row.id} className="px-5 py-3">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium text-ink-900">
                                    {row.student.firstName} {row.student.lastName}
                                  </span>
                                  <span className="badge bg-ink-100 text-ink-600">
                                    {
                                      OBSERVATION_CATEGORY_LABELS[
                                        row.category as keyof typeof OBSERVATION_CATEGORY_LABELS
                                      ]
                                    }
                                  </span>
                                  <SentimentBadge sentiment={row.sentiment} />
                                </div>
                                {canDelete && (
                                  <form action={deleteObservation}>
                                    <input type="hidden" name="id" value={row.id} />
                                    <ConfirmSubmit
                                      className="btn-danger btn-sm"
                                      message="Delete this observation? This cannot be undone."
                                    >
                                      Delete
                                    </ConfirmSubmit>
                                  </form>
                                )}
                              </div>
                              <p className="mt-1.5 text-sm text-ink-700">{row.note}</p>
                              <p className="mt-1 text-xs text-ink-400">
                                {row.class.name} · {row.author.firstName}{" "}
                                {row.author.lastName}
                                {mine && " (you)"}
                              </p>
                            </li>
                          );
                        })}
                      </ul>
                    </Card>
                  );
                })
              )}
            </div>

            <div>
              <Card
                title="This week by class"
                subtitle={`${formatShortDate(summary.from)} – ${formatShortDate(summary.to)}`}
              >
                {summary.rows.length === 0 ? (
                  <EmptyState>No classes.</EmptyState>
                ) : (
                  <ul className="divide-y divide-ink-100">
                    {summary.rows.map((row) => (
                      <li key={row.classId} className="px-5 py-3">
                        <div className="flex items-center justify-between">
                          <Link
                            href={`/observations?classId=${row.classId}`}
                            className="text-sm font-medium text-ink-900 hover:text-brand-600"
                          >
                            {row.className}
                          </Link>
                          <span className="text-sm font-semibold tabular-nums">
                            {row.total}
                          </span>
                        </div>
                        <div className="mt-1 flex gap-3 text-xs text-ink-500">
                          <span className="text-emerald-600">{row.positive} positive</span>
                          <span>{row.neutral} neutral</span>
                          <span className="text-red-600">{row.concern} concern</span>
                        </div>
                        <p className="mt-0.5 text-xs text-ink-400">
                          {row.studentsCovered} of {row.enrolled} students covered
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          </div>
        </>
      )}
    </>
  );
}
