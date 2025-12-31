/**
 * Database Client for Frontend
 * Provides a simple API to fetch data from the Bun server
 */

const API_BASE = '';  // Same origin

interface QueryParams {
  startTime?: string;
  endTime?: string;
  startDate?: string;
  endDate?: string;
}

export const dbClient = {
  /**
   * Fetch latest usage snapshot
   */
  async getLatestSnapshot() {
    const res = await fetch(`${API_BASE}/api/data/latest-snapshot`);
    if (!res.ok) return null;
    return res.json();
  },

  /**
   * Fetch daily stats with optional date range
   */
  async getDailyStats(params: QueryParams = {}) {
    const query = new URLSearchParams();
    if (params.startDate) query.append('startDate', params.startDate);
    if (params.endDate) query.append('endDate', params.endDate);

    const res = await fetch(`${API_BASE}/api/data/daily-stats?${query}`);
    if (!res.ok) return [];
    return res.json();
  },

  /**
   * Fetch model usage aggregated by model
   */
  async getModelUsage(params: QueryParams = {}) {
    const query = new URLSearchParams();
    if (params.startTime) query.append('startTime', params.startTime);
    if (params.endTime) query.append('endTime', params.endTime);
    if (params.startDate) query.append('startDate', params.startDate);
    if (params.endDate) query.append('endDate', params.endDate);

    const res = await fetch(`${API_BASE}/api/data/model-usage?${query}`);
    if (!res.ok) return [];
    return res.json();
  },

  /**
   * Fetch hourly stats for today or yesterday
   */
  async getHourlyStats(params: QueryParams = {}) {
    const query = new URLSearchParams();
    if (params.startTime) query.append('startTime', params.startTime);
    if (params.endTime) query.append('endTime', params.endTime);

    const res = await fetch(`${API_BASE}/api/data/hourly-stats?${query}`);
    if (!res.ok) return [];
    return res.json();
  },

  /**
   * Fetch endpoint usage (API keys)
   */
  async getEndpointUsage(params: QueryParams = {}) {
    const query = new URLSearchParams();
    if (params.startTime) query.append('startTime', params.startTime);
    if (params.endTime) query.append('endTime', params.endTime);
    if (params.startDate) query.append('startDate', params.startDate);
    if (params.endDate) query.append('endDate', params.endDate);

    const res = await fetch(`${API_BASE}/api/data/endpoint-usage?${query}`);
    if (!res.ok) return [];
    return res.json();
  },

  /**
   * Trigger collector manually
   */
  async triggerCollector() {
    try {
      const res = await fetch(`${API_BASE}/api/collector/trigger`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) return false;
      const result = await res.json();
      return result.message !== undefined;
    } catch (error) {
      console.error('Failed to trigger collector:', error);
      return false;
    }
  }
};
