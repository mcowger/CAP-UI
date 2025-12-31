import { test, expect, beforeAll, afterAll } from "bun:test";
import { Database } from "bun:sqlite";
import { initDatabase, getDatabase, insertUsageSnapshot } from "./db";

let testDb: Database;

beforeAll(() => {
  // Use in-memory database for testing
  testDb = initDatabase(":memory:");
});

afterAll(() => {
  testDb.close();
});

test("database initializes correctly", () => {
  const db = getDatabase();
  expect(db).toBeDefined();
});

test("can insert usage snapshot", () => {
  const snapshot = {
    raw_data: JSON.stringify({ test: "data" }),
    total_requests: 100,
    success_count: 95,
    failure_count: 5,
    total_tokens: 1000,
    cumulative_cost_usd: 0.5,
  };

  const id = insertUsageSnapshot(snapshot);
  expect(id).toBeGreaterThan(0);
});

test("tables are created", () => {
  const db = getDatabase();

  const tables = db
    .query<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table'"
    )
    .all();

  const tableNames = tables.map((t) => t.name);

  expect(tableNames).toContain("usage_snapshots");
  expect(tableNames).toContain("model_usage");
  expect(tableNames).toContain("daily_stats");
  expect(tableNames).toContain("rate_limit_configs");
  expect(tableNames).toContain("rate_limit_status");
});
