# CLIProxy Usage Collector

A TypeScript-based data collector for CLIProxy that monitors API usage, calculates costs, and manages rate limits. This is a port of the Python implementation, using Bun and SQLite instead of Supabase.

## Features

- **Usage Tracking**: Periodically polls CLIProxy Management API for usage statistics
- **Cost Calculation**: Automatically fetches pricing from llm-prices.com and calculates costs per model
- **Daily Statistics**: Aggregates usage data with smart delta calculation
  - Handles server restarts gracefully
  - Detects and filters "false starts" (models with pre-existing history)
  - Self-healing breakdown totals
- **Rate Limiting**: Supports multiple rate limit strategies:
  - Daily (resets at midnight)
  - Weekly (resets on Monday)
  - Rolling (sliding window)
  - Manual reset with anchor timestamps
  - Gap detection and interpolation for accurate usage tracking
- **HTTP API**: RESTful endpoints for health checks, manual triggers, and rate limit resets
- **SQLite Storage**: All data stored locally in SQLite for easy deployment and portability

## Architecture

- `src/types.ts` - TypeScript type definitions
- `src/db.ts` - SQLite database schema and operations
- `src/pricing.ts` - Model pricing fetcher with caching
- `src/collector.ts` - Usage data collection and storage logic
- `src/rate-limiter.ts` - Rate limit calculation and sync
- `src/server.ts` - HTTP API server using Bun.serve()
- `src/scheduler.ts` - Background job scheduler
- `src/index.ts` - Main entry point

## Database Schema

### Tables

- `usage_snapshots` - Raw snapshots from CLIProxy
- `model_usage` - Per-model usage data linked to snapshots
- `daily_stats` - Daily aggregated statistics with breakdown by model and endpoint
- `rate_limit_configs` - Rate limit configuration
- `rate_limit_status` - Current rate limit status

## Installation

```bash
bun install
```

## Configuration

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

Edit `.env`:

```env
# CLIProxy Configuration
CLIPROXY_URL=http://localhost:8317
CLIPROXY_MANAGEMENT_KEY=your-management-key-here

# Collector Configuration
COLLECTOR_INTERVAL_SECONDS=300
COLLECTOR_TRIGGER_PORT=5001

# Timezone Configuration (offset in hours from UTC)
TIMEZONE_OFFSET_HOURS=7

# Database Configuration
DB_PATH=./data/collector.db
```

## Usage

### Development Mode (with hot reload)

```bash
bun run dev
```

### Production Mode

```bash
bun run start
```

## API Endpoints

All endpoints are prefixed with `/api/collector`:

### Health Check

```bash
GET /api/collector/health
```

Returns server health status.

### Manual Trigger

```bash
POST /api/collector/trigger
```

Manually triggers a full data collection and rate limit sync.

### Reset Rate Limit

```bash
POST /api/collector/reset/:config_id
```

Resets the rate limit for a specific configuration, setting usage to 0 and creating a reset anchor.

## How It Works

### Data Collection Flow

1. **Fetch Usage Data**: Polls CLIProxy Management API at configured intervals
2. **Store Snapshot**: Saves raw data and cumulative totals
3. **Calculate Costs**: Fetches latest pricing and calculates per-model costs
4. **Calculate Deltas**: Computes incremental usage since last snapshot
   - Handles restarts (negative deltas)
   - Filters false starts (large initial values)
   - Maintains consistency between global totals and breakdowns
5. **Update Daily Stats**: Merges deltas into daily aggregates with self-healing

### Rate Limit Sync Flow

1. **Fetch Configs**: Loads all rate limit configurations
2. **Calculate Window**: Determines window start based on reset strategy and anchor
3. **Calculate Usage**: Sums usage for matching models within the window
   - Detects data gaps and interpolates baseline if needed
   - Handles restarts and false starts
4. **Update Status**: Saves remaining quota and percentage

## Smart Delta Calculation

The collector handles several edge cases:

### Restart Detection
When CLIProxy restarts, counters reset to 0. The collector detects negative deltas and treats the current value as the increment.

### False Start Detection
When a model with existing usage history appears for the first time, the collector filters it out to avoid cost spikes.

### Gap Detection (Rate Limits)
If there's a large gap (>30 minutes) between the baseline snapshot and the window start, the collector interpolates the baseline value to avoid importing idle period usage.

### Self-Healing Breakdowns
Daily stats are recalculated from the breakdown to ensure consistency, fixing any race conditions or partial updates.

## License

MIT

## Credits

Based on the Python CLIProxy collector implementation. Ported to TypeScript with Bun and SQLite.
