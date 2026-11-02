# syntax=docker/dockerfile:1.7
# Image cho API và web (Gia Phả Cội Nguồn). Build từ thư mục gốc repo:
#   docker build -f infra/docker/Dockerfile --target api -t coinguon-api .
#   docker build -f infra/docker/Dockerfile --target web -t coinguon-web .
# Chạy được trên máy x86 lẫn ARM (Oracle Cloud Ampere) — build ngay trên máy đích.

FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1 CI=1
RUN corepack enable
WORKDIR /repo

# ── Build toàn bộ monorepo ──
FROM base AS build
# Web chuyển tiếp /api/v1 tới API; giá trị được "đóng" vào lúc build (KI-015)
ARG API_ORIGIN=http://api:4000
ENV API_ORIGIN=$API_ORIGIN
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm fetch
COPY . .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --offline --frozen-lockfile
RUN pnpm turbo run build --filter=@coinguon/api --filter=@coinguon/web
# Gói API cùng các package nội bộ (dist) và thư viện production
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm deploy --filter @coinguon/api --prod --legacy /out/api \
 && cp -r packages/db/prisma/migrations /out/api/migrations \
 && cp packages/db/scripts/migrate.mjs /out/api/migrate.mjs

# ── API (NestJS) — cũng dùng để chạy migration và dữ liệu mẫu ──
FROM node:22-bookworm-slim AS api
ENV NODE_ENV=production PORT=4000 MEDIA_DIR=/data/media
WORKDIR /app
COPY --from=build --chown=node:node /out/api ./
# Có sẵn một file trong thư mục: Docker chỉ chép nội dung + quyền sở hữu (node) sang volume mới khi thư mục không rỗng;
# thư mục rỗng thì volume thuộc root và API (chạy bằng user node) không ghi ảnh được
RUN mkdir -p /data/media && touch /data/media/.giu-cho && chown -R node:node /data/media
USER node
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:4000/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]

# ── Web (Next.js standalone) ──
FROM node:22-bookworm-slim AS web
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3000/dang-nhap').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/web/server.js"]
