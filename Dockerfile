FROM node:22.12-bookworm-slim AS frontend-builder
WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build


FROM node:22.12-bookworm-slim AS backend-builder
WORKDIR /app/backend

RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY backend/package*.json ./
RUN npm ci

COPY backend/ ./
RUN npx prisma generate --schema=src/prisma/schema.prisma


FROM node:22.12-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY --from=backend-builder /app/backend /app/backend
COPY --from=frontend-builder /app/frontend/dist /app/frontend/dist

WORKDIR /app/backend
EXPOSE 5000

CMD ["sh", "-c", "npx prisma migrate deploy --schema=src/prisma/schema.prisma && node src/server.js"]
