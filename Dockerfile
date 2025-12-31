# Dockerfile for CLIProxy Usage Collector
# Production-ready Bun application with externally mounted SQLite database

# Use official Bun image
FROM oven/bun:1 AS base
WORKDIR /app

# Install dependencies (separate layer for better caching)
FROM base AS deps
COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile --production

# Copy application files
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Production image
FROM base AS runner
WORKDIR /app

# Create non-root user for security
RUN groupadd -r bunuser && useradd -r -g bunuser bunuser

# Copy dependencies and application files
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/src ./src
COPY --from=builder /app/components ./components
COPY --from=builder /app/contexts ./contexts
COPY --from=builder /app/hooks ./hooks
COPY --from=builder /app/lib ./lib
COPY --from=builder /app/styles ./styles
COPY --from=builder /app/package.json ./
COPY --from=builder /app/tsconfig.json* ./
COPY --from=builder /app/App.tsx ./
COPY --from=builder /app/main.tsx ./
COPY --from=builder /app/index.html ./

# Create data directory for SQLite database mount
RUN mkdir -p /app/data && chown -R bunuser:bunuser /app/data

# Change ownership of application files
RUN chown -R bunuser:bunuser /app

# Switch to non-root user
USER bunuser

# Expose the collector trigger port
EXPOSE 5001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD bun run -e 'fetch("http://localhost:5001/api/collector/health").then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))'

# Run the application in production mode
CMD ["bun", "start"]
