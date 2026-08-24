import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getCurrentYear, getVisibleClassIds } from "@/lib/queries";
import { buildWorkbook, fileName, XLSX_CONTENT_TYPE } from "@/lib/xlsx";
import { toISODate } from "@/lib/dates";

/**
 * Excel list of the students the signed-in user is responsible for.
 *
 * For a supervisor that is exactly the classes assigned to them — the scope
 * comes from `getVisibleClassIds`, the same helper the pages use, so an export
 * can never reach a class they are not allowed to see. Admin/deputy/staff get
 * the whole school.
 *
 * `?classId=` narrows to one class when the students page is filtered.
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Not signed in", { status: 401 });
  if (!user.access.students?.view) {
    return new NextResponse("Not allowed", { status: 403 });
  }

  const visible = await getVisibleClassIds(user);
  const requestedClassId = request.nextUrl.searchParams.get("classId") ?? "";

  // Build the class filter. An unassigned supervisor exports an empty sheet
  // rather than the entire school.
  let classFilter: { classId?: string | { in: string[] } } = {};
  if (visible === "ALL") {
    if (requestedClassId) classFilter = { classId: requestedClassId };
  } else {
    const allowed = requestedClassId
      ? visible.filter((id) => id === requestedClassId)
      : visible;
    classFilter = { classId: { in: allowed } };
  }

  const students = await prisma.student.findMany({
    where: { ...classFilter },
    orderBy: [{ class: { name: "asc" } }, { lastName: "asc" }, { firstName: "asc" }],
    select: {
      code: true,
      firstName: true,
      lastName: true,
      dateOfBirth: true,
      isActive: true,
      email: true,
      phone: true,
      phone2: true,
      phone3: true,
      class: { select: { name: true, level: true } },
      parent: { select: { firstName: true, lastName: true, phone: true } },
    },
  });

  const year = await getCurrentYear();
  const scopeLabel =
    visible === "ALL"
      ? requestedClassId
        ? (students[0]?.class?.name ?? "Selected class")
        : "All classes"
      : `Classes assigned to ${user.name}`;

  const buffer = await buildWorkbook(
    [
      {
        name: "Students",
        caption: `${scopeLabel}${year ? ` — ${year.name}` : ""} · ${students.length} student(s) · exported ${toISODate(new Date())}`,
        columns: [
          { header: "Code", key: "code", width: 12 },
          { header: "Last name", key: "lastName", width: 18 },
          { header: "First name", key: "firstName", width: 18 },
          { header: "Class", key: "className", width: 16 },
          { header: "Level", key: "level", width: 12 },
          { header: "Date of birth", key: "dob", width: 14 },
          { header: "Status", key: "status", width: 10 },
          { header: "Email", key: "email", width: 28 },
          { header: "Phone", key: "phone", width: 18 },
          { header: "Phone 2", key: "phone2", width: 18 },
          { header: "Phone 3", key: "phone3", width: 18 },
          { header: "Parent", key: "parent", width: 22 },
          { header: "Parent phone", key: "parentPhone", width: 18 },
        ],
        rows: students.map((s) => ({
          code: s.code,
          lastName: s.lastName,
          firstName: s.firstName,
          className: s.class?.name ?? "",
          level: s.class?.level ?? "",
          dob: s.dateOfBirth ? toISODate(s.dateOfBirth) : "",
          status: s.isActive ? "Active" : "Inactive",
          email: s.email ?? "",
          phone: s.phone ?? "",
          phone2: s.phone2 ?? "",
          phone3: s.phone3 ?? "",
          parent: s.parent ? `${s.parent.firstName} ${s.parent.lastName}` : "",
          parentPhone: s.parent?.phone ?? "",
        })),
      },
    ],
    { title: "EduPlus Connect — students" },
  );

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": XLSX_CONTENT_TYPE,
      "Content-Disposition": `attachment; filename="${fileName(["eduplus", "students", toISODate(new Date())])}"`,
      "Cache-Control": "no-store",
    },
  });
}
