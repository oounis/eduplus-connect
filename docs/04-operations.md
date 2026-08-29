# 04 — Operations Runbook

> **Status: PLANNED.** These procedures are written against the configuration in
> `deploy/`. They have not been executed on real servers yet.

Everything here assumes the layout from [03 — Infrastructure](03-infrastructure.md).

---

## First deployment, from zero

### Phase 1 — Buy and record

1. Order the two VPS. Ubuntu 24.04 LTS on both.
2. **Write the real specifications into
   [03 — Infrastructure](03-infrastructure.md#the-servers)**, replacing every
   *(to confirm)*.
3. Record both public IPs. Set a strong root password; you will disable password
   login shortly.
4. Buy the domain. Point an `A` record at the **app** server's public IP.

### Phase 2 — Harden both servers

On each server, as root:

```bash
# Install your SSH key FIRST — the script refuses to disable password login
# without one, but do not rely on that.
ssh-copy-id root@<server-ip>          # from your laptop

git clone https://github.com/oounis/eduplus-connect.git /opt/eduplus/src
cd /opt/eduplus/src/deploy
chmod +x bootstrap-server.sh

# App server
sudo ./bootstrap-server.sh app 10.10.10.1
# Database server
sudo ./bootstrap-server.sh db  10.10.10.2
```

Read the script before running it. It patches, creates an `eduplus` admin user,
locks SSH to keys, sets a default-deny firewall, installs Docker with log
rotation, and applies kernel tuning for high connection counts.

### Phase 3 — The private network

On **both** servers:

```bash
umask 077
wg genkey | tee /etc/wireguard/private.key | wg pubkey > /etc/wireguard/public.key
cat /etc/wireguard/public.key      # exchange these
```

`/etc/wireguard/wg0.conf` on the **app** server:

```ini
[Interface]
Address    = 10.10.10.1/24
PrivateKey = <APP private key>
ListenPort = 51820

[Peer]                              # the database server
PublicKey  = <DB public key>
AllowedIPs = 10.10.10.2/32
Endpoint   = <DB public IP>:51820
PersistentKeepalive = 25
```

On the **database** server, mirror it (`10.10.10.2/24`, peer `10.10.10.1/32`,
endpoint = app server's public IP).

```bash
sudo systemctl enable --now wg-quick@wg0
ping -c3 10.10.10.2      # from the app server — must succeed before continuing
```

> **Do not continue until the ping works.** Every later step assumes the private
> network is up, and a database bound to an interface that does not exist fails
> in a confusing way.

### Phase 4 — The database server

```bash
cd /opt/eduplus/src/deploy/db
cp .env.example .env && chmod 600 .env
# Set WG_ADDR=10.10.10.2 and a real POSTGRES_PASSWORD:
openssl rand -base64 32

chmod +x backup.sh
docker compose up -d
docker compose ps                    # postgres + pgbouncer healthy
```

Confirm it is **not** reachable from outside:

```bash
# From your laptop — both must FAIL. If either succeeds, stop and fix ufw.
nc -zv <DB public IP> 5432
nc -zv <DB public IP> 6432
```

### Phase 5 — The application server

```bash
cd /opt/eduplus/src/deploy/app
cp .env.example .env && chmod 600 .env
```

Set in `.env`:

```bash
AUTH_SECRET=$(openssl rand -base64 48)     # MUST be fresh; the app refuses the example value
DATABASE_URL="postgresql://eduplus:<pw>@10.10.10.2:6432/eduplus?schema=public&pgbouncer=true&connection_limit=8&pool_timeout=20"
DIRECT_URL="postgresql://eduplus:<pw>@10.10.10.2:5432/eduplus?schema=public"
SERVER_NAME="eduplus.yourschool.com"
```

Get the certificate (nginx must be stopped, port 80 free):

```bash
docker run --rm -p 80:80 \
  -v $PWD/nginx/certs:/etc/letsencrypt \
  certbot/certbot certonly --standalone \
  -d eduplus.yourschool.com --agree-tos -m you@example.com --non-interactive
```

Substitute the hostname into the nginx config, apply migrations, then start:

```bash
sed -i "s/\${SERVER_NAME}/eduplus.yourschool.com/g" nginx/eduplus.conf

docker compose run --rm migrate      # prisma migrate deploy, via DIRECT_URL
docker compose up -d --build
docker compose ps
```

### Phase 6 — Create the school

```bash
docker compose run --rm \
  -e DATABASE_URL="$DIRECT_URL" \
  -e ADMIN_EMAIL="head@yourschool.com" \
  -e ADMIN_PASSWORD="<a long one>" \
  app1 npx tsx scripts/seed-production.ts
```

This creates the access-rights defaults, one administrator, the current academic
year, and a conventional seven-period school day. **No demo students** — the
school enters its own.

### Phase 7 — Prove it works

```bash
curl https://eduplus.yourschool.com/api/health     # {"status":"ok","database":"up"}
```

Then, in a browser: sign in as the administrator, create a class, import a few
students by CSV, assign a teacher, and take one period register. If those five
things work, the deployment is real.

---

## Routine operations

### Deploying a change

```bash
cd /opt/eduplus/src && git pull
cd deploy/app
docker compose run --rm migrate         # no-op when there are no new migrations
docker compose up -d --build
docker compose ps                       # all healthy?
curl -s https://eduplus.yourschool.com/api/health
```

Replicas restart one at a time; nginx keeps serving from the others, so a deploy
is not an outage.

### Rolling back

**Code** — redeploy the previous commit:

```bash
cd /opt/eduplus/src && git log --oneline -5
git checkout <previous-sha>
cd deploy/app && docker compose up -d --build
```

**A migration is a different matter.** Prisma has no automatic down-migration,
and inventing one under pressure is how data is lost. If a migration is the
problem: restore from the pre-deploy backup (below), then fix the migration
properly. This is why the backup is taken *before* a release, not only nightly.

### Backups

Automatic: nightly `pg_dump`, verified readable, checksummed, 14 daily copies
plus 8 weekly. Offsite via `rclone` when `RCLONE_REMOTE` is set.

```bash
cd /opt/eduplus/src/deploy/db
docker compose exec backup sh /usr/local/bin/backup.sh    # on demand
ls -lh backups/
docker compose logs backup | tail -20                     # did last night work?
```

> **Set `RCLONE_REMOTE`.** A backup on the same machine as the database survives
> a bad migration, not a lost server.

### Restoring

> Practise this **before** you need it. A backup that has never been restored is
> a rumour.

```bash
cd /opt/eduplus/src/deploy/db

# 1. Verify the file before trusting it
sha256sum -c backups/eduplus-<stamp>.dump.sha256

# 2. Stop the application so nothing writes mid-restore
ssh eduplus@<app-ip> 'cd /opt/eduplus/src/deploy/app && docker compose stop app1 app2 app3 app4'

# 3. Restore into a NEW database first — never straight over the live one
docker compose exec postgres createdb -U eduplus eduplus_restore
docker compose exec postgres pg_restore -U eduplus -d eduplus_restore \
  --no-owner --clean --if-exists /backups/eduplus-<stamp>.dump

# 4. Check it is sane before promoting
docker compose exec postgres psql -U eduplus -d eduplus_restore \
  -c 'SELECT count(*) FROM "Student"; SELECT max(date) FROM "Attendance";'

# 5. Promote
docker compose exec postgres psql -U eduplus -d postgres -c \
  'ALTER DATABASE "eduplus" RENAME TO "eduplus_old";
   ALTER DATABASE "eduplus_restore" RENAME TO "eduplus";'

# 6. Start the app, verify, and only then drop the old database
ssh eduplus@<app-ip> 'cd /opt/eduplus/src/deploy/app && docker compose start app1 app2 app3 app4'
curl -s https://eduplus.yourschool.com/api/health
```

Restoring into a new database and renaming means a failed restore leaves the
original untouched. Do not skip it to save two minutes.

### Watching it

```bash
curl -s https://eduplus.yourschool.com/api/health          # the one endpoint that matters
docker compose ps                                          # container health
docker compose logs -f --tail=100 nginx
docker stats --no-stream
```

Slow queries (logged above 500ms) and the top offenders:

```bash
docker compose exec postgres psql -U eduplus -d eduplus -c \
  "SELECT calls, round(mean_exec_time::numeric,1) AS avg_ms, round(total_exec_time::numeric) AS total_ms, left(query,90)
     FROM pg_stat_statements ORDER BY total_exec_time DESC LIMIT 15;"
```

Pooler saturation — `cl_waiting` above zero means requests are queuing for a
connection:

```bash
docker compose exec pgbouncer psql -h 127.0.0.1 -p 6432 -U eduplus pgbouncer -c 'SHOW POOLS;'
```

Point an external uptime monitor (UptimeRobot, Healthchecks.io) at
`/api/health`. Nobody watches a dashboard at 2am.

---

## Incident playbook

| Symptom | First check | Likely cause | Action |
|---|---|---|---|
| Site returns 502 | `docker compose ps` on app | All replicas unhealthy | `docker compose restart app1..4`; read logs |
| Health says `database: down` | `ping 10.10.10.2` | WireGuard down | `systemctl restart wg-quick@wg0` on both |
| `prepared statement "s0" already exists` | `DATABASE_URL` | `pgbouncer=true` missing | Add it, redeploy |
| Login rejected for everyone | App logs at startup | `AUTH_SECRET` changed | A changed secret invalidates every session — expected; users sign in again |
| Site slow, CPU low | `SHOW POOLS` | Pool exhausted | Raise `DEFAULT_POOL_SIZE`, or lower per-replica `connection_limit` |
| Site slow, CPU high | `docker stats` | Genuinely out of CPU | Add replicas if cores allow; otherwise upgrade the app VPS |
| Disk filling | `du -sh /var/lib/docker` | Log or backup growth | Log rotation is configured; check `deploy/db/backups` retention |
| Wrong period shows as live | `date` on the app server | Clock drift, or wrong `SCHOOL_TIMEZONE` | `systemctl status chrony`; verify the env var |
| Certificate expired | `docker compose logs certbot` | Renewal failing | Renew manually; check port 80 is reachable |

### The clock deserves its own line

The entire attendance-by-period feature depends on the server knowing what time
it is. `chrony` is installed by the bootstrap script for exactly this reason. If
teachers report that the wrong period is open, check the clock before the code.

---

## Routine calendar

| When | What |
|---|---|
| Daily | Automatic backup runs; uptime monitor watches health |
| Weekly | Skim `docker compose logs` on both servers; check backup log |
| Monthly | `apt update && apt upgrade` (security patches apply themselves); review `pg_stat_statements`; check disk |
| **Quarterly** | **Restore rehearsal** — restore last night's dump into a scratch database and confirm the row counts |
| Yearly | Rotate `AUTH_SECRET` and the database password; review who still has an account |
