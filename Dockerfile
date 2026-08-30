# syntax=docker/dockerfile:1
#
# EduPlus Connect — production image.
#
# Multi-stage on purpose: the build needs devDependencies, the Prisma CLI and
# the whole source tree; the thing that runs in production needs none of that.
# Only .next/standalone and the Prisma runtime are carried into the final
# stage, which is the difference between a ~200 MB image and a ~1.5 GB one —
# and it means a compiler and a package manager are not sitting on the server
# waiting to be useful to somebody else.

# ---------------------------------------------------------------------------
# 1. deps — install once, cached until package-lock.json changes
# ---------------------------------------------------------------------------
FROM node:22-alpine AS deps
WORKDIR /app

# Prisma's engines are glibc-linked; on Alpine they need libc6-compat.
RUN apk add --no-cache libc6-compat

COPY package.json package-lock.json ./
COPY prisma ./prisma
# `npm ci` runs prisma generate through the postinstall hook, so the schema has
# to be present before this line.
RUN npm ci

# ---------------------------------------------------------------------------
# 2. build — compile the app
# ---------------------------------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app
RUN apk add --no-cache libc6-compat

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Next inlines NEXT_PUBLIC_* at build time. Nothing here is a secret: the real
# DATABASE_URL and AUTH_SECRET are read at runtime, never baked into the image.
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

RUN npx prisma generate && npm run build

# ---------------------------------------------------------------------------
# 3. runtime — what actually ships
# ---------------------------------------------------------------------------
FROM node:22-alpine AS runtime
WORKDIR /app

RUN apk add --no-cache libc6-compat tini

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3100
ENV HOSTNAME=0.0.0.0

# Run as an unprivileged user. If the app is ever exploited, it should not be
# root inside the container.
RUN addgroup -g 1001 -S nodejs && adduser -u 1001 -S nextjs -G nodejs

# The standalone server, plus the assets it does not inline.
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=build --chown=nextjs:nodejs /app/public ./public

# Migrations and the Prisma CLI, so the container can run `migrate deploy`
# against the database on release without a second image.
COPY --from=build --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=build --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=build --chown=nextjs:nodejs /app/node_modules/prisma ./node_modules/prisma
# The package alone is not enough: `npx prisma` resolves through
# node_modules/.bin, and without this symlink the release migration fails
# with "sh: prisma: not found" — after the image has already built.
COPY --from=build --chown=nextjs:nodejs /app/node_modules/.bin/prisma ./node_modules/.bin/prisma

USER nextjs
EXPOSE 3100

# Node is PID 1 without tini, which means it never reaps zombies and ignores
# SIGTERM's usual semantics; tini makes `docker stop` a clean shutdown.
ENTRYPOINT ["/sbin/tini", "--"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3100/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
