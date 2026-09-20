# Build from the repo root:
#   docker build -f backend/Dockerfile .
# Railway: empty Root Directory, Dockerfile path = backend/Dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY backend/package.json backend/package-lock.json ./
RUN npm ci
COPY backend/ ./
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
RUN apk add --no-cache ca-certificates
ENV NODE_ENV=production
ENV PORT=4000
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
COPY deployments/testnet.json ./deployments/testnet.json
COPY backend/data ./data
RUN mkdir -p data/selfies \
  && chown -R node:node /app
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--use-system-ca", "dist/server.js"]
