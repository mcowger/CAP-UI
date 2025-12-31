import type {
  CLIProxyResponse,
  UsageSnapshot,
  ModelUsage,
  DailyStats,
  DailyStatsBreakdown,
  ModelBreakdown,
  EndpointBreakdown,
  Config,
} from "./types";
import {
  insertUsageSnapshot,
  updateSnapshotCost,
  insertModelUsageBulk,
  getLatestSnapshots,
  getModelUsageBySnapshot,
  getDailyStats,
  upsertDailyStats,
} from "./db";
import { getModelPricing, findPricingForModel, calculateCost } from "./pricing";

export class UsageCollector {
  private config: Config;

  constructor(config: Config) {
    this.config = config;
  }

  async fetchUsageData(): Promise<CLIProxyResponse | null> {
    const url = `${this.config.cliproxyUrl}/v0/management/usage`;
    const headers: Record<string, string> = {};

    if (this.config.cliproxyManagementKey) {
      headers.Authorization = `Bearer ${this.config.cliproxyManagementKey}`;
    }

    try {
      const response = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`Failed to fetch usage data: ${error}`);
      return null;
    }
  }

  async storeUsageData(data: CLIProxyResponse): Promise<boolean> {
    if (!data || !data.usage) {
      return false;
    }

    const usage = data.usage;
    const pricing = await getModelPricing();

    try {
      // Current cumulative values from CLIProxy
      const currentRequests = usage.total_requests || 0;
      const currentSuccess = usage.success_count || 0;
      const currentFailure = usage.failure_count || 0;
      const currentTokens = usage.total_tokens || 0;

      // Get last cumulative cost
      const latestSnapshots = getLatestSnapshots(1);
      const lastCostTotal =
        latestSnapshots.length > 0
          ? latestSnapshots[0].cumulative_cost_usd || 0
          : 0;

      // Insert snapshot with cumulative data
      const snapshotData: UsageSnapshot = {
        raw_data: JSON.stringify(data),
        total_requests: currentRequests,
        success_count: currentSuccess,
        failure_count: currentFailure,
        total_tokens: currentTokens,
        cumulative_cost_usd: lastCostTotal, // placeholder, updated after cost calc
      };

      const snapshotId = insertUsageSnapshot(snapshotData);

      // Process model-level data
      const modelRecords: ModelUsage[] = [];
      let totalCost = 0;

      for (const [apiEndpoint, apiData] of Object.entries(usage.apis || {})) {
        for (const [modelName, modelData] of Object.entries(
          apiData.models || {}
        )) {
          const inputTok = modelData.details.reduce(
            (sum, d) => sum + (d.tokens?.input_tokens || 0),
            0
          );
          const outputTok = modelData.details.reduce(
            (sum, d) => sum + (d.tokens?.output_tokens || 0),
            0
          );

          const { pricing: modelPrice } = findPricingForModel(
            modelName,
            pricing
          );
          const cost = calculateCost(inputTok, outputTok, modelPrice);
          totalCost += cost;

          modelRecords.push({
            snapshot_id: snapshotId,
            model_name: modelName,
            estimated_cost_usd: cost,
            request_count: modelData.total_requests || 0,
            input_tokens: inputTok,
            output_tokens: outputTok,
            total_tokens: modelData.total_tokens || 0,
            api_endpoint: apiEndpoint,
          });
        }
      }

      if (modelRecords.length > 0) {
        insertModelUsageBulk(modelRecords);
      }

      // Update snapshot cumulative cost
      const cumulativeCost = lastCostTotal + totalCost;
      updateSnapshotCost(snapshotId, cumulativeCost);

      // Calculate daily delta stats
      await this.calculateDailyDelta(
        snapshotId,
        currentRequests,
        currentSuccess,
        currentFailure,
        currentTokens,
        cumulativeCost,
        totalCost,
        modelRecords
      );

      console.log(
        `Stored snapshot ${snapshotId}. Total cost for this snapshot: $${totalCost.toFixed(4)}`
      );
      return true;
    } catch (error) {
      console.error(`Failed to store usage data: ${error}`);
      return false;
    }
  }

  private async calculateDailyDelta(
    snapshotId: number,
    currentRequests: number,
    currentSuccess: number,
    currentFailure: number,
    currentTokens: number,
    cumulativeCost: number,
    totalCost: number,
    modelRecords: ModelUsage[]
  ) {
    const today = this.getLocalDate();
    const todayIso = today;

    // Get the previous snapshot (2nd latest, since we just inserted the latest)
    const latestSnapshots = getLatestSnapshots(2);
    const hasPrev = latestSnapshots.length >= 2;
    const prevSnap = hasPrev ? latestSnapshots[1] : null;

    let incRequests = 0;
    let incSuccess = 0;
    let incFailure = 0;
    let incTokens = 0;
    let incCost = 0;

    if (prevSnap) {
      // Calculate incremental delta
      incRequests = currentRequests - (prevSnap.total_requests || 0);
      incSuccess = currentSuccess - (prevSnap.success_count || 0);
      incFailure = currentFailure - (prevSnap.failure_count || 0);
      incTokens = currentTokens - (prevSnap.total_tokens || 0);
      incCost = cumulativeCost - (prevSnap.cumulative_cost_usd || 0);

      // Detect restart (negative delta)
      if (incRequests < 0 || incTokens < 0) {
        console.warn(
          `Restart detected! Prev Req: ${prevSnap.total_requests}, Curr Req: ${currentRequests}`
        );
        incRequests = currentRequests;
        incSuccess = currentSuccess;
        incFailure = currentFailure;
        incTokens = currentTokens;
        incCost = totalCost;
      }
    } else {
      // First snapshot ever
      incRequests = currentRequests;
      incSuccess = currentSuccess;
      incFailure = currentFailure;
      incTokens = currentTokens;
      incCost = totalCost;
    }

    // Initialize breakdown deltas
    const breakdownDeltas: DailyStatsBreakdown = {
      models: {},
      endpoints: {},
    };

    if (prevSnap) {
      // Calculate granular deltas for breakdown
      const prevUsageRecords = getModelUsageBySnapshot(prevSnap.id!);
      const prevUsageMap = new Map<string, ModelUsage>();

      for (const r of prevUsageRecords) {
        const ep = r.api_endpoint || "unknown";
        const key = `${r.model_name}|${ep}`;
        prevUsageMap.set(key, r);
      }

      const currUsageMap = new Map<string, ModelUsage>();
      for (const r of modelRecords) {
        const ep = r.api_endpoint || "unknown";
        const key = `${r.model_name}|${ep}`;
        currUsageMap.set(key, r);
      }

      const allKeys = new Set([
        ...prevUsageMap.keys(),
        ...currUsageMap.keys(),
      ]);

      for (const key of allKeys) {
        const prev = prevUsageMap.get(key);
        const curr = currUsageMap.get(key);

        const pReq = prev?.request_count || 0;
        const pTok = prev?.total_tokens || 0;
        const pCost = prev?.estimated_cost_usd || 0;
        const pIn = prev?.input_tokens || 0;
        const pOut = prev?.output_tokens || 0;

        const cReq = curr?.request_count || 0;
        const cTok = curr?.total_tokens || 0;
        const cCost = curr?.estimated_cost_usd || 0;
        const cIn = curr?.input_tokens || 0;
        const cOut = curr?.output_tokens || 0;

        let dReq = cReq - pReq;
        let dTok = cTok - pTok;
        let dCost = cCost - pCost;
        let dIn = cIn - pIn;
        let dOut = cOut - pOut;

        // Granular restart detection
        if (dReq < 0 || dTok < 0) {
          dReq = cReq;
          dTok = cTok;
          dCost = cCost;
          dIn = cIn;
          dOut = cOut;
        }

        // False Start detection (new model with large history)
        const FALSE_START_COST_THRESHOLD = 10;
        if (dCost > FALSE_START_COST_THRESHOLD) {
          if (Math.abs(dCost - cCost) < 0.1) {
            console.warn(
              `Skipping False Start: $${dCost.toFixed(2)} for key ${key} (Snap ${snapshotId})`
            );
            // Adjust global increments
            incRequests -= dReq;
            incTokens -= dTok;
            incCost -= dCost;
            continue;
          }
        }

        if (dReq > 0 || dCost > 0) {
          const [modelName, endpoint] = key.split("|");

          // Add to Models
          if (!breakdownDeltas.models[modelName]) {
            breakdownDeltas.models[modelName] = {
              requests: 0,
              tokens: 0,
              cost: 0,
              input_tokens: 0,
              output_tokens: 0,
            };
          }
          breakdownDeltas.models[modelName].requests += dReq;
          breakdownDeltas.models[modelName].tokens += dTok;
          breakdownDeltas.models[modelName].cost += dCost;
          breakdownDeltas.models[modelName].input_tokens! += dIn;
          breakdownDeltas.models[modelName].output_tokens! += dOut;

          // Add to Endpoints
          if (!breakdownDeltas.endpoints[endpoint]) {
            breakdownDeltas.endpoints[endpoint] = {
              requests: 0,
              tokens: 0,
              cost: 0,
              models: {},
            };
          }
          breakdownDeltas.endpoints[endpoint].requests += dReq;
          breakdownDeltas.endpoints[endpoint].tokens += dTok;
          breakdownDeltas.endpoints[endpoint].cost += dCost;

          // Add to nested models within endpoint
          if (!breakdownDeltas.endpoints[endpoint].models[modelName]) {
            breakdownDeltas.endpoints[endpoint].models[modelName] = {
              requests: 0,
              tokens: 0,
              cost: 0,
            };
          }
          const mData = breakdownDeltas.endpoints[endpoint].models[modelName];
          mData.requests += dReq;
          mData.tokens += dTok;
          mData.cost += dCost;
        }
      }
    } else {
      // First snapshot ever - treat current as delta
      for (const r of modelRecords) {
        const modelName = r.model_name;
        const endpoint = r.api_endpoint || "unknown";
        const req = r.request_count || 0;
        const tok = r.total_tokens || 0;
        const cost = r.estimated_cost_usd || 0;
        const inTok = r.input_tokens || 0;
        const outTok = r.output_tokens || 0;

        if (!breakdownDeltas.models[modelName]) {
          breakdownDeltas.models[modelName] = {
            requests: 0,
            tokens: 0,
            cost: 0,
            input_tokens: 0,
            output_tokens: 0,
          };
        }
        breakdownDeltas.models[modelName].requests += req;
        breakdownDeltas.models[modelName].tokens += tok;
        breakdownDeltas.models[modelName].cost += cost;
        breakdownDeltas.models[modelName].input_tokens! += inTok;
        breakdownDeltas.models[modelName].output_tokens! += outTok;

        if (!breakdownDeltas.endpoints[endpoint]) {
          breakdownDeltas.endpoints[endpoint] = {
            requests: 0,
            tokens: 0,
            cost: 0,
            models: {},
          };
        }
        breakdownDeltas.endpoints[endpoint].requests += req;
        breakdownDeltas.endpoints[endpoint].tokens += tok;
        breakdownDeltas.endpoints[endpoint].cost += cost;

        if (!breakdownDeltas.endpoints[endpoint].models[modelName]) {
          breakdownDeltas.endpoints[endpoint].models[modelName] = {
            requests: 0,
            tokens: 0,
            cost: 0,
          };
        }
        const mData = breakdownDeltas.endpoints[endpoint].models[modelName];
        mData.requests += req;
        mData.tokens += tok;
        mData.cost += cost;
      }
    }

    // Calculate safe global increments from breakdown
    const safeIncCost = Object.values(breakdownDeltas.models).reduce(
      (sum, m) => sum + m.cost,
      0
    );
    const safeIncTokens = Object.values(breakdownDeltas.models).reduce(
      (sum, m) => sum + m.tokens,
      0
    );
    const safeIncRequests = Object.values(breakdownDeltas.models).reduce(
      (sum, m) => sum + m.requests,
      0
    );

    if (prevSnap) {
      // Adjust success/failure if we filtered out some requests
      if (incRequests > 0) {
        const ratio = safeIncRequests / incRequests;
        if (ratio < 0.99) {
          console.warn(
            `Adjusting global stats due to breakdown mismatch. Ratio: ${ratio.toFixed(4)}`
          );
          incSuccess = Math.floor(incSuccess * ratio);
          incFailure = Math.floor(incFailure * ratio);
        }
      }

      // Override global stats with breakdown sums
      incCost = safeIncCost;
      incTokens = safeIncTokens;
      incRequests = safeIncRequests;
    }

    // Get existing daily stats for today
    const existingDaily = getDailyStats(todayIso);
    const existingBreakdown: DailyStatsBreakdown = existingDaily
      ? JSON.parse(existingDaily.breakdown)
      : { models: {}, endpoints: {} };

    // Ensure structure
    if (!existingBreakdown.models) existingBreakdown.models = {};
    if (!existingBreakdown.endpoints) existingBreakdown.endpoints = {};

    // Merge Models
    for (const [m, data] of Object.entries(breakdownDeltas.models)) {
      if (!existingBreakdown.models[m]) {
        existingBreakdown.models[m] = {
          requests: 0,
          tokens: 0,
          cost: 0,
          input_tokens: 0,
          output_tokens: 0,
        };
      }
      const existing = existingBreakdown.models[m];
      existing.requests += data.requests;
      existing.tokens += data.tokens;
      existing.cost += data.cost;
      existing.input_tokens =
        (existing.input_tokens || 0) + (data.input_tokens || 0);
      existing.output_tokens =
        (existing.output_tokens || 0) + (data.output_tokens || 0);
    }

    // Merge Endpoints
    for (const [e, data] of Object.entries(breakdownDeltas.endpoints)) {
      if (!existingBreakdown.endpoints[e]) {
        existingBreakdown.endpoints[e] = {
          requests: 0,
          tokens: 0,
          cost: 0,
          models: {},
        };
      }
      const existing = existingBreakdown.endpoints[e];
      existing.requests += data.requests;
      existing.tokens += data.tokens;
      existing.cost += data.cost;

      if (!existing.models) existing.models = {};
      for (const [mName, mData] of Object.entries(data.models)) {
        if (!existing.models[mName]) {
          existing.models[mName] = { requests: 0, tokens: 0, cost: 0 };
        }
        existing.models[mName].requests += mData.requests;
        existing.models[mName].tokens += mData.tokens;
        existing.models[mName].cost += mData.cost;
      }
    }

    // Recalculate totals from merged breakdown (self-healing)
    const totalCostFromBreakdown = Object.values(
      existingBreakdown.models
    ).reduce((sum, m) => sum + m.cost, 0);
    const totalTokensFromBreakdown = Object.values(
      existingBreakdown.models
    ).reduce((sum, m) => sum + m.tokens, 0);
    const totalRequestsFromBreakdown = Object.values(
      existingBreakdown.models
    ).reduce((sum, m) => sum + m.requests, 0);

    const finalCost =
      totalCostFromBreakdown > 0
        ? totalCostFromBreakdown
        : (existingDaily?.estimated_cost_usd || 0) + incCost;
    const finalTokens =
      totalTokensFromBreakdown > 0
        ? totalTokensFromBreakdown
        : (existingDaily?.total_tokens || 0) + incTokens;
    const finalRequests =
      totalRequestsFromBreakdown > 0
        ? totalRequestsFromBreakdown
        : (existingDaily?.total_requests || 0) + incRequests;

    const dailyData: DailyStats = {
      stat_date: todayIso,
      total_requests: finalRequests,
      success_count: (existingDaily?.success_count || 0) + incSuccess,
      failure_count: (existingDaily?.failure_count || 0) + incFailure,
      total_tokens: finalTokens,
      estimated_cost_usd: finalCost,
      breakdown: JSON.stringify(existingBreakdown),
    };

    upsertDailyStats(dailyData);

    console.log(
      `Daily stats updated. Incremental: ${incRequests} req. Daily Total: ${dailyData.total_requests}`
    );
  }

  private getLocalDate(): string {
    const now = new Date();
    const offsetMs = this.config.timezoneOffset * 60 * 60 * 1000;
    const localTime = new Date(now.getTime() + offsetMs);
    return localTime.toISOString().split("T")[0];
  }
}
