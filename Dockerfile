# --- Stage 1: Build Frontend Assets ---
FROM oven/bun:1-alpine AS builder
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build

# --- Stage 2: Production Runtime ---
FROM oven/bun:1-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src ./src
COPY --from=builder /app/drizzle ./drizzle  
COPY entrypoint.sh ./entrypoint.sh

# Create the internal container mount point for the database
VOLUME /app/data

EXPOSE 3000

ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["bun", "run", "src/index.ts"]