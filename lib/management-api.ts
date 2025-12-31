/**
 * CLIProxy Management API Client
 *
 * Complete client for all CLIProxy Management API endpoints.
 * Uses native fetch API with error handling and type safety.
 */

const BASE_URL = '/v0/management';

// ============================================================================
// Types
// ============================================================================

export interface CLIProxyConfig {
  debug?: boolean;
  'proxy-url'?: string;
  'request-retry'?: number;
  'quota-exceeded'?: {
    'switch-project'?: boolean;
    'switch-preview-model'?: boolean;
  };
  'usage-statistics-enabled'?: boolean;
  'request-log'?: boolean;
  'logging-to-file'?: boolean;
  'ws-auth'?: boolean;
  'api-keys'?: string[];
  'gemini-api-key'?: GeminiKeyConfig[];
  'codex-api-key'?: ProviderKeyConfig[];
  'claude-api-key'?: ProviderKeyConfig[];
  'openai-compatibility'?: OpenAIProviderConfig[];
  'oauth-excluded-models'?: Record<string, string[]>;
}

export interface GeminiKeyConfig {
  'api-key': string;
  prefix?: string;
  'base-url'?: string;
  headers?: Record<string, string>;
  'excluded-models'?: string[];
}

export interface ProviderKeyConfig {
  'api-key': string;
  prefix?: string;
  'base-url'?: string;
  'proxy-url'?: string;
  headers?: Record<string, string>;
  models?: ModelAlias[];
  'excluded-models'?: string[];
}

export interface ModelAlias {
  name: string;
  alias?: string;
  priority?: number;
  'test-model'?: string;
}

export interface OpenAIProviderConfig {
  name: string;
  'base-url': string;
  'api-key-entries': Array<{
    'api-key': string;
    'proxy-url'?: string;
    headers?: Record<string, string>;
  }>;
  prefix?: string;
  headers?: Record<string, string>;
  models?: ModelAlias[];
  priority?: number;
  'test-model'?: string;
}

export interface AuthFile {
  name: string;
  type?: string;
  provider?: string;
  size?: number;
  auth_index?: string | number;
  runtime_only?: boolean;
  disabled?: boolean;
  modified?: number;
}

export interface OAuthStartResponse {
  url: string;
  state?: string;
  device_code?: string;
  user_code?: string;
  verification_uri?: string;
}

export interface OAuthStatusResponse {
  status: 'ok' | 'wait' | 'error';
  error?: string;
}

export interface ApiCallRequest {
  authIndex?: string;
  method: string;
  url: string;
  header?: Record<string, string>;
  data?: string;
}

export interface ApiCallResponse {
  status_code: number;
  header: Record<string, string[]>;
  body: any | string;
}

export interface ClaudeCodeQuotaInfo {
  unified_status: string;
  five_hour_status: string;
  five_hour_reset: number;
  five_hour_utilization: number;
  seven_day_status: string;
  seven_day_reset: number;
  seven_day_utilization: number;
  overage_status: string;
  overage_reset: number;
  overage_utilization: number;
  representative_claim: string;
  fallback_percentage: number;
  unified_reset: number;
  last_updated: string;
}

export interface ClaudeCodeQuotaResponse {
  auth_id: string;
  email: string;
  label: string;
  quota: ClaudeCodeQuotaInfo;
}

// ============================================================================
// Error Handling
// ============================================================================

class ManagementAPIError extends Error {
  constructor(
    message: string,
    public status?: number,
    public response?: any
  ) {
    super(message);
    this.name = 'ManagementAPIError';
  }
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let errorMessage = `HTTP ${response.status}`;

    try {
      const errorData = await response.json();
      errorMessage = errorData.error || errorData.message || errorMessage;
    } catch {
      // Response body not JSON
      try {
        errorMessage = await response.text();
      } catch {
        // Could not read response text
      }
    }

    throw new ManagementAPIError(
      errorMessage,
      response.status,
      response
    );
  }

  const contentType = response.headers.get('content-type');

  if (contentType?.includes('application/json')) {
    return response.json();
  } else if (contentType?.includes('text/yaml') || contentType?.includes('application/yaml')) {
    const text = await response.text();
    return text as unknown as T;
  } else {
    return response.text() as unknown as T;
  }
}

// ============================================================================
// Management API Client
// ============================================================================

export class ManagementAPI {
  private baseUrl: string;

  constructor(baseUrl: string = BASE_URL) {
    this.baseUrl = baseUrl;
  }

  // ==========================================================================
  // Configuration Management
  // ==========================================================================

  async getConfig(): Promise<CLIProxyConfig> {
    const response = await fetch(`${this.baseUrl}/config`);
    return handleResponse(response);
  }

  async updateDebug(value: boolean): Promise<void> {
    const response = await fetch(`${this.baseUrl}/debug`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value })
    });
    await handleResponse(response);
  }

  async updateProxyUrl(value: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/proxy-url`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value })
    });
    await handleResponse(response);
  }

  async clearProxyUrl(): Promise<void> {
    const response = await fetch(`${this.baseUrl}/proxy-url`, {
      method: 'DELETE'
    });
    await handleResponse(response);
  }

  async updateRequestRetry(value: number): Promise<void> {
    const response = await fetch(`${this.baseUrl}/request-retry`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value })
    });
    await handleResponse(response);
  }

  async updateSwitchProject(value: boolean): Promise<void> {
    const response = await fetch(`${this.baseUrl}/quota-exceeded/switch-project`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value })
    });
    await handleResponse(response);
  }

  async updateSwitchPreviewModel(value: boolean): Promise<void> {
    const response = await fetch(`${this.baseUrl}/quota-exceeded/switch-preview-model`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value })
    });
    await handleResponse(response);
  }

  async updateUsageStatistics(value: boolean): Promise<void> {
    const response = await fetch(`${this.baseUrl}/usage-statistics-enabled`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value })
    });
    await handleResponse(response);
  }

  async updateRequestLog(value: boolean): Promise<void> {
    const response = await fetch(`${this.baseUrl}/request-log`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value })
    });
    await handleResponse(response);
  }

  async updateLoggingToFile(value: boolean): Promise<void> {
    const response = await fetch(`${this.baseUrl}/logging-to-file`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value })
    });
    await handleResponse(response);
  }

  async updateWsAuth(value: boolean): Promise<void> {
    const response = await fetch(`${this.baseUrl}/ws-auth`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value })
    });
    await handleResponse(response);
  }

  // ==========================================================================
  // API Keys Management
  // ==========================================================================

  async getApiKeys(): Promise<string[]> {
    const response = await fetch(`${this.baseUrl}/api-keys`);
    const data = await handleResponse<{ 'api-keys'?: string[], apiKeys?: string[] }>(response);
    return data['api-keys'] || data.apiKeys || [];
  }

  async updateApiKeys(keys: string[]): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api-keys`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(keys)
    });
    await handleResponse(response);
  }

  async patchApiKey(index: number, value: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api-keys`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ index, value })
    });
    await handleResponse(response);
  }

  async deleteApiKey(index: number): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api-keys?index=${index}`, {
      method: 'DELETE'
    });
    await handleResponse(response);
  }

  // ==========================================================================
  // Gemini Provider Management
  // ==========================================================================

  async getGeminiKeys(): Promise<GeminiKeyConfig[]> {
    const response = await fetch(`${this.baseUrl}/gemini-api-key`);
    const data = await handleResponse<{ 'gemini-api-key': GeminiKeyConfig[] }>(response);
    return data['gemini-api-key'] || [];
  }

  async updateGeminiKeys(configs: GeminiKeyConfig[]): Promise<void> {
    const response = await fetch(`${this.baseUrl}/gemini-api-key`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(configs)
    });
    await handleResponse(response);
  }

  async patchGeminiKey(index: number, value: GeminiKeyConfig): Promise<void> {
    const response = await fetch(`${this.baseUrl}/gemini-api-key`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ index, value })
    });
    await handleResponse(response);
  }

  async deleteGeminiKey(apiKey: string): Promise<void> {
    const encoded = encodeURIComponent(apiKey);
    const response = await fetch(`${this.baseUrl}/gemini-api-key?api-key=${encoded}`, {
      method: 'DELETE'
    });
    await handleResponse(response);
  }

  // ==========================================================================
  // Codex Provider Management
  // ==========================================================================

  async getCodexKeys(): Promise<ProviderKeyConfig[]> {
    const response = await fetch(`${this.baseUrl}/codex-api-key`);
    const data = await handleResponse<{ 'codex-api-key': ProviderKeyConfig[] }>(response);
    return data['codex-api-key'] || [];
  }

  async updateCodexKeys(configs: ProviderKeyConfig[]): Promise<void> {
    const response = await fetch(`${this.baseUrl}/codex-api-key`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(configs)
    });
    await handleResponse(response);
  }

  async patchCodexKey(index: number, value: ProviderKeyConfig): Promise<void> {
    const response = await fetch(`${this.baseUrl}/codex-api-key`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ index, value })
    });
    await handleResponse(response);
  }

  async deleteCodexKey(apiKey: string): Promise<void> {
    const encoded = encodeURIComponent(apiKey);
    const response = await fetch(`${this.baseUrl}/codex-api-key?api-key=${encoded}`, {
      method: 'DELETE'
    });
    await handleResponse(response);
  }

  // ==========================================================================
  // Claude Provider Management
  // ==========================================================================

  async getClaudeKeys(): Promise<ProviderKeyConfig[]> {
    const response = await fetch(`${this.baseUrl}/claude-api-key`);
    const data = await handleResponse<{ 'claude-api-key': ProviderKeyConfig[] }>(response);
    return data['claude-api-key'] || [];
  }

  async updateClaudeKeys(configs: ProviderKeyConfig[]): Promise<void> {
    const response = await fetch(`${this.baseUrl}/claude-api-key`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(configs)
    });
    await handleResponse(response);
  }

  async patchClaudeKey(index: number, value: ProviderKeyConfig): Promise<void> {
    const response = await fetch(`${this.baseUrl}/claude-api-key`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ index, value })
    });
    await handleResponse(response);
  }

  async deleteClaudeKey(apiKey: string): Promise<void> {
    const encoded = encodeURIComponent(apiKey);
    const response = await fetch(`${this.baseUrl}/claude-api-key?api-key=${encoded}`, {
      method: 'DELETE'
    });
    await handleResponse(response);
  }

  // ==========================================================================
  // OpenAI Compatibility Provider Management
  // ==========================================================================

  async getOpenAIProviders(): Promise<OpenAIProviderConfig[]> {
    const response = await fetch(`${this.baseUrl}/openai-compatibility`);
    const data = await handleResponse<{ 'openai-compatibility': OpenAIProviderConfig[] }>(response);
    return data['openai-compatibility'] || [];
  }

  async updateOpenAIProviders(configs: OpenAIProviderConfig[]): Promise<void> {
    const response = await fetch(`${this.baseUrl}/openai-compatibility`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(configs)
    });
    await handleResponse(response);
  }

  async patchOpenAIProvider(index: number, value: OpenAIProviderConfig): Promise<void> {
    const response = await fetch(`${this.baseUrl}/openai-compatibility`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ index, value })
    });
    await handleResponse(response);
  }

  async deleteOpenAIProvider(name: string): Promise<void> {
    const encoded = encodeURIComponent(name);
    const response = await fetch(`${this.baseUrl}/openai-compatibility?name=${encoded}`, {
      method: 'DELETE'
    });
    await handleResponse(response);
  }

  // ==========================================================================
  // Auth Files Management
  // ==========================================================================

  async listAuthFiles(): Promise<AuthFile[]> {
    const response = await fetch(`${this.baseUrl}/auth-files`);
    const data = await handleResponse<{ files: AuthFile[] }>(response);
    return data.files || [];
  }

  async uploadAuthFile(file: File): Promise<any> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${this.baseUrl}/auth-files`, {
      method: 'POST',
      body: formData
    });
    return handleResponse(response);
  }

  async deleteAuthFile(name: string): Promise<void> {
    const encoded = encodeURIComponent(name);
    const response = await fetch(`${this.baseUrl}/auth-files?name=${encoded}`, {
      method: 'DELETE'
    });
    await handleResponse(response);
  }

  async deleteAllAuthFiles(): Promise<void> {
    const response = await fetch(`${this.baseUrl}/auth-files?all=true`, {
      method: 'DELETE'
    });
    await handleResponse(response);
  }

  async downloadAuthFile(name: string): Promise<Blob> {
    const encoded = encodeURIComponent(name);
    const response = await fetch(`${this.baseUrl}/auth-files/download?name=${encoded}`);

    if (!response.ok) {
      throw new ManagementAPIError(
        `Failed to download file: HTTP ${response.status}`,
        response.status
      );
    }

    return response.blob();
  }

  async getAuthFileModels(name: string): Promise<any[]> {
    const encoded = encodeURIComponent(name);
    const response = await fetch(`${this.baseUrl}/auth-files/models?name=${encoded}`);
    const data = await handleResponse<{ models: any[] }>(response);
    return data.models || [];
  }

  // ==========================================================================
  // OAuth Management
  // ==========================================================================

  async startOAuth(provider: string, params?: Record<string, string>): Promise<OAuthStartResponse> {
    const queryString = params ? '?' + new URLSearchParams(params).toString() : '';
    const response = await fetch(`${this.baseUrl}/${provider}-auth-url${queryString}`);
    return handleResponse(response);
  }

  async pollOAuthStatus(state: string): Promise<OAuthStatusResponse> {
    const response = await fetch(`${this.baseUrl}/get-auth-status?state=${encodeURIComponent(state)}`);
    return handleResponse(response);
  }

  async submitOAuthCallback(provider: string, redirectUrl: string): Promise<any> {
    // Normalize provider name (gemini-cli -> gemini)
    const normalizedProvider = provider.replace('-cli', '');

    const response = await fetch(`${this.baseUrl}/oauth-callback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: normalizedProvider,
        redirect_url: redirectUrl
      })
    });
    return handleResponse(response);
  }

  async submitIFlowAuth(cookie: string): Promise<any> {
    const response = await fetch(`${this.baseUrl}/iflow-auth-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cookie })
    });
    return handleResponse(response);
  }

  // ==========================================================================
  // OAuth Excluded Models
  // ==========================================================================

  async getOAuthExcludedModels(): Promise<Record<string, string[]>> {
    const response = await fetch(`${this.baseUrl}/oauth-excluded-models`);
    const data = await handleResponse<{ 'oauth-excluded-models': Record<string, string[]> }>(response);
    return data['oauth-excluded-models'] || {};
  }

  async updateOAuthExcludedModels(provider: string, models: string[]): Promise<void> {
    const response = await fetch(`${this.baseUrl}/oauth-excluded-models`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, models })
    });
    await handleResponse(response);
  }

  async deleteOAuthExcludedModels(provider: string): Promise<void> {
    const encoded = encodeURIComponent(provider);
    const response = await fetch(`${this.baseUrl}/oauth-excluded-models?provider=${encoded}`, {
      method: 'DELETE'
    });
    await handleResponse(response);
  }

  // ==========================================================================
  // Config YAML Management
  // ==========================================================================

  async getConfigYaml(): Promise<string> {
    const response = await fetch(`${this.baseUrl}/config.yaml`, {
      headers: { 'Accept': 'application/yaml, text/yaml, text/plain' }
    });
    return handleResponse(response);
  }

  async updateConfigYaml(yamlContent: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/config.yaml`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/yaml',
        'Accept': 'application/json, text/plain, */*'
      },
      body: yamlContent
    });
    await handleResponse(response);
  }

  // ==========================================================================
  // API Call Proxy (for quota checks, etc.)
  // ==========================================================================

  async proxyApiCall(request: ApiCallRequest): Promise<ApiCallResponse> {
    const response = await fetch(`${this.baseUrl}/api-call`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request)
    });
    return handleResponse(response);
  }

  // ==========================================================================
  // Logs Management
  // ==========================================================================

  async getLogs(after?: number): Promise<{ lines: string[], 'line-count': number, 'latest-timestamp': number }> {
    const queryString = after ? `?after=${after}` : '';
    const response = await fetch(`${this.baseUrl}/logs${queryString}`);
    return handleResponse(response);
  }

  async clearLogs(): Promise<void> {
    const response = await fetch(`${this.baseUrl}/logs`, {
      method: 'DELETE'
    });
    await handleResponse(response);
  }

  async getErrorLogFiles(): Promise<Array<{ name: string, size?: number, modified?: number }>> {
    const response = await fetch(`${this.baseUrl}/request-error-logs`);
    const data = await handleResponse<{ files?: Array<{ name: string, size?: number, modified?: number }> }>(response);
    return data.files || [];
  }

  async downloadErrorLog(filename: string): Promise<Blob> {
    const encoded = encodeURIComponent(filename);
    const response = await fetch(`${this.baseUrl}/request-error-logs/${encoded}`);

    if (!response.ok) {
      throw new ManagementAPIError(
        `Failed to download error log: HTTP ${response.status}`,
        response.status
      );
    }

    return response.blob();
  }

  // ==========================================================================
  // Claude Code Quota Management
  // ==========================================================================

  async getClaudeCodeQuota(authId: string): Promise<ClaudeCodeQuotaResponse> {
    const encoded = encodeURIComponent(authId);
    const response = await fetch(`${this.baseUrl}/claude-api-key/quota/${encoded}`);
    return handleResponse(response);
  }

  async refreshClaudeCodeQuota(authId: string): Promise<ClaudeCodeQuotaResponse> {
    const encoded = encodeURIComponent(authId);
    const response = await fetch(`${this.baseUrl}/claude-api-key/quota/${encoded}/refresh`, {
      method: 'POST'
    });
    return handleResponse(response);
  }
}

// ==========================================================================
// Singleton Instance
// ==========================================================================

export const managementApi = new ManagementAPI();
export default managementApi;
