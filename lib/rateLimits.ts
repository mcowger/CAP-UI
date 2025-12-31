/**
 * Rate Limits Client for Frontend
 * Manages rate limit configuration and status
 */

const API_BASE = '';

export interface RateLimitConfig {
  providers: Record<string, ProviderConfig>;
}

export interface ProviderConfig {
  name: string;
  icon: string;
  enabled: boolean;
  limits: LimitConfig[];
}

export interface LimitConfig {
  id: string | number;
  name: string;
  limit: number;
  unit: string;
  resetType: string;
  windowHours: number;
  resetTime?: string;
  backendStatus?: {
    percentage: number;
    nextReset?: string;
    label: string;
  };
}

/**
 * Load rate limits configuration from backend
 */
export async function loadRateLimitsConfig(): Promise<RateLimitConfig | null> {
  try {
    const res = await fetch(`${API_BASE}/api/data/rate-limits`);
    if (!res.ok) return null;
    return res.json();
  } catch (error) {
    console.error('Failed to load rate limits:', error);
    return null;
  }
}

/**
 * Save configuration to backend
 */
export async function saveConfig(config: RateLimitConfig): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/api/data/rate-limits`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config)
    });
    if (!res.ok) {
      console.error('Failed to save config:', await res.text());
      return false;
    }
    return true;
  } catch (error) {
    console.error('Failed to save rate limits:', error);
    return false;
  }
}

/**
 * Reset provider limits
 */
export async function resetProviderLimits(providerKey: string) {
  // This would need backend implementation
  console.log('Reset provider:', providerKey);
}

/**
 * Get color based on quota percentage
 */
export function getQuotaStatusColor(percentage: number): string {
  if (percentage === null || percentage === undefined) return '#6b7280';
  if (percentage >= 50) return '#10b981'; // Green (high remaining)
  if (percentage >= 20) return '#f59e0b'; // Orange
  return '#ef4444'; // Red
}

export function detectProvider(modelName: string): string {
  if (modelName.includes('gpt') || modelName.includes('o1')) return 'openai';
  if (modelName.includes('claude')) return 'anthropic';
  if (modelName.includes('gemini')) return 'google';
  return 'unknown';
}
