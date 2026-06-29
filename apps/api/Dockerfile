FROM node:22-alpine

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.30.3 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/domain/package.json packages/domain/package.json
COPY packages/ui/package.json packages/ui/package.json

RUN pnpm install --frozen-lockfile --filter @qms/api --filter @qms/domain --filter @qms/ui

COPY apps/api apps/api
COPY packages/domain packages/domain
COPY packages/ui packages/ui

ENV DATABASE_URL=postgresql://qms:qms@postgres:5432/qms?schema=public
RUN pnpm db:generate && pnpm --filter @qms/domain build && pnpm --filter @qms/api build

EXPOSE 3000

HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=10 CMD node -e "fetch('http://127.0.0.1:3000/health').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["sh", "-c", "if [ \"$QMS_AUTO_DB_SYNC\" = \"true\" ]; then pnpm db:push && pnpm db:seed; fi; pnpm --filter @qms/api start"]
