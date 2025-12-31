import type {
  RateLimitConfig,
  RateLimitStatus,
  UsageCalculation,
  SnapshotMap,
  Config,
} from "./types";
import {
  getAllRateLimitConfigs,
  getRateLimitConfig,
  upsertRateLimitStatus,
  updateRateLimitConfigAnchor,
  getModelUsageByPattern,
} from "./db";

const GAP_THRESHOLD_SECONDS = 1800; // 30 minutes
const FALSE_START_TOKEN_THRESHOLD = 100000; // 100k tokens

export class RateLimiter {
  private config: Config;

  constructor(config: Config) {
    this.config = config;
  }

  async syncLimits() {
    try {
      console.log("Starting rate limit synchronization process...");
      const configs = getAllRateLimitConfigs();

      if (configs.length === 0) {
        console.log(
          "No rate limit configurations found. Sync process finished."
        );
        return;
      }

      for (const config of configs) {
        try {
          await this.processConfig(config);
        } catch (error) {
          console.error(
            `Failed to process config ID ${config.id} for pattern '${config.model_pattern}': ${error}`
          );
        }
      }

      console.log("Rate limit synchronization process completed successfully.");
    } catch (error) {
      console.error(
        `A critical error occurred during the rate limit sync process: ${error}`
      );
    }
  }

  private async processConfig(config: RateLimitConfig) {
    const modelPattern = config.model_pattern;
    const configId = config.id!;

    console.log(
      `--- Processing config for: '${modelPattern}' (ID: ${configId}) ---`
    );

    const windowMinutes = config.window_minutes;
    const resetStrategy = config.reset_strategy;
    const tokenLimit = config.token_limit;
    const requestLimit = config.request_limit;

    if (!configId || !modelPattern || !windowMinutes || !resetStrategy) {
      console.warn(
        `Skipping incomplete config ID ${configId}. Missing required fields.`
      );
      return;
    }

    const now = this.getLocalDateTime();

    // Determine the time window for usage calculation
    let calculatedWindowStart = now;
    let nextReset = now;

    if (resetStrategy === "daily") {
      calculatedWindowStart = new Date(now);
      calculatedWindowStart.setHours(0, 0, 0, 0);
      nextReset = new Date(calculatedWindowStart);
      nextReset.setDate(nextReset.getDate() + 1);
    } else if (resetStrategy === "weekly") {
      // Calendar week: Reset on Monday 00:00
      const startOfToday = new Date(now);
      startOfToday.setHours(0, 0, 0, 0);
      const daysSinceMonday = startOfToday.getDay() === 0 ? 6 : startOfToday.getDay() - 1;
      calculatedWindowStart = new Date(startOfToday);
      calculatedWindowStart.setDate(calculatedWindowStart.getDate() - daysSinceMonday);
      nextReset = new Date(calculatedWindowStart);
      nextReset.setDate(nextReset.getDate() + 7);
    } else if (resetStrategy === "rolling") {
      calculatedWindowStart = new Date(now);
      calculatedWindowStart.setMinutes(
        calculatedWindowStart.getMinutes() - windowMinutes
      );
      nextReset = new Date(now);
      nextReset.setMinutes(nextReset.getMinutes() + 1);
    } else {
      console.warn(
        `Unsupported reset strategy '${resetStrategy}' for config ID ${configId}.`
      );
      return;
    }

    // Adjust window_start if a manual reset has occurred
    let windowStart = calculatedWindowStart;
    const resetAnchorStr = config.reset_anchor_timestamp;

    if (resetAnchorStr) {
      try {
        const resetAnchorDt = new Date(resetAnchorStr);

        if (resetAnchorDt > calculatedWindowStart) {
          console.log(
            `Manual reset anchor (${resetAnchorDt.toISOString()}) is active (newer than natural start ${calculatedWindowStart.toISOString()}).`
          );
          windowStart = resetAnchorDt;
        } else {
          console.log(
            `Manual reset anchor (${resetAnchorDt.toISOString()}) is expired (older than natural start ${calculatedWindowStart.toISOString()}).`
          );
        }
      } catch (error) {
        console.error(
          `Could not parse reset_anchor_timestamp: '${resetAnchorStr}'`
        );
      }
    }

    // Calculate usage within the determined window
    const usage = await this.calculateUsage(modelPattern, windowStart);
    const usedTokens = usage.total_tokens;
    const usedRequests = usage.request_count;

    // Update the status in the database
    this.updateStatus(
      configId,
      usedTokens,
      usedRequests,
      windowStart,
      nextReset,
      tokenLimit,
      requestLimit
    );

    console.log(`--- Finished processing for: '${modelPattern}' ---`);
  }

  private async calculateUsage(
    modelPattern: string,
    since: Date
  ): Promise<UsageCalculation> {
    console.log(
      `Calculating usage for '${modelPattern}' in window since ${since.toISOString()}`
    );

    // 1. Get the most recent snapshot for the pattern
    const latestSnapshots = getModelUsageByPattern(
      modelPattern,
      undefined,
      undefined,
      "DESC",
      1
    );

    if (latestSnapshots.length === 0) {
      console.log("No usage data found for this pattern at all. Usage is 0.");
      return { total_tokens: 0, request_count: 0 };
    }

    const latestTime = latestSnapshots[0].created_at!;
    const latestDt = new Date(latestTime);

    // If the latest snapshot is older than the window start, usage is 0
    if (latestDt < since) {
      console.log(
        `Latest snapshot (${latestDt.toISOString()}) is older than window start (${since.toISOString()}). Usage is 0.`
      );
      return { total_tokens: 0, request_count: 0 };
    }

    // 2. Find the earliest snapshot inside the window
    const firstInnerSnapshots = getModelUsageByPattern(
      modelPattern,
      since.toISOString(),
      undefined,
      "ASC",
      1
    );

    const firstInnerSnapshotTime =
      firstInnerSnapshots.length > 0
        ? firstInnerSnapshots[0].created_at!
        : null;

    // 3. Find the baseline snapshot: latest one before the window
    const baselineSnapshots = getModelUsageByPattern(
      modelPattern,
      undefined,
      since.toISOString(),
      "DESC",
      1
    );

    const baselineTime =
      baselineSnapshots.length > 0 ? baselineSnapshots[0].created_at! : null;

    // 4. Decision logic

    // Scenario A: No baseline before window
    if (!baselineTime) {
      if (!firstInnerSnapshotTime) {
        return { total_tokens: 0, request_count: 0 };
      }

      console.warn(
        "No snapshot found before window. Using first inner snapshot as baseline (Optimistic)."
      );
      return this.calculateDeltaFromSnapshots(
        modelPattern,
        latestTime,
        firstInnerSnapshotTime
      );
    }

    // Scenario B: Baseline exists. Check for data gap
    if (firstInnerSnapshotTime) {
      const baselineDt = new Date(baselineTime);
      const firstInnerDt = new Date(firstInnerSnapshotTime);

      const gapSeconds = (firstInnerDt.getTime() - baselineDt.getTime()) / 1000;

      if (gapSeconds > GAP_THRESHOLD_SECONDS) {
        // Gap detected
        console.log(
          `Large Data Gap detected (${gapSeconds}s > ${GAP_THRESHOLD_SECONDS}s) crossing window boundary.`
        );
        console.log(
          `Baseline snapshot: ${baselineTime} | First inner snapshot: ${firstInnerSnapshotTime}`
        );

        const ratioSeconds = (since.getTime() - baselineDt.getTime()) / 1000;
        const windowSpan = gapSeconds > 0 ? gapSeconds : 1;
        const ratio = Math.max(0, Math.min(1, ratioSeconds / windowSpan));

        console.log(
          `Interpolating baseline ${(ratio * 100).toFixed(2)}% between baseline and first_inner`
        );

        const baselineMap = this.buildSnapshotMap(modelPattern, baselineTime);
        const firstInnerMap = this.buildSnapshotMap(
          modelPattern,
          firstInnerSnapshotTime
        );
        const interpolatedMap = this.interpolateSnapshotMap(
          baselineMap,
          firstInnerMap,
          ratio
        );

        console.log(
          "Using interpolated baseline to avoid false usage spike caused by idle gap."
        );

        return this.calculateDeltaFromSnapshots(
          modelPattern,
          latestTime,
          baselineTime,
          interpolatedMap
        );
      } else {
        // No significant gap
        return this.calculateDeltaFromSnapshots(
          modelPattern,
          latestTime,
          baselineTime
        );
      }
    } else {
      // Baseline exists but no inner snapshot (shouldn't happen)
      return this.calculateDeltaFromSnapshots(
        modelPattern,
        latestTime,
        baselineTime
      );
    }
  }

  private buildSnapshotMap(
    modelPattern: string,
    snapshotTime: string
  ): SnapshotMap {
    const records = getModelUsageByPattern(modelPattern);
    const snapshotMap: SnapshotMap = {};

    for (const rec of records) {
      if (rec.created_at !== snapshotTime) continue;

      const mName = rec.model_name;
      if (!snapshotMap[mName]) {
        snapshotMap[mName] = { total_tokens: 0, request_count: 0 };
      }
      snapshotMap[mName].total_tokens += rec.total_tokens || 0;
      snapshotMap[mName].request_count += rec.request_count || 0;
    }

    return snapshotMap;
  }

  private interpolateSnapshotMap(
    baselineMap: SnapshotMap,
    firstInnerMap: SnapshotMap,
    ratio: number
  ): SnapshotMap {
    const interpolated: SnapshotMap = {};
    const allModels = new Set([
      ...Object.keys(baselineMap),
      ...Object.keys(firstInnerMap),
    ]);

    for (const modelName of allModels) {
      const baselineRec = baselineMap[modelName] || {
        total_tokens: 0,
        request_count: 0,
      };
      const innerRec = firstInnerMap[modelName] || baselineRec;

      const startTokens = baselineRec.total_tokens || 0;
      const endTokens = innerRec.total_tokens || 0;
      const startRequests = baselineRec.request_count || 0;
      const endRequests = innerRec.request_count || 0;

      const interpTokens = startTokens + ratio * (endTokens - startTokens);
      const interpRequests =
        startRequests + ratio * (endRequests - startRequests);

      interpolated[modelName] = {
        total_tokens: Math.round(interpTokens),
        request_count: Math.round(interpRequests),
      };
    }

    return interpolated;
  }

  private calculateDeltaFromSnapshots(
    modelPattern: string,
    latestTime: string,
    baselineTime: string,
    baselineOverride?: SnapshotMap
  ): UsageCalculation {
    console.log(
      `Calculating delta between latest (${latestTime}) and baseline (${baselineTime})`
    );

    const currentMap = this.buildSnapshotMap(modelPattern, latestTime);
    const baselineMap = baselineOverride || this.buildSnapshotMap(modelPattern, baselineTime);

    let totalUsedTokens = 0;
    let totalUsedRequests = 0;

    const allModels = new Set([
      ...Object.keys(currentMap),
      ...Object.keys(baselineMap),
    ]);

    for (const modelName of allModels) {
      const currentRec = currentMap[modelName] || {
        total_tokens: 0,
        request_count: 0,
      };
      const baselineRec = baselineMap[modelName] || {
        total_tokens: 0,
        request_count: 0,
      };

      const currentTokens = currentRec.total_tokens || 0;
      const currentReqs = currentRec.request_count || 0;
      const baselineTokens = baselineRec.total_tokens || 0;
      const baselineReqs = baselineRec.request_count || 0;

      let deltaTokens = currentTokens - baselineTokens;
      let deltaReqs = currentReqs - baselineReqs;

      // Restart detection
      if (deltaTokens < 0 || deltaReqs < 0) {
        console.warn(
          `Restart detected for '${modelName}'! Baseline: ${baselineTokens} tokens, ${baselineReqs} reqs | Current: ${currentTokens} tokens, ${currentReqs} reqs | Using current as increment.`
        );
        deltaTokens = currentTokens;
        deltaReqs = currentReqs;
      }

      // False start detection
      const isNewModel =
        !baselineMap[modelName] ||
        (baselineTokens === 0 && baselineReqs === 0);

      if (isNewModel && deltaTokens > FALSE_START_TOKEN_THRESHOLD) {
        if (
          baselineTokens === 0 ||
          Math.abs(deltaTokens - currentTokens) < 100
        ) {
          console.warn(
            `False Start detected for '${modelName}'! New model with ${deltaTokens} tokens (threshold: ${FALSE_START_TOKEN_THRESHOLD}). Skipping to avoid spike.`
          );
          continue;
        }
      }

      totalUsedTokens += Math.max(0, deltaTokens);
      totalUsedRequests += Math.max(0, deltaReqs);
    }

    console.log(
      `Delta calculated: ${totalUsedTokens} tokens, ${totalUsedRequests} requests.`
    );
    return { total_tokens: totalUsedTokens, request_count: totalUsedRequests };
  }

  private updateStatus(
    configId: number,
    usedTokens: number,
    usedRequests: number,
    windowStart: Date,
    nextReset: Date | null,
    tokenLimit: number | null,
    requestLimit: number | null
  ) {
    let label = "N/A";
    let percentage = 100;
    let remTokens = 0;
    let remRequests = 0;

    // Prioritize token limit for status display
    if (tokenLimit !== null && tokenLimit > 0) {
      remTokens = Math.max(0, tokenLimit - usedTokens);
      percentage = Math.floor((remTokens / tokenLimit) * 100);
      label = `${usedTokens.toLocaleString()}/${tokenLimit.toLocaleString()} Tokens`;
    } else if (requestLimit !== null && requestLimit > 0) {
      remRequests = Math.max(0, requestLimit - usedRequests);
      percentage = Math.floor((remRequests / requestLimit) * 100);
      label = `${usedRequests.toLocaleString()}/${requestLimit.toLocaleString()} Requests`;
    } else {
      label = `Used: ${usedTokens.toLocaleString()}T / ${usedRequests.toLocaleString()}R`;
    }

    percentage = Math.max(0, Math.min(100, percentage));

    const status: RateLimitStatus = {
      config_id: configId,
      last_updated: this.getLocalDateTime().toISOString(),
      window_start: windowStart.toISOString(),
      used_tokens: usedTokens,
      used_requests: usedRequests,
      status_label: label,
      percentage: percentage,
      remaining_tokens: remTokens,
      remaining_requests: remRequests,
      next_reset: nextReset ? nextReset.toISOString() : null,
    };

    console.log(
      `Updating DB for config ${configId}: Label='${label}', Percentage=${percentage}%, Used_Tokens=${usedTokens}`
    );

    try {
      upsertRateLimitStatus(status);
    } catch (error) {
      console.error(
        `DATABASE ERROR: Failed to upsert status for config_id ${configId}. Error: ${error}`
      );
    }
  }

  async resetLimit(configId: number): Promise<{
    success: boolean;
    message: string;
    newStatus?: { percentage: number; label: string };
  }> {
    console.log(`Received reset request for config_id: ${configId}`);

    try {
      const config = getRateLimitConfig(configId);

      if (!config) {
        console.warn(`No config found for id ${configId} to reset.`);
        return {
          success: false,
          message: `Configuration with id ${configId} not found.`,
        };
      }

      const tokenLimit = config.token_limit || 0;
      const requestLimit = config.request_limit || 0;

      let label: string;
      if (tokenLimit > 0) {
        label = `0/${tokenLimit.toLocaleString()} Tokens`;
      } else if (requestLimit > 0) {
        label = `0/${requestLimit.toLocaleString()} Requests`;
      } else {
        label = "Unlimited";
      }

      const currentTime = this.getLocalDateTime().toISOString();

      const statusData: RateLimitStatus = {
        config_id: configId,
        remaining_tokens: tokenLimit,
        remaining_requests: requestLimit,
        used_tokens: 0,
        used_requests: 0,
        percentage: 100,
        status_label: label,
        window_start: currentTime,
        last_updated: currentTime,
        next_reset: null,
      };

      // Update status
      upsertRateLimitStatus(statusData);

      // Update config with reset anchor
      updateRateLimitConfigAnchor(configId, currentTime);

      console.log(
        `Successfully reset rate limit status AND anchor for config_id: ${configId}`
      );

      return {
        success: true,
        message: `Successfully reset rate limit for config id ${configId}.`,
        newStatus: {
          percentage: 100,
          label: label,
        },
      };
    } catch (error) {
      console.error(`Failed to reset config_id ${configId}: ${error}`);
      return {
        success: false,
        message: "An internal error occurred.",
      };
    }
  }

  private getLocalDateTime(): Date {
    const now = new Date();
    const offsetMs = this.config.timezoneOffset * 60 * 60 * 1000;
    return new Date(now.getTime() + offsetMs);
  }
}
