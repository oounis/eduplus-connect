export const ROLES = [
  "ADMIN",
  "DEPUTY",
  "STAFF",
  "SUPERVISOR",
  "TEACHER",
  "PARENT",
  "STUDENT",
] as const;

export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Administrator",
  DEPUTY: "Deputy",
  STAFF: "Staff",
  SUPERVISOR: "Supervisor",
  TEACHER: "Teacher",
  PARENT: "Parent",
  STUDENT: "Student",
};

/// Every screen in the app is a module. Access rights are granted per module.
export const MODULES = [
  "dashboard",
  "users",
  "access",
  "academic",
  "classes",
  "students",
  "assignments",
  "attendance",
  "observations",
  "tasks",
  "reports",
  "audit",
] as const;

export type ModuleKey = (typeof MODULES)[number];

export const MODULE_META: Record<
  ModuleKey,
  { label: string; description: string; href: string; icon: string }
> = {
  dashboard: {
    label: "Dashboard",
    description: "Daily attendance and weekly observation summaries",
    href: "/dashboard",
    icon: "grid",
  },
  users: {
    label: "Users",
    description: "Create, edit, deactivate and reset accounts",
    href: "/users",
    icon: "users",
  },
  access: {
    label: "Access rights",
    description: "Grant module permissions per role",
    href: "/access",
    icon: "shield",
  },
  academic: {
    label: "Academic years",
    description: "Academic years and their terms",
    href: "/academic",
    icon: "calendar",
  },
  classes: {
    label: "Classes",
    description: "Classes of the current academic year",
    href: "/classes",
    icon: "school",
  },
  students: {
    label: "Students",
    description: "Student records and class placement",
    href: "/students",
    icon: "student",
  },
  assignments: {
    label: "Assignments",
    description: "Assign classes to supervisors and teachers",
    href: "/assignments",
    icon: "link",
  },
  attendance: {
    label: "Attendance",
    description: "Daily attendance register",
    href: "/attendance",
    icon: "check",
  },
  observations: {
    label: "Observations",
    description: "Daily student observations",
    href: "/observations",
    icon: "note",
  },
  tasks: {
    label: "Staff tasks",
    description: "Tasks assigned to staff by the deputy",
    href: "/tasks",
    icon: "task",
  },
  reports: {
    label: "Reports",
    description: "Attendance and observation reports over a date range",
    href: "/reports",
    icon: "chart",
  },
  audit: {
    label: "History",
    description: "Who changed what, and when",
    href: "/audit",
    icon: "history",
  },
};

/// Applied on a fresh database, and used as the reset baseline in /access.
export const DEFAULT_ROLE_ACCESS: Record<
  Role,
  Partial<Record<ModuleKey, { view: boolean; edit: boolean }>>
> = {
  ADMIN: {
    dashboard: { view: true, edit: true },
    users: { view: true, edit: true },
    access: { view: true, edit: true },
    academic: { view: true, edit: true },
    classes: { view: true, edit: true },
    students: { view: true, edit: true },
    assignments: { view: true, edit: true },
    attendance: { view: true, edit: false },
    observations: { view: true, edit: false },
    tasks: { view: true, edit: true },
    reports: { view: true, edit: false },
    audit: { view: true, edit: false },
  },
  DEPUTY: {
    dashboard: { view: true, edit: false },
    classes: { view: true, edit: false },
    students: { view: true, edit: false },
    attendance: { view: true, edit: false },
    observations: { view: true, edit: false },
    tasks: { view: true, edit: true },
    reports: { view: true, edit: false },
  },
  STAFF: {
    dashboard: { view: true, edit: false },
    classes: { view: true, edit: false },
    students: { view: true, edit: false },
    attendance: { view: true, edit: false },
    observations: { view: true, edit: false },
    tasks: { view: true, edit: false },
    reports: { view: true, edit: false },
  },
  SUPERVISOR: {
    dashboard: { view: true, edit: false },
    students: { view: true, edit: false },
    attendance: { view: true, edit: true },
    reports: { view: true, edit: false },
  },
  TEACHER: {
    dashboard: { view: true, edit: false },
    students: { view: true, edit: false },
    observations: { view: true, edit: true },
    reports: { view: true, edit: false },
  },
  PARENT: {
    dashboard: { view: true, edit: false },
  },
  STUDENT: {
    dashboard: { view: true, edit: false },
  },
};

export const ATTENDANCE_STATUSES = [
  "PRESENT",
  "ABSENT",
  "LATE",
  "EXCUSED",
] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export const ATTENDANCE_LABELS: Record<AttendanceStatus, string> = {
  PRESENT: "Present",
  ABSENT: "Absent",
  LATE: "Late",
  EXCUSED: "Excused",
};

export const OBSERVATION_CATEGORIES = [
  "BEHAVIOR",
  "PARTICIPATION",
  "HOMEWORK",
  "ACADEMIC",
  "OTHER",
] as const;
export type ObservationCategory = (typeof OBSERVATION_CATEGORIES)[number];

export const OBSERVATION_CATEGORY_LABELS: Record<ObservationCategory, string> = {
  BEHAVIOR: "Behaviour",
  PARTICIPATION: "Participation",
  HOMEWORK: "Homework",
  ACADEMIC: "Academic",
  OTHER: "Other",
};

export const SENTIMENTS = ["POSITIVE", "NEUTRAL", "CONCERN"] as const;
export type Sentiment = (typeof SENTIMENTS)[number];

export const SENTIMENT_LABELS: Record<Sentiment, string> = {
  POSITIVE: "Positive",
  NEUTRAL: "Neutral",
  CONCERN: "Concern",
};

export const TASK_STATUSES = [
  "TODO",
  "IN_PROGRESS",
  "DONE",
  "CANCELLED",
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  TODO: "To do",
  IN_PROGRESS: "In progress",
  DONE: "Done",
  CANCELLED: "Cancelled",
};

export const TASK_PRIORITIES = ["LOW", "MEDIUM", "HIGH"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];
