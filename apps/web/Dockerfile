# syntax=docker/dockerfile:1.7
#
# Fractachain web (Astro SSR, adaptador Node standalone).
#
# Build context = raíz del repo (workspaces npm):
#   docker build -f apps/web/Dockerfile \
#     --build-arg PUBLIC_API_URL=https://api.example.com .
#
# Railway: Root Directory vacío, Dockerfile path = apps/web/Dockerfile.
# PUBLIC_* se incrusta en el bundle y en la CSP al compilar: cambiar la URL
# del API implica rebuild, no solo restart.

ARG NODE_VERSION=22-alpine

FROM node:${NODE_VERSION} AS deps
WORKDIR /repo
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/web/package.json apps/web/package.json
RUN --mount=type=cache,target=/root/.npm \
    npm ci --workspace @fractachain/web --no-audit --no-fund

FROM deps AS build
ARG PUBLIC_API_URL=http://localhost:4000
ARG PUBLIC_STELLAR_RPC_URL=https://soroban-testnet.stellar.org
ARG PUBLIC_STELLAR_NETWORK_PASSPHRASE="Test SDF Network ; September 2015"
ARG PUBLIC_FIREBASE_API_KEY=
ARG PUBLIC_FIREBASE_AUTH_DOMAIN=
ARG PUBLIC_FIREBASE_PROJECT_ID=
ARG PUBLIC_FIREBASE_STORAGE_BUCKET=
ARG PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
ARG PUBLIC_FIREBASE_APP_ID=
ENV PUBLIC_API_URL=$PUBLIC_API_URL \
    PUBLIC_STELLAR_RPC_URL=$PUBLIC_STELLAR_RPC_URL \
    PUBLIC_STELLAR_NETWORK_PASSPHRASE=$PUBLIC_STELLAR_NETWORK_PASSPHRASE \
    PUBLIC_FIREBASE_API_KEY=$PUBLIC_FIREBASE_API_KEY \
    PUBLIC_FIREBASE_AUTH_DOMAIN=$PUBLIC_FIREBASE_AUTH_DOMAIN \
    PUBLIC_FIREBASE_PROJECT_ID=$PUBLIC_FIREBASE_PROJECT_ID \
    PUBLIC_FIREBASE_STORAGE_BUCKET=$PUBLIC_FIREBASE_STORAGE_BUCKET \
    PUBLIC_FIREBASE_MESSAGING_SENDER_ID=$PUBLIC_FIREBASE_MESSAGING_SENDER_ID \
    PUBLIC_FIREBASE_APP_ID=$PUBLIC_FIREBASE_APP_ID \
    ASTRO_TELEMETRY_DISABLED=1
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN npm run build -w @fractachain/web

# Runtime: production dependencies + the built server, nothing else.
FROM node:${NODE_VERSION} AS runtime
WORKDIR /repo
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    ASTRO_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/web/package.json apps/web/package.json
RUN --mount=type=cache,target=/root/.npm \
    npm ci --workspace @fractachain/web --omit=dev --no-audit --no-fund \
    && chown -R node:node /repo
COPY --from=build --chown=node:node /repo/apps/web/dist apps/web/dist
USER node
WORKDIR /repo/apps/web
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/server/entry.mjs"]
