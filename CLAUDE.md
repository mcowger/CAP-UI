# CLIProxy Usage Collector - Bun Implementation

This project uses Bun exclusively. Default to using Bun instead of Node.js.

## Bun Commands

- Use `bun run dev` to start with hot reload
- Use `bun run start` for production mode
- Use `bun test` to run tests
- Use `bun install` for dependencies
- Bun automatically loads .env files - no dotenv package needed

## Project Architecture

This is a TypeScript-based CLIProxy usage collector with the following structure:

- `src/types.ts` - Type definitions
- `src/db.ts` - SQLite database using `bun:sqlite`
- `src/collector.ts` - Usage data collection logic
- `src/rate-limiter.ts` - Rate limit calculation and sync
- `src/scheduler.ts` - Background job scheduler
- `src/server.ts` - HTTP API using `Bun.serve()`
- `src/index.ts` - Main entry point

## Bun APIs Used

### Database: `bun:sqlite`
```ts
import { Database } from "bun:sqlite";

const db = new Database("./data/collector.db", { create: true });
db.exec("PRAGMA journal_mode = WAL;");
```

**Do not use** `better-sqlite3` or other SQLite packages - use `bun:sqlite`.

### HTTP Server: `Bun.serve()` with Routes
```ts
Bun.serve({
  port: config.triggerPort,
  routes: {
    "/api/collector/health": {
      GET: (req) => Response.json({ status: "healthy" }),
    },
    "/api/collector/trigger": {
      POST: async (req) => {
        // Handle POST
        return Response.json({ message: "triggered" }, { status: 202 });
      },
    },
    "/api/collector/reset/:config_id": {
      POST: async (req) => {
        const configId = parseInt(req.params.config_id);
        // Use route parameters
      },
    },
  },
  fetch: (req) => {
    // Fallback handler for non-matched routes
    return Response.json({ error: "Not found" }, { status: 404 });
  },
  development: {
    hmr: true,
    console: true,
  },
});
```

**Do not use** `express`, `fastify`, or other HTTP frameworks - use `Bun.serve()`.

### Environment Variables
Bun automatically loads `.env` files. Access via `process.env`:

```ts
const config = {
  cliproxyUrl: process.env.CLIPROXY_URL || "http://localhost:8317",
  dbPath: process.env.DB_PATH || "./data/collector.db",
};
```

**Do not use** `dotenv` package.

### Testing with `bun:test`
```ts
import { test, expect, describe, beforeAll, afterAll } from "bun:test";

describe("database tests", () => {
  beforeAll(() => {
    // Setup
  });

  test("should insert snapshot", () => {
    const id = insertUsageSnapshot(snapshot);
    expect(id).toBeGreaterThan(0);
  });

  afterAll(() => {
    // Cleanup
  });
});
```

## Development Workflow

### Hot Reload
```bash
bun run dev
# or
bun --hot ./src/index.ts
```

### Production
```bash
bun run start
```

### Testing
```bash
bun test
# Run specific test file
bun test src/db.test.ts
```

## Configuration

Copy `.env.example` to `.env`:

```env
CLIPROXY_URL=http://localhost:8317
CLIPROXY_MANAGEMENT_KEY=your-key-here
COLLECTOR_INTERVAL_SECONDS=300
COLLECTOR_TRIGGER_PORT=5001
TIMEZONE_OFFSET_HOURS=7
DB_PATH=./data/collector.db
```

## Key Components

### Scheduler (`src/scheduler.ts`)
Background job scheduler that runs periodic sync tasks.

### Collector (`src/collector.ts`)
Fetches usage data from CLIProxy Management API, calculates costs using llm-prices.com, and stores in SQLite.

### Rate Limiter (`src/rate-limiter.ts`)
Manages rate limits with support for daily, weekly, and rolling windows. Handles gap detection and interpolation.

### Server (`src/server.ts`)
RESTful API with routes:
- `GET /api/collector/health` - Health check
- `POST /api/collector/trigger` - Manual sync trigger
- `POST /api/collector/reset/:config_id` - Reset rate limit

## Database Operations

All database operations use `bun:sqlite` with prepared statements and transactions:

```ts
// Prepared statement
const stmt = db.prepare(`INSERT INTO usage_snapshots (...) VALUES (?, ?, ?)`);
const result = stmt.run(value1, value2, value3);

// Transaction
const transaction = db.transaction((records) => {
  for (const record of records) {
    stmt.run(record.value1, record.value2);
  }
});
transaction(records);
```

## Other Bun Features

If needed:
- `Bun.redis` for Redis (instead of `ioredis`)
- `Bun.sql` for Postgres (instead of `pg`)
- `Bun.file` for file operations (instead of `fs.readFile/writeFile`)
- `Bun.$` for shell commands (instead of `execa`)

For more information, read the Bun API docs in `node_modules/bun-types/docs/**.mdx`.
