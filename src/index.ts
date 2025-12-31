import type { Config } from "./types";
import { initDatabase } from "./db";
import { UsageCollector } from "./collector";
import { RateLimiter } from "./rate-limiter";
import { Scheduler } from "./scheduler";
import { createServer } from "./server";

// Configuration from environment
const config: Config = {
  cliproxyUrl: process.env.CLIPROXY_URL || "http://localhost:8317",
  cliproxyManagementKey: process.env.CLIPROXY_MANAGEMENT_KEY || "",
  collectorInterval: parseInt(
    process.env.COLLECTOR_INTERVAL_SECONDS || "300",
    10
  ),
  triggerPort: parseInt(process.env.COLLECTOR_TRIGGER_PORT || "5001", 10),
  timezoneOffset: parseInt(process.env.TIMEZONE_OFFSET_HOURS || "7", 10),
  dbPath: process.env.DB_PATH || "./data/collector.db",
};

async function main() {
  console.log("Starting CLIProxy Usage Collector (TypeScript)");

  // Initialize database
  try {
    initDatabase(config.dbPath);
    console.log(`SQLite database initialized at: ${config.dbPath}`);
  } catch (error) {
    console.error(`CRITICAL: Failed to initialize database: ${error}`);
    process.exit(1);
  }

  // Initialize components
  const collector = new UsageCollector(config);
  const rateLimiter = new RateLimiter(config);

  // Define the full sync function
  const runFullSync = async () => {
    console.log("Fetching usage data...");
    const data = await collector.fetchUsageData();

    if (data) {
      await collector.storeUsageData(data);
    } else {
      console.warn("No data received from CLIProxy.");
    }

    await rateLimiter.syncLimits();
  };

  // Start the background scheduler
  const scheduler = new Scheduler(config.collectorInterval, runFullSync);
  scheduler.start();
  console.log(
    `Background sync scheduled every ${config.collectorInterval} seconds.`
  );

  // Start the HTTP server
  const server = createServer(config, collector, rateLimiter, runFullSync);
  console.log(`HTTP server started on http://0.0.0.0:${config.triggerPort}`);
  console.log("API endpoints available under /api/collector");
  console.log("  GET  /api/collector/health");
  console.log("  POST /api/collector/trigger");
  console.log("  POST /api/collector/reset/:config_id");

  // Handle graceful shutdown
  process.on("SIGINT", () => {
    console.log("\nReceived SIGINT, shutting down gracefully...");
    scheduler.stop();
    server.stop();
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    console.log("\nReceived SIGTERM, shutting down gracefully...");
    scheduler.stop();
    server.stop();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error(`Fatal error: ${error}`);
  process.exit(1);
});
