# syntax=docker/dockerfile:1.7
# Fractachain API. Build from the repo root (npm workspaces need the root lockfile):
#   docker build -f apps/api/Dockerfile -t fractachain-api .
# Railway: Root Directory empty, Dockerfile path = apps/api/Dockerfile.
# Secrets (AUTH_SECRET, WALLET_PEPPER, STELLAR_*_SECRET) come from the
# environment at runtime — never from the image.

ARG NODE_VERSION=22-alpine

FROM node:${NODE_VERSION} AS build
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
RUN npm ci --workspace @fractachain/api --include-workspace-root=false --no-audit --no-fund
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npm run build -w @fractachain/api

FROM node:${NODE_VERSION} AS runtime
RUN apk add --no-cache ca-certificates tini
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4000 \
    DATA_DIR=/app/data
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
RUN npm ci --workspace @fractachain/api --include-workspace-root=false --omit=dev --no-audit --no-fund \
  && npm cache clean --force
COPY --from=build /repo/apps/api/dist apps/api/dist
# Seed documents (catalog, network settings). Mount a volume on /app/data to keep runtime state.
COPY apps/api/data /app/data
COPY deployments/testnet.json deployments/testnet.json
RUN mkdir -p /app/data/selfies && chown -R node:node /app
USER node
WORKDIR /app/apps/api
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/main.js"]
