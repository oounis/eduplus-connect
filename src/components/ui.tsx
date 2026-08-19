import type { ReactNode } from "react";
import {
  ATTENDANCE_LABELS,
  SENTIMENT_LABELS,
  TASK_STATUS_LABELS,
  type AttendanceStatus,
  type Sentiment,
  type TaskStatus,
} from "@/lib/constants";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-ink-900">
          {title}
        </h1>
        {description && (
          <p className="mt-1 text-sm text-ink-500">{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Card({
  title,
  subtitle,
  actions,
  children,
  className = "",
}: {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <div className="card-header">
          <div>
            {title && <h2 className="card-title">{title}</h2>}
            {subtitle && <p className="card-subtitle">{subtitle}</p>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function StatTile({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "neutral" | "positive" | "warning" | "danger" | "brand";
}) {
  const tones: Record<string, string> = {
    neutral: "text-ink-900",
    positive: "text-emerald-600",
    warning: "text-amber-600",
    danger: "text-red-600",
    brand: "text-brand-600",
  };
  return (
    <div className="card px-5 py-4">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-500">
        {label}
      </p>
      <p className={`mt-1.5 text-2xl font-semibold tabular-nums ${tones[tone]}`}>
        {value}
      </p>
      {hint && <p className="mt-0.5 text-xs text-ink-500">{hint}</p>}
    </div>
  );
}

const ATTENDANCE_TONES: Record<AttendanceStatus, string> = {
  PRESENT: "bg-emerald-50 text-emerald-700",
  ABSENT: "bg-red-50 text-red-700",
  LATE: "bg-amber-50 text-amber-700",
  EXCUSED: "bg-sky-50 text-sky-700",
};

export function AttendanceBadge({ status }: { status: string }) {
  const key = status as AttendanceStatus;
  return (
    <span className={`badge ${ATTENDANCE_TONES[key] ?? "bg-ink-100 text-ink-700"}`}>
      {ATTENDANCE_LABELS[key] ?? status}
    </span>
  );
}

const SENTIMENT_TONES: Record<Sentiment, string> = {
  POSITIVE: "bg-emerald-50 text-emerald-700",
  NEUTRAL: "bg-ink-100 text-ink-700",
  CONCERN: "bg-red-50 text-red-700",
};

export function SentimentBadge({ sentiment }: { sentiment: string }) {
  const key = sentiment as Sentiment;
  return (
    <span className={`badge ${SENTIMENT_TONES[key] ?? "bg-ink-100 text-ink-700"}`}>
      {SENTIMENT_LABELS[key] ?? sentiment}
    </span>
  );
}

const TASK_TONES: Record<TaskStatus, string> = {
  TODO: "bg-ink-100 text-ink-700",
  IN_PROGRESS: "bg-brand-50 text-brand-700",
  DONE: "bg-emerald-50 text-emerald-700",
  CANCELLED: "bg-ink-100 text-ink-400 line-through",
};

export function TaskStatusBadge({ status }: { status: string }) {
  const key = status as TaskStatus;
  return (
    <span className={`badge ${TASK_TONES[key] ?? "bg-ink-100 text-ink-700"}`}>
      {TASK_STATUS_LABELS[key] ?? status}
    </span>
  );
}

export function RoleBadge({ role }: { role: string }) {
  const tones: Record<string, string> = {
    ADMIN: "bg-brand-50 text-brand-700",
    DEPUTY: "bg-violet-50 text-violet-700",
    STAFF: "bg-sky-50 text-sky-700",
    SUPERVISOR: "bg-amber-50 text-amber-700",
    TEACHER: "bg-emerald-50 text-emerald-700",
    PARENT: "bg-pink-50 text-pink-700",
    STUDENT: "bg-ink-100 text-ink-700",
  };
  return (
    <span className={`badge ${tones[role] ?? "bg-ink-100 text-ink-700"}`}>
      {role.charAt(0) + role.slice(1).toLowerCase()}
    </span>
  );
}

/** Horizontal present/absent/late/excused bar used in the class summaries. */
export function AttendanceBar({
  present,
  absent,
  late,
  excused,
}: {
  present: number;
  absent: number;
  late: number;
  excused: number;
}) {
  const total = present + absent + late + excused;
  if (total === 0) {
    return <div className="h-2 w-full rounded-full bg-ink-100" />;
  }
  const pct = (n: number) => `${(n / total) * 100}%`;
  return (
    <div className="flex h-2 w-full overflow-hidden rounded-full bg-ink-100">
      <div style={{ width: pct(present) }} className="bg-emerald-500" />
      <div style={{ width: pct(late) }} className="bg-amber-400" />
      <div style={{ width: pct(excused) }} className="bg-sky-400" />
      <div style={{ width: pct(absent) }} className="bg-red-500" />
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>;
}
