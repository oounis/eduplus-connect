# EduPlus Connect — Documentation

Everything about what this product is, how it is built, and how it goes live.

| # | Document | Answers |
|---|---|---|
| 01 | [The product](01-product.md) | What EduPlus Connect is, who uses it, and what every feature does |
| 02 | [Application architecture](02-architecture.md) | How the code is organised, the data model, and the security model |
| 03 | [Infrastructure](03-infrastructure.md) | The two servers, the private network, and the deployment topology |
| 04 | [Operations runbook](04-operations.md) | Deploying, backing up, restoring, monitoring, and what to do at 3am |
| 05 | [Capacity and performance](05-capacity.md) | What the load target actually means and whether this design meets it |
| 06 | [Status and roadmap](06-status.md) | **What is done, what is not, and in what order it happens** |

Start with [06 — Status and roadmap](06-status.md) for the honest picture of
where the project stands today.

---

## The one-paragraph version

EduPlus Connect is a school management system: roles and access rights, a daily
attendance register, a second register taken period by period, dated
observations on students, staff tasks, exportable reports, and a complete audit
trail. It is a Next.js 15 application on PostgreSQL 16, in Arabic and English
with full right-to-left support. It is being moved off a suspended free hosting
tier onto two self-managed servers: one running the application behind nginx,
one running the database, joined by a private encrypted network with nothing
but ports 80 and 443 exposed to the internet.

## Conventions used in these documents

- **Confirmed** — verified by running it. Test output or a command is quoted.
- **Planned** — designed and written down, not yet executed against real hardware.
- **Assumption** — taken on trust; the document says who must confirm it and when.

Nothing in here is described as working unless it has been run. Where a number
is an estimate, it is labelled as one and the reasoning is shown.
