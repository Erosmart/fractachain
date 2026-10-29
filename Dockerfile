# syntax=docker/dockerfile:1.7
#
# Fractachain — una sola imagen: Astro (SSR) + API en el mismo servidor.
#
#   docker build -t fractachain .
#   docker run -p 3000:3000 --env-file .env -v fractachain-data:/app/data fractachain
#
# Railway: Root Directory vacío, Dockerfile path = Dockerfile.
# PUBLIC_* se incrusta en el bundle al compilar (build args); los secretos
# del servidor llegan como variables de entorno en runtime, nunca en la imagen.

ARG NODE_VERSION=22-alpine

FROM node:${NODE_VERSION} AS build
WORKDIR /repo
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/api/package.json packages/api/
COPY apps/web/package.json apps/web/
RUN --mount=type=cache,target=/root/.npm \
    npm ci --workspace @fractachain/web --workspace @fractachain/api --include-workspace-root=false --no-audit --no-fund
ARG PUBLIC_API_URL=
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
COPY packages packages
COPY apps/web apps/web
RUN npm run build -w @fractachain/api && npm run build -w @fractachain/web

FROM node:${NODE_VERSION} AS runtime
RUN apk add --no-cache ca-certificates tini
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    DATA_DIR=/app/data \
    ASTRO_TELEMETRY_DISABLED=1
WORKDIR /repo
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/api/package.json packages/api/
COPY apps/web/package.json apps/web/
RUN --mount=type=cache,target=/root/.npm \
    npm ci --workspace @fractachain/web --workspace @fractachain/api --include-workspace-root=false --omit=dev --no-audit --no-fund
COPY --from=build /repo/packages/api/dist packages/api/dist
COPY --from=build /repo/apps/web/dist apps/web/dist
COPY apps/web/server apps/web/server
COPY deployments/testnet.json deployments/testnet.json
# Seed documents (Merval catalog, network settings); runtime state lives in the /app/data volume.
COPY packages/api/data /app/data
RUN mkdir -p /app/data/selfies && chown -R node:node /app /repo
USER node
WORKDIR /repo/apps/web
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server/main.mjs"]
