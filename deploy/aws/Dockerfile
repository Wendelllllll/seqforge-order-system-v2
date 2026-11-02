# syntax=docker/dockerfile:1
# Build on Linux; never copy Windows node_modules or a local .next directory.
FROM node:22-bookworm-slim@sha256:4b150b48b4116e2a22f2c39cc27025fbf4f153e2078fd3b14d159fdb5c7279da AS base
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates openssl \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS build
COPY package.json package-lock.json ./
RUN npm ci --include=dev
COPY next.config.ts postcss.config.mjs tsconfig.json prisma.config.ts ./
COPY prisma/schema.prisma ./prisma/schema.prisma
COPY prisma/migrations ./prisma/migrations
COPY src ./src
COPY public ./public
COPY scripts/seed-dropboxes.ts scripts/internal-mail.ts scripts/initialize-pricing-catalog.ts ./scripts/
# Parsing config/generating Prisma requires a URL. These are inert build values,
# not deployment credentials. Building must not require the real database.
RUN DATABASE_URL='postgresql://build:build@127.0.0.1:1/build?connect_timeout=1' \
    npm run db:generate
RUN DATABASE_URL='postgresql://build:build@127.0.0.1:1/build?connect_timeout=1' \
    BETTER_AUTH_SECRET='build-only-placeholder-never-use-at-runtime-00000000' \
    BETTER_AUTH_URL='https://seqforgebio.com' \
    INTERNAL_MAIL_MODE=off CUSTOMER_MAIL_MODE=off \
    npm run build

FROM base AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    RESULT_STORAGE_PATH=/var/lib/seqforge/results \
    SHOW_DEMO_ACCOUNTS=false
# Keep the locked Linux dependencies: Prisma CLI/tsx are needed for explicit
# migrations and the existing administrative CLI. No seed/demo data is copied.
COPY --from=build --chown=node:node /app /app
RUN mkdir -p /var/lib/seqforge/results && chown node:node /var/lib/seqforge/results
USER node
EXPOSE 3000
CMD ["node", "node_modules/next/dist/bin/next", "start", "--hostname", "0.0.0.0", "--port", "3000"]
