/**
 * Bilingual interface: English and Arabic, with right-to-left layout.
 *
 * Design choices, so the next change is obvious:
 *
 *  - The locale lives in a cookie, not in the URL. Every route stays where it
 *    is, no `/ar/...` duplication, and no middleware rewriting.
 *  - `t()` takes a dotted key and returns the string for the active locale,
 *    falling back to English if a key is missing. A missing key shows the
 *    English text rather than a raw key, which is the failure mode you want in
 *    front of a parent.
 *  - Server components read the locale with `getLocale()`; client components
 *    receive it as a prop. There is no context provider, because almost every
 *    page here is a server component and adding one would mean marking them
 *    client just to read a string.
 */

export const LOCALES = ["ar", "en"] as const;
export type Locale = (typeof LOCALES)[number];

export const LOCALE_COOKIE = "eduplus_locale";
export const DEFAULT_LOCALE: Locale = "ar";

export const LOCALE_META: Record<Locale, { label: string; dir: "ltr" | "rtl"; htmlLang: string }> = {
  en: { label: "English", dir: "ltr", htmlLang: "en" },
  ar: { label: "العربية", dir: "rtl", htmlLang: "ar" },
};

export function isLocale(value: string | undefined | null): value is Locale {
  return value === "en" || value === "ar";
}

export function dirFor(locale: Locale): "ltr" | "rtl" {
  return LOCALE_META[locale].dir;
}

/* -------------------------------------------------------------------------- */
/*  Dictionary                                                                */
/* -------------------------------------------------------------------------- */

type Dict = Record<string, string>;

const en: Dict = {
  // -- app shell
  "app.name": "EduPlus Connect",
  "app.tagline": "School management",
  "app.menu": "Menu",
  "app.signedInAs": "Signed in as",
  "app.myAccount": "My account",
  "app.signOut": "Sign out",
  "app.loading": "Loading…",
  "app.language": "Language",

  // -- roles
  "role.ADMIN": "Administrator",
  "role.DEPUTY": "Deputy",
  "role.STAFF": "Staff",
  "role.SUPERVISOR": "Supervisor",
  "role.TEACHER": "Teacher",
  "role.PARENT": "Parent",
  "role.STUDENT": "Student",

  // -- modules: nav label + description
  "module.dashboard.label": "Dashboard",
  "module.dashboard.description": "Daily attendance and weekly observation summaries",
  "module.users.label": "Users",
  "module.users.description": "Create, edit, deactivate and reset accounts",
  "module.access.label": "Access rights",
  "module.access.description": "Grant module permissions per role",
  "module.academic.label": "Academic years",
  "module.academic.description": "Academic years and their terms",
  "module.classes.label": "Classes",
  "module.classes.description": "Classes of the current academic year",
  "module.students.label": "Students",
  "module.students.description": "Student records and class placement",
  "module.assignments.label": "Assignments",
  "module.assignments.description": "Assign classes to supervisors and teachers",
  "module.attendance.label": "Attendance",
  "module.attendance.description": "Daily attendance register",
  "module.observations.label": "Observations",
  "module.observations.description": "Daily student observations",
  "module.tasks.label": "Staff tasks",
  "module.tasks.description": "Tasks assigned to staff by the deputy",
  "module.reports.label": "Reports",
  "module.reports.description": "Attendance and observation reports over a date range",
  "module.audit.label": "History",
  "module.audit.description": "Who changed what, and when",

  // -- attendance
  "attendance.PRESENT": "Present",
  "attendance.ABSENT": "Absent",
  "attendance.LATE": "Late",
  "attendance.EXCUSED": "Excused",

  // -- observations
  "observation.BEHAVIOR": "Behaviour",
  "observation.PARTICIPATION": "Participation",
  "observation.HOMEWORK": "Homework",
  "observation.ACADEMIC": "Academic",
  "observation.OTHER": "Other",
  "sentiment.POSITIVE": "Positive",
  "sentiment.NEUTRAL": "Neutral",
  "sentiment.CONCERN": "Concern",

  // -- tasks
  "task.TODO": "To do",
  "task.IN_PROGRESS": "In progress",
  "task.DONE": "Done",
  "task.CANCELLED": "Cancelled",
  "priority.LOW": "Low",
  "priority.MEDIUM": "Medium",
  "priority.HIGH": "High",

  // -- common actions
  "action.save": "Save",
  "action.saving": "Saving…",
  "action.cancel": "Cancel",
  "action.add": "Add",
  "action.edit": "Edit",
  "action.delete": "Delete",
  "action.search": "Search",
  "action.filter": "Filter",
  "action.clear": "Clear",
  "action.back": "Back",
  "action.exportCsv": "Export CSV",
  "action.exportExcel": "Export to Excel",
  "action.exportWeekly": "Export by week (Excel)",
  "action.backToDashboard": "Back to dashboard",

  // -- common words
  "common.none": "None",
  "common.all": "All",
  "common.allClasses": "All classes",
  "common.unassigned": "Unassigned",
  "common.active": "Active",
  "common.inactive": "Inactive",
  "common.class": "Class",
  "common.classes": "Classes",
  "common.level": "Level",
  "common.student": "Student",
  "common.students": "Students",
  "common.parent": "Parent",
  "common.date": "Date",
  "common.status": "Status",
  "common.note": "Note",
  "common.email": "Email",
  "common.phone": "Phone",
  "common.phone2": "Phone 2",
  "common.phone3": "Phone 3",
  "common.code": "Code",
  "common.firstName": "First name",
  "common.lastName": "Last name",
  "common.dateOfBirth": "Date of birth",
  "common.role": "Role",
  "common.yearsOld": "years old",
  "common.records": "Records",
  "common.today": "Today",
  "common.thisWeek": "This week",
  "dash.greeting": "Good day, {name}",
  "dash.allClasses": "all classes",
  "dash.attendanceToday": "Attendance — today",
  "dash.openRegister": "Open register →",
  "dash.registersTaken": "Registers taken",
  "dash.allComplete": "All classes complete",
  "dash.attendanceRate": "Attendance rate",
  "dash.recordedOf": "{recorded} of {enrolled} students recorded",
  "dash.byClass": "By class",
  "dash.taken": "Taken",
  "dash.nStudents": "{n} students",
  "dash.observationsWeek": "Observations — this week",
  "dash.openObservations": "Open observations →",
  "dash.observationsLogged": "Observations logged",
  "dash.classesWithEntries": "Classes with entries",
  "dash.studentsCovered": "Students covered",
  "dash.myChildren": "My children",
  "dash.myRecord": "My record",
  "dash.recentAttendance": "Recent attendance",
  "dash.recentObservations": "Recent observations",
  "dash.noAttendance": "No attendance recorded yet.",
  "dash.noObservations": "No observations recorded yet.",
  "dash.familyWindow": "attendance and observations from the last 30 days",
  "common.breakdown": "Breakdown",
  "common.rate": "Rate",
  "common.total": "Total",
  "common.concerns": "Concerns",

  // -- login
  "login.title": "Sign in",
  "login.subtitle": "School management platform",
  "login.email": "Email",
  "login.password": "Password",
  "login.submit": "Sign in",
  "login.submitting": "Signing in…",
  "login.invalid": "Email or password is not correct",
  "login.emailAddress": "Email address",
  "login.useSchoolAccount": "Use your school account to open your dashboard.",
  "login.headline": "One place for attendance, observations and the people who run the school.",
  "login.blurb": "Supervisors take the daily register, teachers log observations, and administration sees the whole school at a glance — today’s attendance and this week’s observations.",
  "login.statRoles": "Roles",
  "login.statModules": "Modules",
  "login.statAccess": "Access",
  "login.statPerRole": "Per role",
  "login.demoAccounts": "Demo accounts (password: Passw0rd!)",
  "login.langHint": "Language",
  "demo.ADMIN": "Users, access rights, academic setup",
  "demo.DEPUTY": "Staff tasks and school-wide summaries",
  "demo.STAFF": "Own tasks and school-wide summaries",
  "demo.SUPERVISOR": "Daily attendance for assigned classes",
  "demo.TEACHER": "Daily observations for assigned classes",
  "demo.PARENT": "Own children only",
  "demo.STUDENT": "Own record only",

  // -- student contact
  "contact.title": "Contact details",
  "contact.save": "Save contact details",
  "contact.supervisorHint": "You supervise this class, so you may update these four fields",
  "contact.readOnly": "Read-only — this student is not in a class assigned to you",
  "contact.clearHint": "Leave a field empty to clear it. Every change is written to the audit trail.",
  "contact.saved": "Contact details saved",
  "contact.noChanges": "No changes to save",
  "contact.badEmail": "That email address does not look right",
  "contact.notMyClass": "You can only edit contact details for students in the classes assigned to you",
  "contact.notAllowed": "You are not allowed to edit student contact details",
  "contact.noStudent": "That student no longer exists",

  // -- denied
  "denied.title": "You don’t have access to that module",
  "denied.body": "Your role has not been granted this module. An administrator can change that under Access rights.",

  // -- students page
  "students.title": "Students",
  "students.allOf": "All students of {name}.",
  "students.assignedToYou": "Students in the classes assigned to you.",
  "students.record": "Record",
  "students.studentAccount": "Student account",
};

const ar: Dict = {
  // -- app shell
  "app.name": "إديو بلس كونكت",
  "app.tagline": "إدارة المدرسة",
  "app.menu": "القائمة",
  "app.signedInAs": "تم الدخول باسم",
  "app.myAccount": "حسابي",
  "app.signOut": "تسجيل الخروج",
  "app.loading": "جارٍ التحميل…",
  "app.language": "اللغة",

  // -- roles
  "role.ADMIN": "مدير",
  "role.DEPUTY": "نائب المدير",
  "role.STAFF": "موظف",
  "role.SUPERVISOR": "مشرف",
  "role.TEACHER": "معلم",
  "role.PARENT": "وليّ الأمر",
  "role.STUDENT": "طالب",

  // -- modules
  "module.dashboard.label": "لوحة المعلومات",
  "module.dashboard.description": "ملخّص الحضور اليومي والملاحظات الأسبوعية",
  "module.users.label": "المستخدمون",
  "module.users.description": "إنشاء الحسابات وتعديلها وتعطيلها وإعادة تعيين كلمات المرور",
  "module.access.label": "صلاحيات الوصول",
  "module.access.description": "منح صلاحيات الوحدات لكل دور",
  "module.academic.label": "السنوات الدراسية",
  "module.academic.description": "السنوات الدراسية وفصولها",
  "module.classes.label": "الأقسام",
  "module.classes.description": "أقسام السنة الدراسية الحالية",
  "module.students.label": "الطلاب",
  "module.students.description": "سجلات الطلاب وتوزيعهم على الأقسام",
  "module.assignments.label": "التكليفات",
  "module.assignments.description": "تكليف المشرفين والمعلمين بالأقسام",
  "module.attendance.label": "الحضور",
  "module.attendance.description": "سجل الحضور اليومي",
  "module.observations.label": "الملاحظات",
  "module.observations.description": "الملاحظات اليومية عن الطلاب",
  "module.tasks.label": "مهام الموظفين",
  "module.tasks.description": "المهام التي يكلّف بها النائب الموظفين",
  "module.reports.label": "التقارير",
  "module.reports.description": "تقارير الحضور والملاحظات خلال فترة محددة",
  "module.audit.label": "السجل",
  "module.audit.description": "من غيّر ماذا، ومتى",

  // -- attendance
  "attendance.PRESENT": "حاضر",
  "attendance.ABSENT": "غائب",
  "attendance.LATE": "متأخر",
  "attendance.EXCUSED": "بعذر",

  // -- observations
  "observation.BEHAVIOR": "السلوك",
  "observation.PARTICIPATION": "المشاركة",
  "observation.HOMEWORK": "الواجبات",
  "observation.ACADEMIC": "المستوى الدراسي",
  "observation.OTHER": "أخرى",
  "sentiment.POSITIVE": "إيجابي",
  "sentiment.NEUTRAL": "محايد",
  "sentiment.CONCERN": "مثير للقلق",

  // -- tasks
  "task.TODO": "قيد الانتظار",
  "task.IN_PROGRESS": "قيد التنفيذ",
  "task.DONE": "منجزة",
  "task.CANCELLED": "ملغاة",
  "priority.LOW": "منخفضة",
  "priority.MEDIUM": "متوسطة",
  "priority.HIGH": "عالية",

  // -- common actions
  "action.save": "حفظ",
  "action.saving": "جارٍ الحفظ…",
  "action.cancel": "إلغاء",
  "action.add": "إضافة",
  "action.edit": "تعديل",
  "action.delete": "حذف",
  "action.search": "بحث",
  "action.filter": "تصفية",
  "action.clear": "مسح",
  "action.back": "رجوع",
  "action.exportCsv": "تصدير CSV",
  "action.exportExcel": "تصدير إلى Excel",
  "action.exportWeekly": "تصدير أسبوعي (Excel)",
  "action.backToDashboard": "الرجوع إلى لوحة المعلومات",

  // -- common words
  "common.none": "لا شيء",
  "common.all": "الكل",
  "common.allClasses": "كل الأقسام",
  "common.unassigned": "غير مُوزَّع",
  "common.active": "نشط",
  "common.inactive": "غير نشط",
  "common.class": "القسم",
  "common.classes": "الأقسام",
  "common.level": "المستوى",
  "common.student": "الطالب",
  "common.students": "الطلاب",
  "common.parent": "وليّ الأمر",
  "common.date": "التاريخ",
  "common.status": "الحالة",
  "common.note": "ملاحظة",
  "common.email": "البريد الإلكتروني",
  "common.phone": "الهاتف",
  "common.phone2": "الهاتف 2",
  "common.phone3": "الهاتف 3",
  "common.code": "الرقم",
  "common.firstName": "الاسم",
  "common.lastName": "اللقب",
  "common.dateOfBirth": "تاريخ الميلاد",
  "common.role": "الدور",
  "common.yearsOld": "سنة",
  "common.records": "السجلات",
  "common.today": "اليوم",
  "common.thisWeek": "هذا الأسبوع",
  "dash.greeting": "طاب يومك، {name}",
  "dash.allClasses": "كل الأقسام",
  "dash.attendanceToday": "الحضور — اليوم",
  "dash.openRegister": "فتح السجل ←",
  "dash.registersTaken": "السجلات المأخوذة",
  "dash.allComplete": "كل الأقسام مكتملة",
  "dash.attendanceRate": "نسبة الحضور",
  "dash.recordedOf": "{recorded} من {enrolled} طالباً مسجَّلين",
  "dash.byClass": "حسب القسم",
  "dash.taken": "مأخوذ",
  "dash.nStudents": "{n} طالباً",
  "dash.observationsWeek": "الملاحظات — هذا الأسبوع",
  "dash.openObservations": "فتح الملاحظات ←",
  "dash.observationsLogged": "الملاحظات المسجَّلة",
  "dash.classesWithEntries": "الأقسام التي بها إدخالات",
  "dash.studentsCovered": "الطلاب المشمولون",
  "dash.myChildren": "أبنائي",
  "dash.myRecord": "سجلي",
  "dash.recentAttendance": "الحضور الأخير",
  "dash.recentObservations": "الملاحظات الأخيرة",
  "dash.noAttendance": "لا يوجد حضور مسجَّل بعد.",
  "dash.noObservations": "لا توجد ملاحظات مسجَّلة بعد.",
  "dash.familyWindow": "الحضور والملاحظات خلال الثلاثين يوماً الأخيرة",
  "common.breakdown": "التفصيل",
  "common.rate": "النسبة",
  "common.total": "المجموع",
  "common.concerns": "حالات القلق",

  // -- login
  "login.title": "تسجيل الدخول",
  "login.subtitle": "منصة إدارة المدرسة",
  "login.email": "البريد الإلكتروني",
  "login.password": "كلمة المرور",
  "login.submit": "دخول",
  "login.submitting": "جارٍ الدخول…",
  "login.invalid": "البريد الإلكتروني أو كلمة المرور غير صحيحة",
  "login.emailAddress": "البريد الإلكتروني",
  "login.useSchoolAccount": "استخدم حساب المدرسة لفتح لوحة المعلومات.",
  "login.headline": "مكان واحد للحضور والملاحظات ولكل من يدير المدرسة.",
  "login.blurb": "المشرفون يسجّلون الحضور اليومي، والمعلمون يكتبون الملاحظات، والإدارة ترى المدرسة كاملة بنظرة واحدة — حضور اليوم وملاحظات هذا الأسبوع.",
  "login.statRoles": "الأدوار",
  "login.statModules": "الوحدات",
  "login.statAccess": "الصلاحيات",
  "login.statPerRole": "حسب الدور",
  "login.demoAccounts": "حسابات تجريبية (كلمة المرور: Passw0rd!)",
  "login.langHint": "اللغة",
  "demo.ADMIN": "المستخدمون والصلاحيات وإعداد السنة الدراسية",
  "demo.DEPUTY": "مهام الموظفين وملخصات المدرسة كاملة",
  "demo.STAFF": "مهامه الخاصة وملخصات المدرسة كاملة",
  "demo.SUPERVISOR": "الحضور اليومي للأقسام المكلَّفة إليه",
  "demo.TEACHER": "الملاحظات اليومية للأقسام المكلَّفة إليه",
  "demo.PARENT": "أبناؤه فقط",
  "demo.STUDENT": "سجله الخاص فقط",

  // -- student contact
  "contact.title": "بيانات الاتصال",
  "contact.save": "حفظ بيانات الاتصال",
  "contact.supervisorHint": "أنت مشرف على هذا القسم، لذا يمكنك تحديث هذه الحقول الأربعة",
  "contact.readOnly": "للقراءة فقط — هذا الطالب ليس في قسم مكلَّف إليك",
  "contact.clearHint": "اترك الحقل فارغاً لمسحه. كل تغيير يُسجَّل في سجل التغييرات.",
  "contact.saved": "تم حفظ بيانات الاتصال",
  "contact.noChanges": "لا توجد تغييرات للحفظ",
  "contact.badEmail": "صيغة البريد الإلكتروني غير صحيحة",
  "contact.notMyClass": "يمكنك تعديل بيانات الاتصال لطلاب الأقسام المكلَّفة إليك فقط",
  "contact.notAllowed": "لا تملك صلاحية تعديل بيانات اتصال الطلاب",
  "contact.noStudent": "هذا الطالب لم يعد موجوداً",

  // -- denied
  "denied.title": "لا تملك صلاحية الوصول إلى هذه الوحدة",
  "denied.body": "لم تُمنح هذه الوحدة لدورك. يمكن للمدير تغيير ذلك من صلاحيات الوصول.",

  // -- students page
  "students.title": "الطلاب",
  "students.allOf": "كل طلاب {name}.",
  "students.assignedToYou": "طلاب الأقسام المكلَّفة إليك.",
  "students.record": "السجل",
  "students.studentAccount": "حساب الطالب",
};

const DICTS: Record<Locale, Dict> = { en, ar };

/**
 * Look up a key. Interpolates `{name}` style placeholders.
 * Falls back to English, then to the key itself — never throws, because a
 * missing translation must not take a page down.
 */
export function translate(
  locale: Locale,
  key: string,
  vars?: Record<string, string | number>,
): string {
  const raw = DICTS[locale][key] ?? DICTS.en[key] ?? key;
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (_, name) =>
    name in vars ? String(vars[name]) : `{${name}}`,
  );
}

/** Bound translator, so callers write `t("action.save")`. */
export type T = (key: string, vars?: Record<string, string | number>) => string;

export function translator(locale: Locale): T {
  return (key, vars) => translate(locale, key, vars);
}

/** Every key the interface uses. English is the source of truth. */
export function allKeys(): string[] {
  return Object.keys(en);
}

/** Keys present in English but missing in Arabic — used by the i18n test. */
export function missingKeys(locale: Locale): string[] {
  return Object.keys(en).filter((k) => !(k in DICTS[locale]));
}

/** Keys in a locale that no longer exist in English — dead entries. */
export function staleKeys(locale: Locale): string[] {
  return Object.keys(DICTS[locale]).filter((k) => !(k in en));
}
