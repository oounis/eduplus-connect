import Link from "next/link";
import { requireModule } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { AUDIT_ENTITIES } from "@/lib/audit";
import { Card, EmptyState, PageHeader, RoleBadge, StatTile } from "@/components/ui";

const PAGE_SIZE = 60;

const ACTION_TONES: Record<string, string> = {
  CREATE: "bg-emerald-50 text-emerald-700",
  UPDATE: "bg-sky-50 text-sky-700",
  DELETE: "bg-red-50 text-red-700",
  ASSIGN: "bg-violet-50 text-violet-700",
  RESET: "bg-amber-50 text-amber-700",
  IMPORT: "bg-brand-50 text-brand-700",
};

function when(at: Date): string {
  return at.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ entity?: string; actor?: string; page?: string }>;
}) {
  await requireModule("audit");
  const params = await searchParams;

  const entity =
    params.entity && AUDIT_ENTITIES.includes(params.entity as never)
      ? params.entity
      : undefined;
  const actorId = params.actor || undefined;
  const page = Math.max(1, Number(params.page) || 1);

  const where = {
    ...(entity ? { entity } : {}),
    ...(actorId ? { actorId } : {}),
  };

  const [events, total, todayCount, actors] = await Promise.all([
    prisma.auditEvent.findMany({
      where,
      orderBy: { at: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.auditEvent.count({ where }),
    prisma.auditEvent.count({
      where: { at: { gte: new Date(Date.now() - 24 * 3600 * 1000) } },
    }),
    prisma.auditEvent.groupBy({
      by: ["actorId", "actorName"],
      _count: { _all: true },
      orderBy: { _count: { actorId: "desc" } },
      take: 12,
    }),
  ]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const link = (next: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    const merged = { entity, actor: actorId, page: String(page), ...next };
    for (const [k, v] of Object.entries(merged)) if (v) q.set(k, v);
    return `/audit?${q.toString()}`;
  };

  return (
    <>
      <PageHeader
        title="History"
        description="Every change to accounts, access rights, classes, students, assignments, tasks and registers"
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Events recorded" value={total} />
        <StatTile label="Last 24 hours" value={todayCount} tone="brand" />
        <StatTile label="People acting" value={actors.length} />
        <StatTile
          label="Showing"
          value={`${events.length}`}
          hint={`page ${page} of ${pages}`}
        />
      </div>

      {/* Filters ------------------------------------------------------------ */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Link
          href="/audit"
          className={`badge ${!entity && !actorId ? "bg-brand-50 text-brand-700" : "bg-ink-100 text-ink-600"}`}
        >
          Everything
        </Link>
        {AUDIT_ENTITIES.map((key) => (
          <Link
            key={key}
            href={link({ entity: entity === key ? undefined : key, page: "1" })}
            className={`badge ${entity === key ? "bg-brand-50 text-brand-700" : "bg-ink-100 text-ink-600 hover:text-ink-900"}`}
          >
            {key}
          </Link>
        ))}
      </div>

      {actors.length > 0 && (
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-ink-500">
            By person
          </span>
          {actors.map((a) => (
            <Link
              key={a.actorId}
              href={link({
                actor: actorId === a.actorId ? undefined : a.actorId,
                page: "1",
              })}
              className={`badge ${actorId === a.actorId ? "bg-brand-50 text-brand-700" : "bg-ink-100 text-ink-600 hover:text-ink-900"}`}
            >
              {a.actorName} · {a._count._all}
            </Link>
          ))}
        </div>
      )}

      <Card title={`${total} ${total === 1 ? "event" : "events"}`}>
        {events.length === 0 ? (
          <EmptyState>
            Nothing has been recorded for this filter yet.
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th className="w-36">When</th>
                  <th className="w-48">Who</th>
                  <th className="w-24">Action</th>
                  <th className="w-24">On</th>
                  <th>What changed</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => (
                  <tr key={event.id}>
                    <td className="whitespace-nowrap text-xs text-ink-500">
                      {when(event.at)}
                    </td>
                    <td>
                      <span className="text-ink-800">{event.actorName}</span>
                      <span className="ms-2">
                        <RoleBadge role={event.actorRole} />
                      </span>
                    </td>
                    <td>
                      <span
                        className={`badge ${ACTION_TONES[event.action] ?? "bg-ink-100 text-ink-700"}`}
                      >
                        {event.action.toLowerCase()}
                      </span>
                    </td>
                    <td className="text-xs text-ink-500">{event.entity}</td>
                    <td className="text-ink-800">{event.summary}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {pages > 1 && (
          <div className="flex items-center justify-between border-t border-ink-200 px-5 py-3">
            {page > 1 ? (
              <Link href={link({ page: String(page - 1) })} className="btn-secondary btn-sm">
                ← Newer
              </Link>
            ) : (
              <span />
            )}
            <span className="text-xs text-ink-500">
              Page {page} of {pages}
            </span>
            {page < pages ? (
              <Link href={link({ page: String(page + 1) })} className="btn-secondary btn-sm">
                Older →
              </Link>
            ) : (
              <span />
            )}
          </div>
        )}
      </Card>
    </>
  );
}
