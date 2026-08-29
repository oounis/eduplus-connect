import type { DayGridRow, DayPeriodSummary } from "@/lib/periods";
import type { PeriodLike } from "@/lib/school-time";
import type { AttendanceStatus } from "@/lib/constants";

/**
 * The whole school day for this class: a row per student, a column per period,
 * and a final column carrying the day's verdict.
 *
 * The final column is the status from the LAST period that was recorded, not
 * the first — a student marked absent at 08:00 who arrives by the third period
 * ends the day present, and that is what a parent should be told.
 */

const CELL: Record<string, string> = {
  PRESENT: "bg-emerald-50 text-emerald-700",
  ABSENT: "bg-red-50 text-red-700",
  LATE: "bg-amber-50 text-amber-700",
  EXCUSED: "bg-sky-50 text-sky-700",
};

/** One letter in the grid, the full word in the final column. */
const SHORT: Record<string, string> = {
  PRESENT: "✓",
  ABSENT: "✕",
  LATE: "L",
  EXCUSED: "E",
};

export default function DayGrid({
  periods,
  rows,
  summary,
  livePeriodId,
  labels,
}: {
  periods: PeriodLike[];
  rows: DayGridRow[];
  summary: DayPeriodSummary[];
  livePeriodId: string | null;
  labels: {
    student: string;
    finalStatus: string;
    notTaken: string;
    absentCount: string;
    takenBy: string;
    statusLabels: Record<AttendanceStatus, string>;
  };
}) {
  const summaryByPeriod = new Map(summary.map((s) => [s.periodId, s]));

  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="table text-xs">
          <thead>
            <tr>
              <th className="sticky start-0 bg-white">{labels.student}</th>
              {periods.map((period) => (
                <th
                  key={period.id}
                  className={`text-center ${
                    period.id === livePeriodId ? "bg-emerald-50 text-emerald-800" : ""
                  }`}
                >
                  <span className="block">{period.name}</span>
                  <span className="block font-normal tabular-nums text-ink-400">
                    {period.startTime}
                  </span>
                </th>
              ))}
              {/* The column the day is actually judged on. */}
              <th className="border-s-2 border-ink-300 bg-ink-50 text-center">
                {labels.finalStatus}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.studentId}>
                <td className="sticky start-0 whitespace-nowrap bg-white font-medium text-ink-900">
                  {row.name}
                </td>
                {periods.map((period) => {
                  const cell = row.byPeriod[period.id];
                  return (
                    <td key={period.id} className="p-1 text-center">
                      {cell?.status ? (
                        <span
                          className={`inline-flex h-6 w-6 items-center justify-center rounded ${CELL[cell.status]}`}
                          title={labels.statusLabels[cell.status]}
                        >
                          {SHORT[cell.status]}
                        </span>
                      ) : (
                        <span className="text-ink-300">–</span>
                      )}
                    </td>
                  );
                })}
                <td className="border-s-2 border-ink-300 bg-ink-50/60 text-center">
                  {row.finalStatus ? (
                    <span className={`badge ${CELL[row.finalStatus]}`}>
                      {labels.statusLabels[row.finalStatus]}
                    </span>
                  ) : (
                    <span className="text-ink-400">{labels.notTaken}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            {/* Who took each period, and how many were away in it. */}
            <tr className="border-t-2 border-ink-200">
              <td className="sticky start-0 bg-white text-ink-500">
                {labels.absentCount}
              </td>
              {periods.map((period) => {
                const stats = summaryByPeriod.get(period.id);
                return (
                  <td key={period.id} className="text-center">
                    {stats?.taken ? (
                      <span
                        className={
                          stats.absent > 0
                            ? "font-semibold text-red-700"
                            : "text-ink-400"
                        }
                      >
                        {stats.absent}
                      </span>
                    ) : (
                      <span className="text-ink-300">–</span>
                    )}
                  </td>
                );
              })}
              <td className="border-s-2 border-ink-300 bg-ink-50" />
            </tr>
            <tr>
              <td className="sticky start-0 bg-white text-ink-500">
                {labels.takenBy}
              </td>
              {periods.map((period) => {
                const stats = summaryByPeriod.get(period.id);
                return (
                  <td
                    key={period.id}
                    className="max-w-24 truncate text-center text-[11px] text-ink-500"
                    title={stats?.teacher ?? ""}
                  >
                    {stats?.teacher ?? "–"}
                  </td>
                );
              })}
              <td className="border-s-2 border-ink-300 bg-ink-50" />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
