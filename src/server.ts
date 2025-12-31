import type { Config } from "./types";
import type { UsageCollector } from "./collector";
import type { RateLimiter } from "./rate-limiter";
import index from "../index.html";
import {
  getLatestSnapshot,
  getDailyStats,
  getModelUsage,
  getHourlyStats,
  getEndpointUsage,
  getRateLimits,
  saveRateLimits
} from "./data-api";

export function createServer(
  config: Config,
  collector: UsageCollector,
  rateLimiter: RateLimiter,
  runFullSync: () => Promise<void>
) {
  return Bun.serve({
    port: config.triggerPort,
    development: {
      hmr: true,
      console: true,
    },
    routes: {
      "/": index,
      "/api/data/latest-snapshot": {
        GET: (req) => {
          const snapshot = getLatestSnapshot();
          return Response.json(snapshot || {});
        },
      },
      "/api/data/daily-stats": {
        GET: (req) => {
          const url = new URL(req.url);
          const startDate = url.searchParams.get('startDate') || undefined;
          const endDate = url.searchParams.get('endDate') || undefined;
          const stats = getDailyStats(startDate, endDate);
          return Response.json(stats);
        },
      },
      "/api/data/model-usage": {
        GET: (req) => {
          const url = new URL(req.url);
          const params = {
            startTime: url.searchParams.get('startTime') || undefined,
            endTime: url.searchParams.get('endTime') || undefined,
            startDate: url.searchParams.get('startDate') || undefined,
            endDate: url.searchParams.get('endDate') || undefined,
          };
          const usage = getModelUsage(params);
          return Response.json(usage);
        },
      },
      "/api/data/hourly-stats": {
        GET: (req) => {
          const url = new URL(req.url);
          const startTime = url.searchParams.get('startTime') || undefined;
          const endTime = url.searchParams.get('endTime') || undefined;
          const stats = getHourlyStats(startTime, endTime);
          return Response.json(stats);
        },
      },
      "/api/data/endpoint-usage": {
        GET: (req) => {
          const url = new URL(req.url);
          const params = {
            startTime: url.searchParams.get('startTime') || undefined,
            endTime: url.searchParams.get('endTime') || undefined,
            startDate: url.searchParams.get('startDate') || undefined,
            endDate: url.searchParams.get('endDate') || undefined,
          };
          const usage = getEndpointUsage(params);
          return Response.json(usage);
        },
      },
      "/api/data/rate-limits": {
        GET: (req) => {
          const limits = getRateLimits();
          return Response.json(limits);
        },
        POST: async (req) => {
          try {
            const config = await req.json();
            const result = saveRateLimits(config);
            if (result.success) {
              return Response.json({ success: true });
            } else {
              return Response.json(
                { success: false, error: result.error },
                { status: 500 }
              );
            }
          } catch (error) {
            return Response.json(
              { success: false, error: String(error) },
              { status: 500 }
            );
          }
        },
      },
      "/api/collector/health": {
        GET: (req) => {
          return Response.json({
            status: "healthy",
            timestamp: new Date().toISOString(),
          });
        },
      },
      "/api/collector/trigger": {
        POST: async (req) => {
          console.log("Manual trigger received for full sync.");

          // Run sync in background
          runFullSync().catch((error) => {
            console.error(`Background sync failed: ${error}`);
          });

          return Response.json(
            {
              message:
                "Full data collection and rate limit sync process triggered.",
            },
            { status: 202 }
          );
        },
      },
      "/api/collector/reset/:config_id": {
        POST: async (req) => {
          const configId = parseInt(req.params.config_id);

          if (isNaN(configId)) {
            return Response.json(
              { error: "Invalid config_id" },
              { status: 400 }
            );
          }

          console.log(`Received reset request for config_id: ${configId}`);

          const result = await rateLimiter.resetLimit(configId);

          if (result.success) {
            return Response.json(
              {
                message: result.message,
                new_status: result.newStatus,
              },
              { status: 200 }
            );
          } else {
            const status = result.message.includes("not found") ? 404 : 500;
            return Response.json({ error: result.message }, { status });
          }
        },
      },
    },
    fetch: (req) => {
      // Handle routes not matched above
      const url = new URL(req.url);

      // Health check endpoint
      if (url.pathname === "/api/collector/health" && req.method === "GET") {
        return Response.json({
          status: "healthy",
          timestamp: new Date().toISOString(),
        });
      }

      // Manual trigger endpoint
      if (url.pathname === "/api/collector/trigger" && req.method === "POST") {
        console.log("Manual trigger received for full sync.");

        runFullSync().catch((error) => {
          console.error(`Background sync failed: ${error}`);
        });

        return Response.json(
          {
            message:
              "Full data collection and rate limit sync process triggered.",
          },
          { status: 202 }
        );
      }

      // Reset endpoint
      const resetMatch = url.pathname.match(/^\/api\/collector\/reset\/(\d+)$/);
      if (resetMatch && req.method === "POST") {
        const configId = parseInt(resetMatch[1]);

        console.log(`Received reset request for config_id: ${configId}`);

        return (async () => {
          const result = await rateLimiter.resetLimit(configId);

          if (result.success) {
            return Response.json(
              {
                message: result.message,
                new_status: result.newStatus,
              },
              { status: 200 }
            );
          } else {
            const status = result.message.includes("not found") ? 404 : 500;
            return Response.json({ error: result.message }, { status });
          }
        })();
      }

      // 404 for unknown routes
      return Response.json(
        { error: "Not found" },
        { status: 404 }
      );
    },
  });
}
