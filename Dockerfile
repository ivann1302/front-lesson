# syntax=docker/dockerfile:1

ARG NODE_IMAGE=node:22-bookworm-slim

FROM ${NODE_IMAGE} AS workspace

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

WORKDIR /workspace

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/bot/package.json apps/bot/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/content/package.json packages/content/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN pnpm install --frozen-lockfile

COPY apps ./apps
COPY packages ./packages

FROM workspace AS api-build

RUN pnpm --filter @mentor/api... build \
  && pnpm --filter @mentor/api deploy --prod /opt/api

FROM ${NODE_IMAGE} AS api

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

WORKDIR /app

COPY --from=api-build --chown=node:node /opt/api ./
RUN mkdir -p /data /backups && chown node:node /data /backups

USER node

EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=15s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]

CMD ["node", "dist/server.js"]

FROM workspace AS bot-build

RUN pnpm --filter @mentor/bot... build \
  && pnpm --filter @mentor/bot deploy --prod /opt/bot

FROM ${NODE_IMAGE} AS bot

ENV NODE_ENV=production
ENV BOT_HOST=0.0.0.0
ENV BOT_PORT=3001

WORKDIR /app

COPY --from=bot-build --chown=node:node /opt/bot ./

USER node

EXPOSE 3001

HEALTHCHECK --interval=15s --timeout=5s --start-period=15s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3001/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]

CMD ["node", "dist/index.js"]

FROM workspace AS web-build

ARG VITE_TELEGRAM_BOT_USERNAME=
ENV VITE_TELEGRAM_BOT_USERNAME=$VITE_TELEGRAM_BOT_USERNAME
ENV VITE_API_URL=/api

RUN pnpm --filter @mentor/web... build

FROM nginx:1.30.4-alpine AS web

COPY apps/web/nginx.conf /etc/nginx/nginx.conf
COPY --from=web-build --chown=nginx:nginx /workspace/apps/web/dist /usr/share/nginx/html

USER nginx

EXPOSE 8080

HEALTHCHECK --interval=15s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/health | grep -q '"status":"ok"' || exit 1

ENTRYPOINT []
CMD ["nginx", "-g", "daemon off;"]

FROM ${NODE_IMAGE} AS smoke

ENV NODE_ENV=production

WORKDIR /smoke

COPY --chown=node:node scripts/production-smoke.mjs ./production-smoke.mjs

USER node

CMD ["node", "production-smoke.mjs"]
