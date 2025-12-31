/**
 * Configuration Context
 *
 * Manages CLIProxy configuration with TTL-based caching.
 * Provides config data, loading states, and update methods.
 */

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { managementApi, CLIProxyConfig } from '../lib/management-api';

const CONFIG_CACHE_TTL = 30000; // 30 seconds

interface ConfigState {
  config: CLIProxyConfig | null;
  loading: boolean;
  error: string | null;
  lastFetch: number | null;
}

interface ConfigContextValue extends ConfigState {
  fetchConfig: () => Promise<CLIProxyConfig>;
  updateConfigValue: (key: string, value: any) => void;
  clearCache: (key?: string) => void;
  refreshConfig: () => Promise<void>;
}

const ConfigContext = createContext<ConfigContextValue | undefined>(undefined);

export function ConfigProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ConfigState>({
    config: null,
    loading: false,
    error: null,
    lastFetch: null
  });

  // In-flight request tracking to prevent duplicate fetches
  let inFlightRequest: Promise<CLIProxyConfig> | null = null;

  const fetchConfig = useCallback(async (force = false): Promise<CLIProxyConfig> => {
    const now = Date.now();
    const cacheValid = state.lastFetch && (now - state.lastFetch < CONFIG_CACHE_TTL);

    // Return cached config if valid and not forcing refresh
    if (!force && cacheValid && state.config) {
      return state.config;
    }

    // Return in-flight request if one exists
    if (inFlightRequest && !force) {
      return inFlightRequest;
    }

    // Start new request
    setState(prev => ({ ...prev, loading: true, error: null }));

    inFlightRequest = managementApi.getConfig();

    try {
      const config = await inFlightRequest;

      setState({
        config,
        loading: false,
        error: null,
        lastFetch: Date.now()
      });

      return config;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch config';

      setState(prev => ({
        ...prev,
        loading: false,
        error: errorMessage
      }));

      throw error;
    } finally {
      inFlightRequest = null;
    }
  }, [state.lastFetch, state.config]);

  const updateConfigValue = useCallback((key: string, value: any) => {
    setState(prev => {
      if (!prev.config) return prev;

      // Handle nested keys (e.g., 'quota-exceeded.switch-project')
      const keys = key.split('.');
      if (keys.length === 1) {
        return {
          ...prev,
          config: {
            ...prev.config,
            [key]: value
          }
        };
      } else {
        // Handle nested updates
        const [parentKey, ...childKeys] = keys;
        const parent = prev.config[parentKey as keyof CLIProxyConfig] as any;

        return {
          ...prev,
          config: {
            ...prev.config,
            [parentKey]: {
              ...(typeof parent === 'object' ? parent : {}),
              [childKeys.join('.')]: value
            }
          }
        };
      }
    });
  }, []);

  const clearCache = useCallback((key?: string) => {
    if (key) {
      // Clear specific config key from cache
      setState(prev => ({ ...prev, lastFetch: null }));
    } else {
      // Clear entire cache
      setState(prev => ({
        ...prev,
        config: null,
        lastFetch: null,
        error: null
      }));
    }
  }, []);

  const refreshConfig = useCallback(async () => {
    await fetchConfig(true); // Force refresh
  }, [fetchConfig]);

  const value: ConfigContextValue = {
    ...state,
    fetchConfig,
    updateConfigValue,
    clearCache,
    refreshConfig
  };

  return (
    <ConfigContext.Provider value={value}>
      {children}
    </ConfigContext.Provider>
  );
}

export function useConfig() {
  const context = useContext(ConfigContext);
  if (context === undefined) {
    throw new Error('useConfig must be used within a ConfigProvider');
  }
  return context;
}

export default ConfigContext;
