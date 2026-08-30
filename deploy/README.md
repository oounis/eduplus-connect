# Deploying EduPlus Connect

EduPlus runs on **kogia-prod-01** (`13.140.153.6`) at
**https://eduplus.kogiagroup.com**, as one tenant of the shared KogiaGroup
platform — not as the only thing on the box.

## What this app owns, and what it does not

| | Owned by | Where |
|---|---|---|
| TLS certificate, routing, rate limiting | **platform** | `/opt/kogia/platform/traefik` |
| PostgreSQL cluster, tuning, backups | **platform** | `/opt/kogia/platform/postgres` |
| App image, replicas, migrations | **this repo** | `deploy/docker-compose.yml` |
| Database `eduplus_db`, role `eduplus_app`, secrets | provisioned once | `/opt/kogia/apps/eduplus/.env` |

`eduplus_app` can connect to `eduplus_db` and to no other database on the
cluster. That is enforced in Postgres, not by convention.

## Layout on the server

```
/opt/kogia/apps/eduplus/
├── .env          generated secrets, mode 600, never in git
└── src/          this repository (read-only deploy key)
```

## Deploy

```bash
ssh -i ~/.ssh/kogia_prod kogia@13.140.153.6
/opt/kogia/apps/eduplus/src/deploy/deploy.sh
```

Fetch → build → migrate → roll the four replicas one at a time → verify over
HTTPS. Migrations run **before** any new replica serves traffic, so a failed
migration leaves the previous version up rather than a new binary on a
half-migrated database.

## Operate

```bash
cd /opt/kogia/apps/eduplus
C="docker compose -f src/deploy/docker-compose.yml --env-file .env --project-directory src"

$C ps                       # what is running
$C logs -f app1             # follow one replica
$C restart app1             # bounce one replica; the other three serve
/opt/kogia/platform/bin/kogia-psql.sh eduplus_db   # psql, no password to type
```

## `deploy/_two-server-later/`

The original two-server design (app tier + data tier over WireGuard, nginx +
certbot, its own Postgres). Kept because it is where this goes when the
second VPS arrives — the app containers move there almost unchanged, while
Postgres stays single-writer on kogia-prod-01. It is **not** what runs today
and its `postgresql.conf` is sized for a 24 GB host.
