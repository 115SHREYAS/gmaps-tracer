# syntax=docker/dockerfile:1

FROM node:22-alpine AS base
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /repo

FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY packages/db/package.json packages/db/
COPY packages/gmaps-client/package.json packages/gmaps-client/
RUN pnpm install --frozen-lockfile

FROM deps AS build
ARG NEXT_PUBLIC_MAP_STYLE=pmtiles
ARG NEXT_PUBLIC_MAP_CENTER_LAT=12.9716
ARG NEXT_PUBLIC_MAP_CENTER_LNG=77.5946
ARG NEXT_PUBLIC_MAP_ZOOM=11
ENV NEXT_TELEMETRY_DISABLED=1 \
    NEXT_OUTPUT_STANDALONE=1 \
    NEXT_PUBLIC_MAP_STYLE=$NEXT_PUBLIC_MAP_STYLE \
    NEXT_PUBLIC_MAP_CENTER_LAT=$NEXT_PUBLIC_MAP_CENTER_LAT \
    NEXT_PUBLIC_MAP_CENTER_LNG=$NEXT_PUBLIC_MAP_CENTER_LNG \
    NEXT_PUBLIC_MAP_ZOOM=$NEXT_PUBLIC_MAP_ZOOM
COPY . .
RUN pnpm --filter @app/web build

FROM node:22-alpine AS web
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    TILES_PATH=/tiles
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /repo/apps/web/public ./apps/web/public
EXPOSE 3000
CMD ["node", "apps/web/server.js"]

FROM node:22-alpine AS worker
WORKDIR /repo
ENV NODE_ENV=production
COPY --from=build /repo ./
CMD ["./apps/worker/node_modules/.bin/tsx", "apps/worker/src/index.ts"]
