/**
 * Quota Management Page
 *
 * Displays quota information from different AI providers:
 * - Antigravity (Google)
 * - Codex/ChatGPT
 * - Gemini CLI
 *
 * Fetches quota via API proxy for each auth file.
 */

import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useNotification } from '../../contexts/NotificationContext';
import { managementApi, AuthFile, ClaudeCodeQuotaInfo } from '../../lib/management-api';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/EmptyState';
import { Gauge } from '../Icons';

type ProviderTab = 'antigravity' | 'codex' | 'gemini-cli' | 'claude-code';

interface QuotaData {
    authFile: string;
    authIndex: string | number;
    data: any;
    error?: string;
}

export function QuotaPage() {
    const { connectionStatus } = useAuth();
    const { showNotification } = useNotification();

    const [activeTab, setActiveTab] = useState<ProviderTab>('antigravity');
    const [authFiles, setAuthFiles] = useState<AuthFile[]>([]);
    const [quotaData, setQuotaData] = useState<QuotaData[]>([]);
    const [loading, setLoading] = useState(true);
    const [fetching, setFetching] = useState(false);

    const disableControls = connectionStatus !== 'connected';

    // Load auth files
    useEffect(() => {
        loadAuthFiles();
    }, []);

    const loadAuthFiles = async () => {
        setLoading(true);
        try {
            const files = await managementApi.listAuthFiles();
            setAuthFiles(files);
        } catch (error) {
            showNotification(
                `Failed to load auth files: ${error instanceof Error ? error.message : 'Unknown error'}`,
                'error'
            );
        } finally {
            setLoading(false);
        }
    };

    // Filter auth files by provider
    const getRelevantAuthFiles = (): AuthFile[] => {
        const providerMap: Record<ProviderTab, string[]> = {
            'antigravity': ['antigravity', 'google'],
            'codex': ['codex', 'chatgpt', 'openai'],
            'gemini-cli': ['gemini', 'gemini-cli'],
            'claude-code': ['claude', 'anthropic']
        };

        const relevantProviders = providerMap[activeTab];
        return authFiles.filter(file =>
            relevantProviders.some(p =>
                file.provider?.toLowerCase().includes(p) ||
                file.type?.toLowerCase().includes(p) ||
                file.name?.toLowerCase().includes(p)
            )
        );
    };

    // Fetch quota for a specific provider
    const fetchQuota = async (authFile: AuthFile) => {
        if (!authFile.auth_index && activeTab !== 'claude-code') {
            return { authFile: authFile.name, authIndex: 'unknown', data: null, error: 'No auth index' };
        }

        try {
            let response;

            switch (activeTab) {
                case 'antigravity':
                    response = await managementApi.proxyApiCall({
                        authIndex: String(authFile.auth_index),
                        method: 'POST',
                        url: 'https://daily-cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels'
                    });
                    return {
                        authFile: authFile.name,
                        authIndex: authFile.auth_index,
                        data: response.body,
                        error: undefined
                    };

                case 'codex':
                    response = await managementApi.proxyApiCall({
                        authIndex: String(authFile.auth_index),
                        method: 'GET',
                        url: 'https://chatgpt.com/backend-api/wham/usage'
                    });
                    return {
                        authFile: authFile.name,
                        authIndex: authFile.auth_index,
                        data: response.body,
                        error: undefined
                    };

                case 'gemini-cli':
                    response = await managementApi.proxyApiCall({
                        authIndex: String(authFile.auth_index),
                        method: 'POST',
                        url: 'https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuota'
                    });
                    return {
                        authFile: authFile.name,
                        authIndex: authFile.auth_index,
                        data: response.body,
                        error: undefined
                    };

                case 'claude-code':
                    // Claude Code uses dedicated endpoint, not generic api-call proxy
                    const claudeResponse = await managementApi.getClaudeCodeQuota(authFile.name);
                    return {
                        authFile: authFile.name,
                        authIndex: claudeResponse.auth_id,
                        data: claudeResponse,
                        error: undefined
                    };

                default:
                    throw new Error('Unknown provider');
            }
        } catch (error) {
            return {
                authFile: authFile.name,
                authIndex: authFile.auth_index || 'unknown',
                data: null,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    };

    // Fetch all quotas for current tab
    const fetchAllQuotas = async () => {
        setFetching(true);
        const relevant = getRelevantAuthFiles();

        if (relevant.length === 0) {
            setQuotaData([]);
            setFetching(false);
            return;
        }

        try {
            const results = await Promise.all(relevant.map(file => fetchQuota(file)));
            setQuotaData(results);

            const errorCount = results.filter(r => r.error).length;
            if (errorCount > 0) {
                showNotification(`Fetched ${results.length - errorCount}/${results.length} quotas successfully`, 'warning');
            } else {
                showNotification('All quotas fetched successfully', 'success');
            }
        } catch (error) {
            showNotification(
                `Failed to fetch quotas: ${error instanceof Error ? error.message : 'Unknown error'}`,
                'error'
            );
        } finally {
            setFetching(false);
        }
    };

    // Auto-fetch when tab changes
    useEffect(() => {
        if (!disableControls && authFiles.length > 0) {
            fetchAllQuotas();
        }
    }, [activeTab]);

    const relevantFiles = getRelevantAuthFiles();

    return (
        <div className="main-content-inner">
            <div className="page-header">
                <h1 className="page-title">Quota Management</h1>
                <p className="page-description">Monitor AI provider quotas and usage limits</p>
            </div>

            {/* Provider Tabs */}
            <div style={{ marginBottom: '24px', display: 'flex', gap: '8px', borderBottom: '1px solid var(--color-border)' }}>
                {(['antigravity', 'codex', 'gemini-cli', 'claude-code'] as ProviderTab[]).map(tab => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        style={{
                            padding: '12px 20px',
                            background: activeTab === tab ? 'var(--color-bg-glass)' : 'transparent',
                            border: 'none',
                            borderBottom: activeTab === tab ? '2px solid var(--color-primary)' : '2px solid transparent',
                            color: activeTab === tab ? 'var(--color-text)' : 'var(--color-text-muted)',
                            fontFamily: 'var(--font-body)',
                            fontSize: '14px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            textTransform: 'capitalize'
                        }}
                    >
                        {tab === 'gemini-cli' ? 'Gemini CLI' : tab === 'claude-code' ? 'Claude Code' : tab}
                    </button>
                ))}
            </div>

            <Card
                extra={
                    <Button
                        onClick={fetchAllQuotas}
                        loading={fetching}
                        disabled={disableControls || loading || relevantFiles.length === 0}
                        size="sm"
                    >
                        Refresh Quotas
                    </Button>
                }
            >
                {loading ? (
                    <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                        Loading auth files...
                    </div>
                ) : relevantFiles.length === 0 ? (
                    <EmptyState
                        icon={<Gauge />}
                        title={`No ${activeTab} auth files found`}
                        description={`Upload ${activeTab} authentication files to view quota information`}
                        action={
                            <Button onClick={() => window.location.hash = '#/auth-files'}>
                                Manage Auth Files
                            </Button>
                        }
                    />
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        {quotaData.length === 0 && !fetching ? (
                            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                                Click "Refresh Quotas" to fetch quota information
                            </div>
                        ) : (
                            quotaData.map((quota, index) => (
                                <QuotaCard
                                    key={index}
                                    authFile={quota.authFile}
                                    authIndex={quota.authIndex}
                                    provider={activeTab}
                                    data={quota.data}
                                    error={quota.error}
                                />
                            ))
                        )}
                    </div>
                )}
            </Card>
        </div>
    );
}

// Quota Card Component
function QuotaCard({
    authFile,
    authIndex,
    provider,
    data,
    error
}: {
    authFile: string;
    authIndex: string | number;
    provider: ProviderTab;
    data: any;
    error?: string;
}) {
    // Parse quota data based on provider
    const renderQuotaInfo = () => {
        if (error) {
            return (
                <div style={{ padding: '20px', color: 'var(--color-danger)', textAlign: 'center' }}>
                    Error: {error}
                </div>
            );
        }

        if (!data) {
            return (
                <div style={{ padding: '20px', color: 'var(--color-text-muted)', textAlign: 'center' }}>
                    No quota data available
                </div>
            );
        }

        // Provider-specific rendering
        if (provider === 'antigravity') {
            return renderAntigravityQuota(data);
        } else if (provider === 'codex') {
            return renderCodexQuota(data);
        } else if (provider === 'gemini-cli') {
            return renderGeminiQuota(data);
        } else if (provider === 'claude-code') {
            return renderClaudeCodeQuota(data);
        }

        return (
            <pre style={{
                fontFamily: 'monospace',
                fontSize: '12px',
                color: 'var(--color-text-secondary)',
                overflowX: 'auto',
                padding: '12px',
                background: 'var(--color-bg-deep)',
                borderRadius: 'var(--radius-sm)'
            }}>
                {JSON.stringify(data, null, 2)}
            </pre>
        );
    };

    return (
        <div
            style={{
                background: 'var(--color-bg-glass)',
                border: '1px solid var(--color-border-glass)',
                borderRadius: 'var(--radius-md)',
                backdropFilter: 'blur(var(--glass-blur))',
                overflow: 'hidden'
            }}
        >
            <div
                style={{
                    padding: '16px',
                    borderBottom: '1px solid var(--color-border-glass)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                }}
            >
                <div>
                    <div style={{ fontWeight: 600, color: 'var(--color-text)' }}>
                        {provider === 'claude-code' && data?.label ? data.label : authFile}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                        {provider === 'claude-code' && data?.email ? data.email : `Auth Index: ${authIndex}`}
                    </div>
                </div>
            </div>
            <div style={{ padding: '16px' }}>
                {renderQuotaInfo()}
            </div>
        </div>
    );
}

// Provider-specific quota renderers
function renderAntigravityQuota(data: any) {
    const models = data?.models || [];
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text)' }}>
                Available Models: {models.length}
            </div>
            {models.slice(0, 10).map((model: any, i: number) => (
                <div
                    key={i}
                    style={{
                        fontSize: '12px',
                        color: 'var(--color-text-secondary)',
                        padding: '4px',
                        fontFamily: 'monospace'
                    }}
                >
                    {model.name || model}
                </div>
            ))}
            {models.length > 10 && (
                <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
                    ... and {models.length - 10} more
                </div>
            )}
        </div>
    );
}

function renderCodexQuota(data: any) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {data.usage && (
                <>
                    <QuotaProgress
                        label="Requests Used"
                        current={data.usage.requests || 0}
                        total={data.usage.request_limit || 100}
                    />
                    <QuotaProgress
                        label="Tokens Used"
                        current={data.usage.tokens || 0}
                        total={data.usage.token_limit || 100000}
                    />
                </>
            )}
        </div>
    );
}

function renderGeminiQuota(data: any) {
    const quota = data?.quota || {};
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {quota.daily_requests !== undefined && (
                <QuotaProgress
                    label="Daily Requests"
                    current={quota.daily_requests_used || 0}
                    total={quota.daily_requests || 1000}
                />
            )}
            {quota.rpm !== undefined && (
                <QuotaProgress
                    label="Requests Per Minute"
                    current={quota.rpm_used || 0}
                    total={quota.rpm || 60}
                />
            )}
        </div>
    );
}

function renderClaudeCodeQuota(data: any) {
    const quota: ClaudeCodeQuotaInfo | undefined = data?.quota;

    if (!quota) {
        return (
            <div style={{ padding: '20px', color: 'var(--color-text-muted)', textAlign: 'center' }}>
                No quota data available
            </div>
        );
    }

    const formatResetTime = (timestamp: number): string => {
        const date = new Date(timestamp * 1000);
        const now = Date.now();
        const diff = date.getTime() - now;

        if (diff < 0) return 'Now';

        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

        if (hours > 24) {
            const days = Math.floor(hours / 24);
            return `${days}d ${hours % 24}h`;
        } else if (hours > 0) {
            return `${hours}h ${minutes}m`;
        } else {
            return `${minutes}m`;
        }
    };

    const renderQuotaWindow = (
        label: string,
        utilization: number,
        resetTime: number,
        status: string
    ) => {
        const remaining = Math.max(0, Math.min(1, 1 - utilization));
        const percent = Math.round(remaining * 100);
        const resetLabel = formatResetTime(resetTime);
        const isLimited = status !== 'allowed';

        return (
            <div style={{ marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text)' }}>
                            {label}
                        </span>
                        {isLimited && (
                            <span style={{
                                fontSize: '10px',
                                padding: '2px 6px',
                                background: 'var(--color-danger)',
                                color: 'white',
                                borderRadius: '4px',
                                fontWeight: 600,
                                textTransform: 'uppercase'
                            }}>
                                Limited
                            </span>
                        )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{ fontSize: '13px', fontWeight: 600, color: isLimited ? 'var(--color-danger)' : 'var(--color-text)' }}>
                            {percent}%
                        </span>
                        <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                            Resets in {resetLabel}
                        </span>
                    </div>
                </div>
                <div
                    style={{
                        width: '100%',
                        height: '8px',
                        background: 'var(--color-bg-deep)',
                        borderRadius: '4px',
                        overflow: 'hidden'
                    }}
                >
                    <div
                        style={{
                            width: `${percent}%`,
                            height: '100%',
                            background: isLimited
                                ? 'var(--color-danger)'
                                : percent >= 60
                                ? 'linear-gradient(135deg, var(--color-primary), var(--color-secondary))'
                                : percent >= 20
                                ? '#F59E0B'
                                : 'var(--color-danger)',
                            transition: 'width 0.3s ease',
                            boxShadow: isLimited
                                ? '0 0 8px rgba(239, 68, 68, 0.6)'
                                : percent >= 60
                                ? '0 0 8px rgba(245, 158, 11, 0.4)'
                                : '0 0 8px rgba(239, 68, 68, 0.6)'
                        }}
                    />
                </div>
            </div>
        );
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {renderQuotaWindow(
                '5-Hour Window',
                quota.five_hour_utilization,
                quota.five_hour_reset,
                quota.five_hour_status
            )}
            {renderQuotaWindow(
                '7-Day Window',
                quota.seven_day_utilization,
                quota.seven_day_reset,
                quota.seven_day_status
            )}
            {renderQuotaWindow(
                'Overage Window',
                quota.overage_utilization,
                quota.overage_reset,
                quota.overage_status
            )}
        </div>
    );
}

// Progress Bar Component
function QuotaProgress({ label, current, total }: { label: string; current: number; total: number }) {
    const percentage = Math.min((current / total) * 100, 100);
    const isWarning = percentage > 80;
    const isDanger = percentage > 95;

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                    {label}
                </div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text)' }}>
                    {current.toLocaleString()} / {total.toLocaleString()}
                </div>
            </div>
            <div
                style={{
                    width: '100%',
                    height: '8px',
                    background: 'var(--color-bg-deep)',
                    borderRadius: '4px',
                    overflow: 'hidden'
                }}
            >
                <div
                    style={{
                        width: `${percentage}%`,
                        height: '100%',
                        background: isDanger
                            ? 'var(--color-danger)'
                            : isWarning
                            ? '#F59E0B'
                            : 'linear-gradient(135deg, var(--color-primary), var(--color-secondary))',
                        transition: 'width 0.3s ease',
                        boxShadow: isDanger
                            ? '0 0 8px rgba(239, 68, 68, 0.6)'
                            : isWarning
                            ? '0 0 8px rgba(245, 158, 11, 0.6)'
                            : '0 0 8px rgba(245, 158, 11, 0.4)'
                    }}
                />
            </div>
        </div>
    );
}

export default QuotaPage;
