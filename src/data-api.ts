/**
 * Data API for Frontend
 * Provides endpoints to fetch usage data
 */

import type { Config } from "./types";
import { getDatabase } from "./db";

/**
 * Get latest snapshot
 */
export function getLatestSnapshot() {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT * FROM usage_snapshots
    ORDER BY collected_at DESC
    LIMIT 1
  `);
  return stmt.get();
}

/**
 * Get daily stats with optional date filtering
 */
export function getDailyStats(startDate?: string, endDate?: string) {
  const db = getDatabase();

  let query = `SELECT * FROM daily_stats WHERE 1=1`;
  const params: any[] = [];

  if (startDate) {
    query += ` AND stat_date >= ?`;
    params.push(startDate);
  }

  if (endDate) {
    query += ` AND stat_date < ?`;
    params.push(endDate);
  }

  query += ` ORDER BY stat_date ASC`;

  const stmt = db.prepare(query);
  return stmt.all(...params);
}

/**
 * Get model usage aggregated from model_usage table
 */
export function getModelUsage(params: {
  startTime?: string;
  endTime?: string;
  startDate?: string;
  endDate?: string;
}) {
  const db = getDatabase();

  // Get all model_usage records in time range and aggregate
  let query = `
    SELECT
      model_name,
      SUM(request_count) as request_count,
      SUM(input_tokens) as input_tokens,
      SUM(output_tokens) as output_tokens,
      SUM(total_tokens) as total_tokens,
      SUM(estimated_cost_usd) as estimated_cost_usd
    FROM model_usage
    WHERE 1=1
  `;
  const queryParams: any[] = [];

  if (params.startTime) {
    query += ` AND created_at >= ?`;
    queryParams.push(params.startTime);
  }

  if (params.endTime) {
    query += ` AND created_at < ?`;
    queryParams.push(params.endTime);
  }

  query += ` GROUP BY model_name ORDER BY estimated_cost_usd DESC`;

  const stmt = db.prepare(query);
  return stmt.all(...queryParams);
}

/**
 * Get hourly stats (aggregated from snapshots for today)
 */
export function getHourlyStats(startTime?: string, endTime?: string) {
  const db = getDatabase();

  // Get snapshots and calculate hourly deltas
  let query = `
    SELECT
      strftime('%H', collected_at) as hour,
      SUM(total_requests) as requests,
      SUM(total_tokens) as tokens
    FROM usage_snapshots
    WHERE 1=1
  `;
  const params: any[] = [];

  if (startTime) {
    query += ` AND collected_at >= ?`;
    params.push(startTime);
  }

  if (endTime) {
    query += ` AND collected_at < ?`;
    params.push(endTime);
  }

  query += ` GROUP BY hour ORDER BY hour ASC`;

  const stmt = db.prepare(query);
  const results = stmt.all(...params) as any[];

  // Format for frontend
  return results.map((r: any) => ({
    time: `${r.hour.padStart(2, '0')}:00`,
    requests: r.requests || 0,
    tokens: r.tokens || 0,
    models: {} // Simplified - full implementation would aggregate by model
  }));
}

/**
 * Get endpoint usage (API keys)
 */
export function getEndpointUsage(params: {
  startTime?: string;
  endTime?: string;
  startDate?: string;
  endDate?: string;
}) {
  const db = getDatabase();

  let query = `
    SELECT
      api_endpoint,
      SUM(request_count) as request_count,
      SUM(total_tokens) as total_tokens,
      SUM(estimated_cost_usd) as estimated_cost_usd
    FROM model_usage
    WHERE 1=1
  `;
  const queryParams: any[] = [];

  if (params.startTime) {
    query += ` AND created_at >= ?`;
    queryParams.push(params.startTime);
  }

  if (params.endTime) {
    query += ` AND created_at < ?`;
    queryParams.push(params.endTime);
  }

  query += ` GROUP BY api_endpoint ORDER BY estimated_cost_usd DESC`;

  const stmt = db.prepare(query);
  return stmt.all(...queryParams);
}

/**
 * Get rate limits configuration
 */
export function getRateLimits() {
  const db = getDatabase();

  // Fetch configs and status
  const configStmt = db.prepare(`SELECT * FROM rate_limit_configs`);
  const statusStmt = db.prepare(`SELECT * FROM rate_limit_status`);

  const configs = configStmt.all() as any[];
  const statuses = statusStmt.all() as any[];

  // Create status map
  const statusMap = new Map(statuses.map(s => [s.config_id, s]));

  // Transform to UI structure - start with default providers
  const providers: any = {
    openai: {
      name: 'OpenAI Plus',
      icon: '🤖',
      enabled: true,
      limits: []
    },
    anthropic: {
      name: 'Anthropic Pro',
      icon: '🟣',
      enabled: true,
      limits: []
    },
    google: {
      name: 'Google AI Pro',
      icon: '💎',
      enabled: true,
      limits: []
    }
  };

  const providerIcons: any = {
    'OpenAI': '🤖',
    'Anthropic': '🟣',
    'Google': '💎'
  };

  configs.forEach((conf: any) => {
    const providerKey = (conf.model_pattern || 'unknown').toLowerCase().includes('gpt') ? 'openai' :
                        (conf.model_pattern || 'unknown').toLowerCase().includes('claude') ? 'anthropic' :
                        (conf.model_pattern || 'unknown').toLowerCase().includes('gemini') ? 'google' : 'unknown';

    // If unknown provider, create it (providers are pre-populated for known ones)
    if (!providers[providerKey]) {
      providers[providerKey] = {
        name: conf.model_pattern || 'Unknown',
        icon: '🔌',
        enabled: true,
        limits: []
      };
    }

    const status = statusMap.get(conf.id);
    let percentage = 100;
    let usedLabel = 'Unknown';

    if (conf.token_limit && status) {
      const remaining = status.remaining_tokens || 0;
      percentage = Math.round((remaining / conf.token_limit) * 100);
      const used = conf.token_limit - remaining;
      usedLabel = `${Math.round(used / 1000)}k / ${Math.round(conf.token_limit / 1000)}k`;
    } else if (conf.request_limit && status) {
      const remaining = status.remaining_requests || 0;
      percentage = Math.round((remaining / conf.request_limit) * 100);
      const used = conf.request_limit - remaining;
      usedLabel = `${used} / ${conf.request_limit}`;
    }

    providers[providerKey].limits.push({
      id: conf.id,
      name: conf.model_pattern || 'All Models',
      limit: conf.token_limit || conf.request_limit || 0,
      unit: conf.token_limit ? 'tokens' : 'requests',
      resetType: conf.reset_strategy,
      windowHours: Math.round((conf.window_minutes || 0) / 60),
      backendStatus: {
        percentage,
        nextReset: status?.next_reset,
        label: usedLabel
      }
    });
  });

  return { providers };
}

/**
 * Save rate limits configuration
 */
export function saveRateLimits(config: any) {
  const db = getDatabase();

  try {
    // Get existing config IDs
    const existingStmt = db.prepare(`SELECT id FROM rate_limit_configs`);
    const existingRows = existingStmt.all() as any[];
    const existingIds = new Set(existingRows.map(r => r.id));
    const keptIds = new Set();

    // Map provider names
    const providerNameMap: any = {
      'openai': 'OpenAI',
      'anthropic': 'Anthropic',
      'google': 'Google'
    };

    // Process each provider
    Object.entries(config.providers).forEach(([providerKey, provider]: [string, any]) => {
      if (!provider.limits) return;

      provider.limits.forEach((limit: any) => {
        const providerName = providerNameMap[providerKey] || providerKey;
        const isNew = typeof limit.id === 'string' && limit.id.startsWith('limit_');

        const row: any = {
          model_pattern: limit.name || 'All Models',
          reset_strategy: limit.resetType || 'rolling',
          window_minutes: (limit.windowHours || 1) * 60,
          token_limit: null,
          request_limit: null
        };

        // Set limit based on unit
        if (limit.unit === 'tokens') {
          row.token_limit = parseInt(limit.limit) || 0;
        } else {
          row.request_limit = parseInt(limit.limit) || 0;
        }

        if (!isNew && typeof limit.id === 'number') {
          // Update existing
          row.id = limit.id;
          keptIds.add(limit.id);

          const updateStmt = db.prepare(`
            UPDATE rate_limit_configs
            SET model_pattern = ?, reset_strategy = ?, window_minutes = ?,
                token_limit = ?, request_limit = ?
            WHERE id = ?
          `);
          updateStmt.run(
            row.model_pattern,
            row.reset_strategy,
            row.window_minutes,
            row.token_limit,
            row.request_limit,
            row.id
          );
        } else {
          // Insert new
          const insertStmt = db.prepare(`
            INSERT INTO rate_limit_configs (model_pattern, reset_strategy, window_minutes, token_limit, request_limit)
            VALUES (?, ?, ?, ?, ?)
          `);
          const result = insertStmt.run(
            row.model_pattern,
            row.reset_strategy,
            row.window_minutes,
            row.token_limit,
            row.request_limit
          );
          keptIds.add(result.lastInsertRowid);
        }
      });
    });

    // Delete removed limits
    const idsToDelete = [...existingIds].filter(id => !keptIds.has(id));
    if (idsToDelete.length > 0) {
      const deleteStmt = db.prepare(`DELETE FROM rate_limit_configs WHERE id = ?`);
      idsToDelete.forEach(id => deleteStmt.run(id));
    }

    return { success: true };
  } catch (error) {
    console.error('Failed to save rate limits:', error);
    return { success: false, error: String(error) };
  }
}
