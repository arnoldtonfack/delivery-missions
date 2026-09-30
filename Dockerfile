# syntax=docker/dockerfile:1.7
# ── Stage 1 : deps ───────────────────────────────────────────────────────────
FROM node:22-alpine AS deps
RUN corepack enable
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm config set store-dir /pnpm/store && \
    pnpm install --frozen-lockfile

# ── Stage 2 : build ──────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
RUN corepack enable
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN pnpm run prisma:generate
RUN pnpm run build

# ── Stage 3 : production ─────────────────────────────────────────────────────
FROM node:22-alpine AS production

RUN apk add --no-cache tini curl

WORKDIR /app

RUN addgroup -S nodejs && adduser -S nestjs -G nodejs

# node_modules complet : la CLI Prisma (devDependency) est nécessaire au
# `prisma migrate deploy` exécuté par le service `migrate` / l'entrypoint.
COPY --from=builder --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nestjs:nodejs /app/dist ./dist
COPY --from=builder --chown=nestjs:nodejs /app/generated ./generated
COPY --from=builder --chown=nestjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nestjs:nodejs /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder --chown=nestjs:nodejs /app/src/database/migrations ./src/database/migrations
COPY --from=builder --chown=nestjs:nodejs /app/package.json ./
COPY --chown=nestjs:nodejs docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

ENV NODE_ENV=production
ENV PORT=3000

USER nestjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS "http://localhost:${PORT}/health" || exit 1

ENTRYPOINT ["/sbin/tini", "--", "/usr/local/bin/entrypoint.sh"]
CMD ["node", "dist/src/main"]
