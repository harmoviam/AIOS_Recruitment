# AIOS Recruitment — production image (Express + static React)
FROM node:20-alpine AS client-builder
WORKDIR /app/client
COPY client-v2/package*.json ./
RUN npm ci --no-audit
COPY client-v2/ ./
RUN npm run build

FROM node:20-alpine AS server-builder
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci --no-audit
COPY server/ ./
RUN npm run build

FROM node:20-alpine AS production-deps
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci --omit=dev --no-audit

FROM node:20-alpine
RUN apk add --no-cache dumb-init && \
    addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

WORKDIR /app

COPY --from=production-deps /app/server/node_modules ./server/node_modules
COPY --from=server-builder /app/server/dist ./server/dist
COPY --from=server-builder /app/server/package.json ./server/package.json
COPY --from=client-builder /app/client/dist ./client-v2/dist

ENV NODE_ENV=production
ENV PORT=8080

USER nodejs
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=10s --start-period=45s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:8080/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server/dist/index.js"]
