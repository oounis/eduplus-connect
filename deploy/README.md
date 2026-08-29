# deploy/ — production configuration

Everything needed to run EduPlus Connect on two servers.

> **None of this has been executed against real hardware yet.** It is written,
> commented and reviewed, but the servers do not exist at the time of writing.
> See [../docs/06-status.md](../docs/06-status.md).

## Layout

```
deploy/
├── bootstrap-server.sh        harden a fresh Ubuntu 24.04 box (run first, on both)
├── app/                       SERVER 1 — application tier
│   ├── docker-compose.yml       nginx + 4 Next.js replicas + certbot + migrate
│   ├── .env.example             copy to .env, chmod 600
│   └── nginx/eduplus.conf       TLS, rate limiting, load balancing, static caching
└── db/                        SERVER 2 — data tier
    ├── docker-compose.yml       postgres + pgbouncer + nightly backup
    ├── .env.example             copy to .env, chmod 600
    ├── postgresql.conf          tuning, every value deliberate
    └── backup.sh                dump, verify, checksum, rotate, offsite
```

## The short version

```bash
# On BOTH servers, as root, after installing your SSH key:
sudo ./bootstrap-server.sh app 10.10.10.1     # app server
sudo ./bootstrap-server.sh db  10.10.10.2     # database server

# Configure WireGuard on both, then confirm:
ping -c3 10.10.10.2

# Database server:
cd deploy/db && cp .env.example .env && chmod 600 .env   # set WG_ADDR + password
docker compose up -d

# App server:
cd deploy/app && cp .env.example .env && chmod 600 .env  # set URLs + AUTH_SECRET
docker compose run --rm migrate
docker compose up -d --build
```

**Full step-by-step, including certificates and the first administrator:**
[../docs/04-operations.md](../docs/04-operations.md).

## Three things that are easy to get wrong

**1. `pgbouncer=true` in `DATABASE_URL`.** Transaction pooling cannot support
named prepared statements. Without this flag you get
`prepared statement "s0" already exists` — intermittently, only under load.

**2. `WG_ADDR` must be the private address.** The database compose file binds
Postgres and pgBouncer to it. Setting it to `0.0.0.0` publishes the school's
database to the internet. Verify from outside:

```bash
nc -zv <db-public-ip> 5432    # MUST fail
```

**3. `AUTH_SECRET` must be freshly generated.** The app refuses to start in
production with the example value or anything under 32 characters — but generate
it properly rather than relying on that:

```bash
openssl rand -base64 48
```

## Verifying a deployment

```bash
curl https://<domain>/api/health      # {"status":"ok","database":"up"}
docker compose ps                     # every container healthy
nc -zv <db-public-ip> 5432            # must FAIL
```
