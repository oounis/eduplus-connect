/**
 * Seeds a demo school: one current academic year with three terms, six
 * classes, ~90 students, one account per role, class assignments, today's
 * attendance and a week of observations.
 *
 * Safe to re-run: it clears the operational tables first.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import {
  DEFAULT_ROLE_ACCESS,
  MODULES,
  OBSERVATION_CATEGORIES,
  ROLES,
  type Role,
} from "../src/lib/constants";

const prisma = new PrismaClient();
const PASSWORD = process.env.SEED_PASSWORD ?? "Passw0rd!";

// Deterministic pseudo-random so re-seeding gives comparable numbers.
let seedState = 42;
function rand(): number {
  seedState = (seedState * 1103515245 + 12345) % 2147483648;
  return seedState / 2147483648;
}
function pick<T>(items: readonly T[]): T {
  return items[Math.floor(rand() * items.length)];
}

function dayKey(offsetDays = 0): Date {
  const now = new Date();
  const d = new Date(
    Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0),
  );
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d;
}

function mondayOfThisWeek(): Date {
  const d = dayKey();
  const day = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() - (day === 0 ? 6 : day - 1));
  return d;
}

const FIRST_NAMES = [
  "Amine", "Sarra", "Youssef", "Nour", "Mehdi", "Rania", "Karim", "Ines",
  "Omar", "Farah", "Bilel", "Salma", "Hatem", "Maryam", "Zied", "Aya",
  "Skander", "Emna", "Rami", "Lina", "Anis", "Dorra", "Wassim", "Hiba",
  "Nizar", "Yasmine", "Firas", "Chaima", "Malek", "Rim",
];
const LAST_NAMES = [
  "Ben Salah", "Trabelsi", "Gharbi", "Mansouri", "Bouazizi", "Jelassi",
  "Khemiri", "Chaabane", "Ayari", "Hamdi", "Belhadj", "Zouari", "Sassi",
  "Mejri", "Ferchichi", "Ouni", "Dridi", "Karray",
];

const OBSERVATION_NOTES: Record<string, string[]> = {
  BEHAVIOR: [
    "Helped a classmate settle after a disagreement.",
    "Interrupted the lesson twice; spoken to at the end of class.",
    "Very calm and cooperative throughout the session.",
    "Left the classroom without permission during the second period.",
  ],
  PARTICIPATION: [
    "Answered several questions and led the group activity.",
    "Stayed quiet for most of the lesson despite prompting.",
    "Volunteered to present the group's findings to the class.",
    "Engaged well in the practical part of the lesson.",
  ],
  HOMEWORK: [
    "Homework complete and neatly presented.",
    "Homework not submitted for the second time this week.",
    "Submitted late but the work is of good quality.",
    "Partial homework — only the first exercise was attempted.",
  ],
  ACADEMIC: [
    "Strong grasp of the new material; ready for extension work.",
    "Struggling with the current chapter, needs revision support.",
    "Marked improvement since last week's assessment.",
    "Needs help with written expression in longer answers.",
  ],
  OTHER: [
    "Arrived without the required materials.",
    "Reported feeling unwell; sent to the school nurse.",
    "Represented the class at the science fair rehearsal.",
    "Parent note received about an early pick-up.",
  ],
};

async function main() {
  console.log("Seeding EduPlus Connect…");

  // ---- reset (order matters: children first) -----------------------------
  await prisma.attendance.deleteMany();
  await prisma.observation.deleteMany();
  await prisma.task.deleteMany();
  await prisma.classSupervisor.deleteMany();
  await prisma.classTeacher.deleteMany();
  await prisma.student.deleteMany();
  await prisma.class.deleteMany();
  await prisma.term.deleteMany();
  await prisma.academicYear.deleteMany();
  await prisma.auditEvent.deleteMany();
  await prisma.userModuleAccess.deleteMany();
  await prisma.roleModuleAccess.deleteMany();
  await prisma.user.deleteMany();

  // ---- module access defaults -------------------------------------------
  for (const role of ROLES) {
    for (const moduleKey of MODULES) {
      const grant = DEFAULT_ROLE_ACCESS[role][moduleKey];
      await prisma.roleModuleAccess.create({
        data: {
          role,
          module: moduleKey,
          canView: grant?.view ?? false,
          canEdit: grant?.edit ?? false,
        },
      });
    }
  }
  console.log(`  module access: ${ROLES.length * MODULES.length} grants`);

  // ---- users -------------------------------------------------------------
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const makeUser = (
    email: string,
    firstName: string,
    lastName: string,
    role: Role,
  ) =>
    prisma.user.create({
      data: { email, firstName, lastName, role, passwordHash },
    });

  const admin = await makeUser("admin@eduplus.school", "Leila", "Ben Amor", "ADMIN");
  const deputy = await makeUser("deputy@eduplus.school", "Hichem", "Nasri", "DEPUTY");

  const staff = [
    await makeUser("staff@eduplus.school", "Amal", "Riahi", "STAFF"),
    await makeUser("staff2@eduplus.school", "Slim", "Baccouche", "STAFF"),
  ];

  const supervisors = [
    await makeUser("supervisor@eduplus.school", "Nabil", "Cherif", "SUPERVISOR"),
    await makeUser("supervisor2@eduplus.school", "Sonia", "Lakhdar", "SUPERVISOR"),
  ];

  const teachers = [
    await makeUser("teacher@eduplus.school", "Meriem", "Haddad", "TEACHER"),
    await makeUser("teacher2@eduplus.school", "Tarek", "Msakni", "TEACHER"),
    await makeUser("teacher3@eduplus.school", "Ilhem", "Guesmi", "TEACHER"),
  ];

  const parents = [
    await makeUser("parent@eduplus.school", "Sami", "Bouzid", "PARENT"),
    await makeUser("parent2@eduplus.school", "Hela", "Tounsi", "PARENT"),
  ];
  console.log("  users: 1 admin, 1 deputy, 2 staff, 2 supervisors, 3 teachers, 2 parents");

  // ---- academic year + terms --------------------------------------------
  const yearStart = new Date(Date.UTC(new Date().getFullYear(), 8, 15));
  const year = await prisma.academicYear.create({
    data: {
      name: `${yearStart.getUTCFullYear()}-${yearStart.getUTCFullYear() + 1}`,
      startDate: yearStart,
      endDate: new Date(Date.UTC(yearStart.getUTCFullYear() + 1, 5, 30)),
      isCurrent: true,
      terms: {
        create: [
          {
            name: "Term 1",
            startDate: yearStart,
            endDate: new Date(Date.UTC(yearStart.getUTCFullYear(), 11, 20)),
          },
          {
            name: "Term 2",
            startDate: new Date(Date.UTC(yearStart.getUTCFullYear() + 1, 0, 5)),
            endDate: new Date(Date.UTC(yearStart.getUTCFullYear() + 1, 2, 25)),
          },
          {
            name: "Term 3",
            startDate: new Date(Date.UTC(yearStart.getUTCFullYear() + 1, 3, 5)),
            endDate: new Date(Date.UTC(yearStart.getUTCFullYear() + 1, 5, 30)),
          },
        ],
      },
    },
  });

  // A closed previous year, so the year switcher has something to show.
  await prisma.academicYear.create({
    data: {
      name: `${yearStart.getUTCFullYear() - 1}-${yearStart.getUTCFullYear()}`,
      startDate: new Date(Date.UTC(yearStart.getUTCFullYear() - 1, 8, 15)),
      endDate: new Date(Date.UTC(yearStart.getUTCFullYear(), 5, 30)),
      isCurrent: false,
    },
  });
  console.log(`  academic year ${year.name} with 3 terms`);

  // ---- classes -----------------------------------------------------------
  const classDefs = [
    { name: "Grade 4 - A", level: "Grade 4", room: "A101" },
    { name: "Grade 4 - B", level: "Grade 4", room: "A102" },
    { name: "Grade 5 - A", level: "Grade 5", room: "B201" },
    { name: "Grade 5 - B", level: "Grade 5", room: "B202" },
    { name: "Grade 6 - A", level: "Grade 6", room: "C301" },
    { name: "Grade 6 - B", level: "Grade 6", room: "C302" },
  ];
  const classes = [];
  for (const def of classDefs) {
    classes.push(
      await prisma.class.create({
        data: { ...def, capacity: 30, academicYearId: year.id },
      }),
    );
  }
  console.log(`  classes: ${classes.length}`);

  // ---- students ----------------------------------------------------------
  let studentCounter = 1;
  const students = [];
  for (const klass of classes) {
    const size = 13 + Math.floor(rand() * 4); // 13–16 per class
    for (let i = 0; i < size; i++) {
      const firstName = pick(FIRST_NAMES);
      const lastName = pick(LAST_NAMES);
      students.push(
        await prisma.student.create({
          data: {
            code: `STU-${String(studentCounter++).padStart(4, "0")}`,
            firstName,
            lastName,
            classId: klass.id,
            dateOfBirth: new Date(
              Date.UTC(2013 + Math.floor(rand() * 3), Math.floor(rand() * 12), 1 + Math.floor(rand() * 27)),
            ),
          },
        }),
      );
    }
  }
  console.log(`  students: ${students.length}`);

  // Give the two parent accounts real children, and one student a login.
  await prisma.student.update({
    where: { id: students[0].id },
    data: { parentId: parents[0].id },
  });
  await prisma.student.update({
    where: { id: students[1].id },
    data: { parentId: parents[0].id },
  });
  await prisma.student.update({
    where: { id: students[20].id },
    data: { parentId: parents[1].id },
  });

  const studentUser = await makeUser(
    "student@eduplus.school",
    students[0].firstName,
    students[0].lastName,
    "STUDENT",
  );
  await prisma.student.update({
    where: { id: students[0].id },
    data: { userId: studentUser.id },
  });

  // ---- assignments -------------------------------------------------------
  // Admin assigns many classes to each supervisor: 3 classes each.
  for (const [index, klass] of classes.entries()) {
    await prisma.classSupervisor.create({
      data: {
        classId: klass.id,
        userId: supervisors[index < 3 ? 0 : 1].id,
      },
    });
  }
  // Admin assigns many classes to each teacher: every teacher covers 4 classes.
  const subjects = ["Mathematics", "Science", "Languages"];
  for (const [tIndex, teacher] of teachers.entries()) {
    for (let offset = 0; offset < 4; offset++) {
      const klass = classes[(tIndex * 2 + offset) % classes.length];
      await prisma.classTeacher.upsert({
        where: { classId_userId: { classId: klass.id, userId: teacher.id } },
        update: {},
        create: {
          classId: klass.id,
          userId: teacher.id,
          subject: subjects[tIndex],
        },
      });
    }
  }
  console.log("  assignments: supervisors and teachers linked to classes");

  // ---- attendance: today + the previous 4 school days --------------------
  let attendanceRows = 0;
  for (let back = 0; back <= 4; back++) {
    const date = dayKey(-back);
    const weekday = date.getUTCDay();
    if (weekday === 0 || weekday === 6) continue; // no weekend register

    for (const klass of classes) {
      const supervisorLink = await prisma.classSupervisor.findFirst({
        where: { classId: klass.id },
      });
      if (!supervisorLink) continue;

      const classStudents = students.filter((s) => s.classId === klass.id);
      // Today's register is deliberately left blank for the last class so the
      // dashboard shows a "not taken yet" state.
      if (back === 0 && klass.id === classes[classes.length - 1].id) continue;

      for (const student of classStudents) {
        const roll = rand();
        const status =
          roll > 0.14
            ? "PRESENT"
            : roll > 0.07
              ? "ABSENT"
              : roll > 0.03
                ? "LATE"
                : "EXCUSED";
        await prisma.attendance.create({
          data: {
            date,
            status,
            studentId: student.id,
            classId: klass.id,
            recordedById: supervisorLink.userId,
            note:
              status === "EXCUSED" ? "Medical certificate provided." : null,
          },
        });
        attendanceRows++;
      }
    }
  }
  console.log(`  attendance: ${attendanceRows} records over the last 5 days`);

  // ---- observations: across the current week -----------------------------
  const monday = mondayOfThisWeek();
  const todayKey = dayKey();
  let observationRows = 0;
  for (let offset = 0; offset < 7; offset++) {
    const date = new Date(monday);
    date.setUTCDate(date.getUTCDate() + offset);
    if (date > todayKey) break;
    if (date.getUTCDay() === 0 || date.getUTCDay() === 6) continue;

    for (const klass of classes) {
      const teacherLinks = await prisma.classTeacher.findMany({
        where: { classId: klass.id },
      });
      if (teacherLinks.length === 0) continue;
      const classStudents = students.filter((s) => s.classId === klass.id);

      const count = 2 + Math.floor(rand() * 4); // 2–5 observations per class/day
      for (let i = 0; i < count; i++) {
        const student = pick(classStudents);
        const category = pick(OBSERVATION_CATEGORIES);
        const sentimentRoll = rand();
        const sentiment =
          sentimentRoll > 0.55
            ? "POSITIVE"
            : sentimentRoll > 0.25
              ? "NEUTRAL"
              : "CONCERN";
        await prisma.observation.create({
          data: {
            date,
            category,
            sentiment,
            note: pick(OBSERVATION_NOTES[category]),
            studentId: student.id,
            classId: klass.id,
            authorId: pick(teacherLinks).userId,
          },
        });
        observationRows++;
      }
    }
  }
  console.log(`  observations: ${observationRows} entries this week`);

  // ---- staff tasks from the deputy ---------------------------------------
  const taskDefs = [
    {
      title: "Prepare the weekly attendance report",
      description: "Consolidate all six classes and email it to the principal.",
      priority: "HIGH",
      status: "IN_PROGRESS",
      dueOffset: 1,
      assigneeId: staff[0].id,
    },
    {
      title: "Call parents of students absent 3+ days",
      description: "Use the absence list from the dashboard.",
      priority: "HIGH",
      status: "TODO",
      dueOffset: 0,
      assigneeId: staff[0].id,
    },
    {
      title: "Update classroom allocation for Grade 6",
      description: "Room C302 is unavailable next week.",
      priority: "MEDIUM",
      status: "TODO",
      dueOffset: 4,
      assigneeId: staff[1].id,
    },
    {
      title: "Archive last year's student files",
      priority: "LOW",
      status: "DONE",
      dueOffset: -2,
      assigneeId: staff[1].id,
    },
    {
      title: "Collect teacher observation notes for the term review",
      priority: "MEDIUM",
      status: "TODO",
      dueOffset: 7,
      assigneeId: staff[0].id,
    },
  ];
  for (const def of taskDefs) {
    const { dueOffset, ...rest } = def;
    await prisma.task.create({
      data: { ...rest, dueDate: dayKey(dueOffset), createdById: deputy.id },
    });
  }
  console.log(`  tasks: ${taskDefs.length}`);

  console.log(`\nDone. Every account uses the password: ${PASSWORD}`);
  console.log("  admin@eduplus.school       (ADMIN)");
  console.log("  deputy@eduplus.school      (DEPUTY)");
  console.log("  staff@eduplus.school       (STAFF)");
  console.log("  supervisor@eduplus.school  (SUPERVISOR)");
  console.log("  teacher@eduplus.school     (TEACHER)");
  console.log("  parent@eduplus.school      (PARENT)");
  console.log("  student@eduplus.school     (STUDENT)");
  console.log(`  (admin id ${admin.id})`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
