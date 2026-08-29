import { ConfirmSubmit } from "@/components/confirm-submit";
import { requireModule } from "@/lib/auth";
import { getI18n } from "@/lib/locale";
import { prisma } from "@/lib/db";
import { formatDate, today } from "@/lib/dates";
import { Card, EmptyState, PageHeader, StatTile, TaskStatusBadge } from "@/components/ui";
import { ActionForm, Disclosure } from "@/components/action-form";
import { TASK_PRIORITIES, TASK_STATUSES } from "@/lib/constants";
import { createTask, deleteTask, updateTaskStatus } from "./actions";

const PRIORITY_TONES: Record<string, string> = {
  HIGH: "bg-red-50 text-red-700",
  MEDIUM: "bg-amber-50 text-amber-700",
  LOW: "bg-ink-100 text-ink-600",
};

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const user = await requireModule("tasks");
  const { locale, t } = await getI18n();
  const params = await searchParams;
  const canEdit = user.access.tasks.edit;

  // Staff without edit rights only ever see their own tasks.
  const mineOnly = params.view === "mine" || !canEdit;

  const tasks = await prisma.task.findMany({
    where: mineOnly ? { assigneeId: user.userId } : {},
    orderBy: [{ status: "asc" }, { dueDate: "asc" }, { createdAt: "desc" }],
    include: { assignee: true, createdBy: true },
  });

  const staff = canEdit
    ? await prisma.user.findMany({
        where: { role: { in: ["STAFF", "SUPERVISOR", "TEACHER", "DEPUTY"] }, isActive: true },
        orderBy: [{ role: "asc" }, { lastName: "asc" }],
      })
    : [];

  const now = today();
  const open = tasks.filter((t) => t.status === "TODO" || t.status === "IN_PROGRESS");
  const overdue = open.filter((t) => t.dueDate && t.dueDate < now);
  const dueToday = open.filter(
    (t) => t.dueDate && t.dueDate.getTime() === now.getTime(),
  );

  return (
    <>
      <PageHeader
        title={t("module.tasks.label")}
        description={
          canEdit
            ? t("tsk.subtitleAll")
            : t("tsk.subtitleMine")
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label={t("tsk.open")} value={open.length} tone="brand" />
        <StatTile label={t("tsk.dueToday")} value={dueToday.length} tone="warning" />
        <StatTile label={t("tsk.overdue")} value={overdue.length} tone="danger" />
        <StatTile
          label={t("tsk.completed")}
          value={tasks.filter((task) => task.status === "DONE").length}
          tone="positive"
        />
      </div>

      {canEdit && (
        <div className="mb-6">
          <Disclosure label={t("tsk.assignNew")}>
            <ActionForm action={createTask} submitLabel={t("tsk.assign")} resetOnSuccess>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="sm:col-span-2">
                  <label className="label" htmlFor="title">{t("tsk.titleField")}</label>
                  <input id="title" name="title" className="input" required />
                </div>
                <div>
                  <label className="label" htmlFor="assigneeId">{t("tsk.assignTo")}</label>
                  <select id="assigneeId" name="assigneeId" className="select" required>
                    {staff.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.firstName} {member.lastName} ·{" "}
                        {member.role.toLowerCase()}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="priority">{t("tsk.priority")}</label>
                  <select id="priority" name="priority" className="select" defaultValue="MEDIUM">
                    {TASK_PRIORITIES.map((priority) => (
                      <option key={priority} value={priority}>
                        {t(`priority.${priority}`)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-2 lg:col-span-3">
                  <label className="label" htmlFor="description">{t("tsk.description")}</label>
                  <textarea id="description" name="description" rows={2} className="input" />
                </div>
                <div>
                  <label className="label" htmlFor="dueDate">{t("tsk.dueDate")}</label>
                  <input id="dueDate" name="dueDate" type="date" className="input" />
                </div>
              </div>
            </ActionForm>
          </Disclosure>
        </div>
      )}

      <Card
        title={mineOnly ? t("tsk.myTasks") : t("tsk.allTasks")}
        subtitle={t("tsk.total", { n: tasks.length })}
      >
        {tasks.length === 0 ? (
          <EmptyState>{t("tsk.empty")}</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>{t("tsk.task")}</th>
                  <th>{t("tsk.assignedTo")}</th>
                  <th>{t("tsk.priority")}</th>
                  <th>{t("tsk.due")}</th>
                  <th>{t("common.status")}</th>
                  <th className="text-end">{t("tsk.update")}</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((task) => {
                  const isOverdue =
                    task.dueDate &&
                    task.dueDate < now &&
                    task.status !== "DONE" &&
                    task.status !== "CANCELLED";
                  const mayUpdate =
                    canEdit || task.assigneeId === user.userId;
                  return (
                    <tr key={task.id}>
                      <td>
                        <p className="font-medium text-ink-900">{task.title}</p>
                        {task.description && (
                          <p className="mt-0.5 text-xs text-ink-500">
                            {task.description}
                          </p>
                        )}
                        <p className="mt-0.5 text-xs text-ink-400">
                          {t("tsk.by", {
                            name: `${task.createdBy.firstName} ${task.createdBy.lastName}`,
                          })}
                        </p>
                      </td>
                      <td className="text-ink-600">
                        {task.assignee.firstName} {task.assignee.lastName}
                        {task.assigneeId === user.userId && (
                          <span className="ms-1 text-xs text-ink-400">{t("common.you")}</span>
                        )}
                      </td>
                      <td>
                        <span className={`badge ${PRIORITY_TONES[task.priority]}`}>
                          {t(`priority.${task.priority}`)}
                        </span>
                      </td>
                      <td className="whitespace-nowrap">
                        {task.dueDate ? (
                          <span className={isOverdue ? "font-medium text-red-600" : "text-ink-600"}>
                            {formatDate(task.dueDate, locale)}
                          </span>
                        ) : (
                          <span className="text-ink-400">—</span>
                        )}
                      </td>
                      <td><TaskStatusBadge status={task.status} /></td>
                      <td>
                        <div className="flex items-center justify-end gap-2">
                          {mayUpdate && (
                            <form action={updateTaskStatus} className="flex gap-2">
                              <input type="hidden" name="id" value={task.id} />
                              <select
                                name="status"
                                aria-label={t("tsk.statusOf", { title: task.title })}
                                defaultValue={task.status}
                                className="select w-32 py-1 text-xs"
                              >
                                {TASK_STATUSES.map((status) => (
                                  <option key={status} value={status}>
                                    {t(`task.${status}`)}
                                  </option>
                                ))}
                              </select>
                              <button type="submit" className="btn-secondary btn-sm">
                                {t("tsk.set")}
                              </button>
                            </form>
                          )}
                          {canEdit && (
                            <form action={deleteTask}>
                              <input type="hidden" name="id" value={task.id} />
                              <ConfirmSubmit
                                className="btn-danger btn-sm"
                                message={t("tsk.deleteConfirm", { title: task.title })}
                              >
                                {t("action.delete")}
                              </ConfirmSubmit>
                            </form>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
