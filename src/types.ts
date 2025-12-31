// Types for the CLIProxy Usage Collector

export interface ModelPricing {
  input: number;
  output: number;
  vendor?: string;
}

export interface PricingMap {
  [modelId: string]: ModelPricing;
}

export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
}

export interface ModelDetail {
  tokens: TokenUsage;
  // Additional fields as needed
}

export interface ModelData {
  total_requests: number;
  total_tokens: number;
  details: ModelDetail[];
}

export interface ApiData {
  models: {
    [modelName: string]: ModelData;
  };
}

export interface UsageData {
  total_requests: number;
  success_count: number;
  failure_count: number;
  total_tokens: number;
  apis: {
    [apiEndpoint: string]: ApiData;
  };
}

export interface CLIProxyResponse {
  usage: UsageData;
}

export interface UsageSnapshot {
  id?: number;
  collected_at?: string;
  raw_data: string; // JSON string
  total_requests: number;
  success_count: number;
  failure_count: number;
  total_tokens: number;
  cumulative_cost_usd: number;
}

export interface ModelUsage {
  id?: number;
  snapshot_id: number;
  model_name: string;
  estimated_cost_usd: number;
  request_count: number;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  api_endpoint: string;
  created_at?: string;
}

export interface ModelBreakdown {
  requests: number;
  tokens: number;
  cost: number;
  input_tokens?: number;
  output_tokens?: number;
}

export interface EndpointBreakdown {
  requests: number;
  tokens: number;
  cost: number;
  models: {
    [modelName: string]: {
      requests: number;
      tokens: number;
      cost: number;
    };
  };
}

export interface DailyStatsBreakdown {
  models: {
    [modelName: string]: ModelBreakdown;
  };
  endpoints: {
    [endpoint: string]: EndpointBreakdown;
  };
}

export interface DailyStats {
  id?: number;
  stat_date: string;
  total_requests: number;
  success_count: number;
  failure_count: number;
  total_tokens: number;
  estimated_cost_usd: number;
  breakdown: string; // JSON string
}

export type ResetStrategy = 'daily' | 'weekly' | 'rolling';

export interface RateLimitConfig {
  id?: number;
  model_pattern: string;
  window_minutes: number;
  reset_strategy: ResetStrategy;
  token_limit: number | null;
  request_limit: number | null;
  reset_anchor_timestamp: string | null;
}

export interface RateLimitStatus {
  id?: number;
  config_id: number;
  remaining_tokens: number;
  remaining_requests: number;
  used_tokens: number;
  used_requests: number;
  percentage: number;
  status_label: string;
  window_start: string;
  last_updated: string;
  next_reset: string | null;
}

export interface Config {
  supabaseUrl?: string;
  supabaseKey?: string;
  cliproxyUrl: string;
  cliproxyManagementKey: string;
  collectorInterval: number;
  triggerPort: number;
  timezoneOffset: number;
  dbPath: string;
}

export interface UsageCalculation {
  total_tokens: number;
  request_count: number;
}

export interface SnapshotMap {
  [modelName: string]: {
    total_tokens: number;
    request_count: number;
  };
}
