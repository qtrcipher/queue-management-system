FROM node:22-alpine

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.30.3 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/domain/package.json packages/domain/package.json
COPY packages/ui/package.json packages/ui/package.json

RUN pnpm install --frozen-lockfile

COPY apps/api apps/api
COPY packages/domain packages/domain
COPY packages/ui packages/ui

ENV DATABASE_URL=postgresql://qms:qms@postgres:5432/qms?schema=public
RUN pnpm db:generate && pnpm --filter @qms/domain build && pnpm --filter @qms/api build

EXPOSE 3000

CMD ["sh", "-c", "pnpm db:push && pnpm db:seed && pnpm --filter @qms/api start"]

