FROM node:22-alpine AS builder

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.30.3 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/domain/package.json packages/domain/package.json
COPY packages/ui/package.json packages/ui/package.json

RUN pnpm install --frozen-lockfile --filter @qms/web --filter @qms/domain --filter @qms/ui

COPY apps/web apps/web
COPY packages/domain packages/domain
COPY packages/ui packages/ui

ARG VITE_API_BASE=http://localhost:3000
ENV VITE_API_BASE=$VITE_API_BASE

RUN pnpm --filter @qms/domain build && pnpm --filter @qms/ui build && pnpm --filter @qms/web build

FROM nginx:1.27-alpine

ENV QMS_API_CONNECT_SRC="'self' http://localhost:3000 ws://localhost:3000"

COPY apps/web/nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=6 CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1
