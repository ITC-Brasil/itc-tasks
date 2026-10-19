FROM node:24.22.0-alpine@sha256:44fce696f38ba8c987c4db89954051000bbd05ffd8d8659ba15ed4a8602e937f AS deps
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci

FROM deps AS builder
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1 SKIP_ENV_VALIDATION=1
RUN npm run build && npm run worker:build && npm run import:build

FROM node:24.22.0-alpine@sha256:44fce696f38ba8c987c4db89954051000bbd05ffd8d8659ba15ed4a8602e937f AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup -S app && adduser -S app -G app && mkdir -p /data/uploads && chown app:app /data/uploads
COPY --from=builder --chown=app:app /app/.next/standalone ./
COPY --from=builder --chown=app:app /app/.next/static ./.next/static
COPY --from=builder --chown=app:app /app/public ./public
# O trace do standalone só leva o que o app importa; o migrator precisa do pacote inteiro
COPY --from=builder --chown=app:app /app/node_modules/drizzle-orm ./node_modules/drizzle-orm
COPY --from=builder --chown=app:app /app/drizzle ./drizzle
# worker empacotado pelo esbuild, sem node_modules (ADR-050)
COPY --from=builder --chown=app:app /app/dist/worker.mjs ./dist/worker.mjs
COPY --from=builder --chown=app:app /app/scripts/migrate.mjs ./dist/migrate.mjs
# importação do Windshift (ADR-056): docs/modules/12-migracao-implantacao.md
COPY --from=builder --chown=app:app /app/dist/import-windshift.mjs ./dist/import-windshift.mjs
# seed do primeiro admin: docker compose exec itc-tasks node dist/seed.mjs
COPY --from=builder --chown=app:app /app/src/db/seed.mjs ./dist/seed.mjs
COPY --from=builder --chown=app:app --chmod=755 /app/scripts/docker-entrypoint.sh ./docker-entrypoint.sh
USER app
EXPOSE 3000
CMD ["./docker-entrypoint.sh"]
