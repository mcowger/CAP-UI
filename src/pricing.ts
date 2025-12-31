import type { ModelPricing, PricingMap } from "./types";

const LLM_PRICES_URL = "https://www.llm-prices.com/current-v1.json";
const CACHE_DURATION_MS = 3600 * 1000; // 1 hour

// Default pricing (USD per 1M tokens) - Updated Dec 2024
const DEFAULT_PRICING: PricingMap = {
  "gpt-4o": { input: 2.5, output: 10.0 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4-turbo": { input: 10.0, output: 30.0 },
  "gpt-4": { input: 30.0, output: 60.0 },
  "gpt-3.5-turbo": { input: 0.5, output: 1.5 },
  o1: { input: 15.0, output: 60.0 },
  "o1-mini": { input: 3.0, output: 12.0 },
  "o1-preview": { input: 15.0, output: 60.0 },
  o3: { input: 15.0, output: 60.0 },
  "o3-mini": { input: 1.1, output: 4.4 },
  "claude-sonnet-4": { input: 3.0, output: 15.0 },
  "claude-4-sonnet": { input: 3.0, output: 15.0 },
  "claude-opus-4": { input: 15.0, output: 75.0 },
  "claude-4-opus": { input: 15.0, output: 75.0 },
  "claude-3-5-sonnet": { input: 3.0, output: 15.0 },
  "claude-3.5-sonnet": { input: 3.0, output: 15.0 },
  "claude-3-5-haiku": { input: 0.8, output: 4.0 },
  "claude-3.5-haiku": { input: 0.8, output: 4.0 },
  "claude-3-sonnet": { input: 3.0, output: 15.0 },
  "claude-3-opus": { input: 15.0, output: 75.0 },
  "claude-3-haiku": { input: 0.25, output: 1.25 },
  "claude-sonnet": { input: 3.0, output: 15.0 },
  "claude-opus": { input: 15.0, output: 75.0 },
  "claude-haiku": { input: 0.8, output: 4.0 },
  "gemini-2.5-pro": { input: 1.25, output: 10.0 },
  "gemini-2.5-flash": { input: 0.075, output: 0.3 },
  "gemini-2.5-flash-preview": { input: 0.075, output: 0.3 },
  "gemini-2.0-flash": { input: 0.1, output: 0.4 },
  "gemini-2.0-flash-lite": { input: 0.075, output: 0.3 },
  "gemini-2.0-flash-exp": { input: 0.1, output: 0.4 },
  "gemini-1.5-pro": { input: 1.25, output: 5.0 },
  "gemini-1.5-flash": { input: 0.075, output: 0.3 },
  _default: { input: 0.15, output: 0.6 },
};

let remotePricingCache: PricingMap = {};
let remotePricingLastFetch = 0;

export async function fetchRemotePricing(): Promise<PricingMap> {
  // Return cached data if still fresh
  if (
    Object.keys(remotePricingCache).length > 0 &&
    Date.now() - remotePricingLastFetch < CACHE_DURATION_MS
  ) {
    return remotePricingCache;
  }

  try {
    console.log("Fetching latest pricing from llm-prices.com...");
    const response = await fetch(LLM_PRICES_URL, {
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    const pricing: PricingMap = {};

    if (data.prices && Array.isArray(data.prices)) {
      for (const item of data.prices) {
        if (
          item.id &&
          item.input !== null &&
          item.input !== undefined &&
          item.output !== null &&
          item.output !== undefined
        ) {
          pricing[item.id.toLowerCase()] = {
            input: parseFloat(item.input),
            output: parseFloat(item.output),
            vendor: item.vendor || "unknown",
          };
        }
      }
    }

    if (Object.keys(pricing).length > 0) {
      remotePricingCache = pricing;
      remotePricingLastFetch = Date.now();
      console.log(`Fetched pricing for ${Object.keys(pricing).length} models`);
      return pricing;
    }
  } catch (error) {
    console.warn(`Could not fetch remote pricing: ${error}`);
  }

  return {};
}

export async function getModelPricing(): Promise<PricingMap> {
  const remotePricing = await fetchRemotePricing();

  if (Object.keys(remotePricing).length > 0) {
    return { ...DEFAULT_PRICING, ...remotePricing };
  }

  return DEFAULT_PRICING;
}

export function findPricingForModel(
  modelName: string,
  pricing: PricingMap
): { pricing: ModelPricing; matched: boolean } {
  const modelLower = modelName.toLowerCase();

  // Exact match
  if (pricing[modelLower]) {
    return { pricing: pricing[modelLower], matched: true };
  }

  // Partial match (pattern matching)
  for (const [pattern, prices] of Object.entries(pricing)) {
    if (pattern === "_default") continue;

    if (pattern.includes(modelLower) || modelLower.includes(pattern)) {
      return { pricing: prices, matched: true };
    }
  }

  // Default pricing
  return {
    pricing: pricing._default || { input: 0.15, output: 0.6 },
    matched: false,
  };
}

export function calculateCost(
  inputTokens: number,
  outputTokens: number,
  pricing: ModelPricing
): number {
  return (
    (inputTokens / 1_000_000) * pricing.input +
    (outputTokens / 1_000_000) * pricing.output
  );
}
