import { Database } from "bun:sqlite";
import type {
  UsageSnapshot,
  ModelUsage,
  DailyStats,
  RateLimitConfig,
  RateLimitStatus,
} from "./types";

let db: Database;

export function initDatabase(dbPath: string = "./data/collector.db"): Database {
  db = new Database(dbPath, { create: true });

  // Enable WAL mode for better concurrency
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");

  createTables();

  return db;
}

export function getDatabase(): Database {
  if (!db) {
    throw new Error("Database not initialized. Call initDatabase() first.");
  }
  return db;
}

function createTables() {
  // Usage snapshots table
  db.exec(`
    CREATE TABLE IF NOT EXISTS usage_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      collected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      raw_data TEXT NOT NULL,
      total_requests INTEGER NOT NULL DEFAULT 0,
      success_count INTEGER NOT NULL DEFAULT 0,
      failure_count INTEGER NOT NULL DEFAULT 0,
      total_tokens INTEGER NOT NULL DEFAULT 0,
      cumulative_cost_usd REAL NOT NULL DEFAULT 0
    )
  `);

  // Model usage table
  db.exec(`
    CREATE TABLE IF NOT EXISTS model_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      snapshot_id INTEGER NOT NULL,
      model_name TEXT NOT NULL,
      estimated_cost_usd REAL NOT NULL DEFAULT 0,
      request_count INTEGER NOT NULL DEFAULT 0,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      total_tokens INTEGER NOT NULL DEFAULT 0,
      api_endpoint TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (snapshot_id) REFERENCES usage_snapshots(id) ON DELETE CASCADE
    )
  `);

  // Create index on created_at for performance
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_model_usage_created_at
    ON model_usage(created_at DESC)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_model_usage_model_name
    ON model_usage(model_name)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_model_usage_snapshot_id
    ON model_usage(snapshot_id)
  `);

  // Daily stats table
  db.exec(`
    CREATE TABLE IF NOT EXISTS daily_stats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      stat_date DATE NOT NULL UNIQUE,
      total_requests INTEGER NOT NULL DEFAULT 0,
      success_count INTEGER NOT NULL DEFAULT 0,
      failure_count INTEGER NOT NULL DEFAULT 0,
      total_tokens INTEGER NOT NULL DEFAULT 0,
      estimated_cost_usd REAL NOT NULL DEFAULT 0,
      breakdown TEXT NOT NULL DEFAULT '{}'
    )
  `);

  // Rate limit configs table
  db.exec(`
    CREATE TABLE IF NOT EXISTS rate_limit_configs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      model_pattern TEXT NOT NULL,
      window_minutes INTEGER NOT NULL,
      reset_strategy TEXT NOT NULL CHECK(reset_strategy IN ('daily', 'weekly', 'rolling')),
      token_limit INTEGER,
      request_limit INTEGER,
      reset_anchor_timestamp DATETIME
    )
  `);

  // Rate limit status table
  db.exec(`
    CREATE TABLE IF NOT EXISTS rate_limit_status (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      config_id INTEGER NOT NULL UNIQUE,
      remaining_tokens INTEGER NOT NULL DEFAULT 0,
      remaining_requests INTEGER NOT NULL DEFAULT 0,
      used_tokens INTEGER NOT NULL DEFAULT 0,
      used_requests INTEGER NOT NULL DEFAULT 0,
      percentage INTEGER NOT NULL DEFAULT 100,
      status_label TEXT NOT NULL DEFAULT '',
      window_start DATETIME NOT NULL,
      last_updated DATETIME NOT NULL,
      next_reset DATETIME,
      FOREIGN KEY (config_id) REFERENCES rate_limit_configs(id) ON DELETE CASCADE
    )
  `);
}

// Helper functions for database operations

export function insertUsageSnapshot(snapshot: UsageSnapshot): number {
  const stmt = db.prepare(`
    INSERT INTO usage_snapshots (raw_data, total_requests, success_count, failure_count, total_tokens, cumulative_cost_usd)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    snapshot.raw_data,
    snapshot.total_requests,
    snapshot.success_count,
    snapshot.failure_count,
    snapshot.total_tokens,
    snapshot.cumulative_cost_usd
  );

  return result.lastInsertRowid as number;
}

export function updateSnapshotCost(id: number, cost: number) {
  const stmt = db.prepare(`
    UPDATE usage_snapshots SET cumulative_cost_usd = ? WHERE id = ?
  `);
  stmt.run(cost, id);
}

export function getLatestSnapshot(): UsageSnapshot | null {
  const stmt = db.prepare(`
    SELECT * FROM usage_snapshots ORDER BY collected_at DESC LIMIT 1
  `);
  return stmt.get() as UsageSnapshot | null;
}

export function getLatestSnapshots(limit: number): UsageSnapshot[] {
  const stmt = db.prepare(`
    SELECT * FROM usage_snapshots ORDER BY collected_at DESC LIMIT ?
  `);
  return stmt.all(limit) as UsageSnapshot[];
}

export function insertModelUsage(usage: ModelUsage) {
  const stmt = db.prepare(`
    INSERT INTO model_usage (snapshot_id, model_name, estimated_cost_usd, request_count, input_tokens, output_tokens, total_tokens, api_endpoint)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    usage.snapshot_id,
    usage.model_name,
    usage.estimated_cost_usd,
    usage.request_count,
    usage.input_tokens,
    usage.output_tokens,
    usage.total_tokens,
    usage.api_endpoint
  );
}

export function insertModelUsageBulk(usages: ModelUsage[]) {
  const stmt = db.prepare(`
    INSERT INTO model_usage (snapshot_id, model_name, estimated_cost_usd, request_count, input_tokens, output_tokens, total_tokens, api_endpoint)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const transaction = db.transaction((records: ModelUsage[]) => {
    for (const usage of records) {
      stmt.run(
        usage.snapshot_id,
        usage.model_name,
        usage.estimated_cost_usd,
        usage.request_count,
        usage.input_tokens,
        usage.output_tokens,
        usage.total_tokens,
        usage.api_endpoint
      );
    }
  });

  transaction(usages);
}

export function getModelUsageBySnapshot(snapshotId: number): ModelUsage[] {
  const stmt = db.prepare(`
    SELECT * FROM model_usage WHERE snapshot_id = ?
  `);
  return stmt.all(snapshotId) as ModelUsage[];
}

export function upsertDailyStats(stats: DailyStats) {
  const stmt = db.prepare(`
    INSERT INTO daily_stats (stat_date, total_requests, success_count, failure_count, total_tokens, estimated_cost_usd, breakdown)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(stat_date) DO UPDATE SET
      total_requests = excluded.total_requests,
      success_count = excluded.success_count,
      failure_count = excluded.failure_count,
      total_tokens = excluded.total_tokens,
      estimated_cost_usd = excluded.estimated_cost_usd,
      breakdown = excluded.breakdown
  `);

  stmt.run(
    stats.stat_date,
    stats.total_requests,
    stats.success_count,
    stats.failure_count,
    stats.total_tokens,
    stats.estimated_cost_usd,
    stats.breakdown
  );
}

export function getDailyStats(date: string): DailyStats | null {
  const stmt = db.prepare(`
    SELECT * FROM daily_stats WHERE stat_date = ?
  `);
  return stmt.get(date) as DailyStats | null;
}

export function getAllRateLimitConfigs(): RateLimitConfig[] {
  const stmt = db.prepare(`
    SELECT * FROM rate_limit_configs
  `);
  return stmt.all() as RateLimitConfig[];
}

export function getRateLimitConfig(id: number): RateLimitConfig | null {
  const stmt = db.prepare(`
    SELECT * FROM rate_limit_configs WHERE id = ?
  `);
  return stmt.get(id) as RateLimitConfig | null;
}

export function upsertRateLimitStatus(status: RateLimitStatus) {
  const stmt = db.prepare(`
    INSERT INTO rate_limit_status (config_id, remaining_tokens, remaining_requests, used_tokens, used_requests, percentage, status_label, window_start, last_updated, next_reset)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(config_id) DO UPDATE SET
      remaining_tokens = excluded.remaining_tokens,
      remaining_requests = excluded.remaining_requests,
      used_tokens = excluded.used_tokens,
      used_requests = excluded.used_requests,
      percentage = excluded.percentage,
      status_label = excluded.status_label,
      window_start = excluded.window_start,
      last_updated = excluded.last_updated,
      next_reset = excluded.next_reset
  `);

  stmt.run(
    status.config_id,
    status.remaining_tokens,
    status.remaining_requests,
    status.used_tokens,
    status.used_requests,
    status.percentage,
    status.status_label,
    status.window_start,
    status.last_updated,
    status.next_reset
  );
}

export function updateRateLimitConfigAnchor(configId: number, timestamp: string) {
  const stmt = db.prepare(`
    UPDATE rate_limit_configs SET reset_anchor_timestamp = ? WHERE id = ?
  `);
  stmt.run(timestamp, configId);
}

export function getModelUsageByPattern(
  pattern: string,
  sinceTime?: string,
  beforeTime?: string,
  orderBy: 'ASC' | 'DESC' = 'DESC',
  limit?: number
): ModelUsage[] {
  let query = `
    SELECT * FROM model_usage
    WHERE model_name LIKE ?
  `;

  const params: any[] = [`%${pattern}%`];

  if (sinceTime) {
    query += ` AND created_at >= ?`;
    params.push(sinceTime);
  }

  if (beforeTime) {
    query += ` AND created_at < ?`;
    params.push(beforeTime);
  }

  query += ` ORDER BY created_at ${orderBy}`;

  if (limit) {
    query += ` LIMIT ?`;
    params.push(limit);
  }

  const stmt = db.prepare(query);
  return stmt.all(...params) as ModelUsage[];
}
