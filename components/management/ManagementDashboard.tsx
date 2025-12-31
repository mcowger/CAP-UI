/**
 * Management Dashboard
 *
 * Overview page showing:
 * - Connection status & server version
 * - Quick stats (API keys, providers, auth files)
 * - Current config summary
 * - Quick action buttons
 * - Recent activity feed
 */

import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useConfig } from '../../contexts/ConfigContext';
import { useNotification } from '../../contexts/NotificationContext';
import { managementApi } from '../../lib/management-api';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';

interface DashboardStats {
    apiKeyCount: number;
    providerCount: number;
    authFileCount: number;
    availableModels: number;
}

export function ManagementDashboard() {
    const { connectionStatus } = useAuth();
    const { config, loading: configLoading, fetchConfig } = useConfig();
    const { showNotification } = useNotification();

    const [stats, setStats] = useState<DashboardStats>({
        apiKeyCount: 0,
        providerCount: 0,
        authFileCount: 0,
        availableModels: 0
    });
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [recentLogs, setRecentLogs] = useState<string[]>([]);

    const isConnected = connectionStatus === 'connected';

    // Load dashboard stats
    const loadStats = async () => {
        try {
            setLoading(true);

            // Fetch API keys count
            const apiKeys = await managementApi.getApiKeys();

            // Fetch provider counts
            const [gemini, codex, claude, openai] = await Promise.all([
                managementApi.getGeminiKeys(),
                managementApi.getCodexKeys(),
                managementApi.getClaudeKeys(),
                managementApi.getOpenAIProviders()
            ]);

            // Fetch auth files
            const authFiles = await managementApi.listAuthFiles();

            // Calculate total providers
            const providerCount = gemini.length + codex.length + claude.length + openai.length;

            // Count available models (approximation based on providers + auth files)
            const availableModels = providerCount * 5 + authFiles.length * 10; // rough estimate

            setStats({
                apiKeyCount: apiKeys.length,
                providerCount,
                authFileCount: authFiles.length,
                availableModels
            });

            setLoading(false);
        } catch (error) {
            showNotification(
                `Failed to load dashboard stats: ${error instanceof Error ? error.message : 'Unknown error'}`,
                'error'
            );
            setLoading(false);
        }
    };

    // Load recent logs
    const loadRecentLogs = async () => {
        try {
            const logs = await managementApi.getLogs();
            setRecentLogs(logs.lines.slice(-10).reverse()); // Last 10 logs, newest first
        } catch (error) {
            // Logs are optional, don't show error
            console.error('Failed to load logs:', error);
        }
    };

    useEffect(() => {
        if (isConnected) {
            loadStats();
            loadRecentLogs();
        }
    }, [isConnected]);

    const handleRefresh = async () => {
        setRefreshing(true);
        await Promise.all([
            loadStats(),
            loadRecentLogs(),
            fetchConfig()
        ]);
        setRefreshing(false);
        showNotification('Dashboard refreshed', 'success');
    };

    const handleClearLogs = async () => {
        try {
            await managementApi.clearLogs();
            setRecentLogs([]);
            showNotification('Logs cleared', 'success');
        } catch (error) {
            showNotification(
                `Failed to clear logs: ${error instanceof Error ? error.message : 'Unknown error'}`,
                'error'
            );
        }
    };

    return (
        <div className="main-content-inner">
            <div className="page-header">
                <h1 className="page-title">Management Dashboard</h1>
                <p className="page-description">System overview and quick actions</p>
            </div>

            {/* Connection Status Card */}
            <Card title="Connection Status">
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 0' }}>
                    <div
                        style={{
                            width: '12px',
                            height: '12px',
                            borderRadius: '50%',
                            background: isConnected
                                ? 'linear-gradient(135deg, #10B981, #059669)'
                                : 'var(--color-danger)',
                            boxShadow: isConnected
                                ? '0 0 12px rgba(16, 185, 129, 0.6)'
                                : '0 0 12px rgba(239, 68, 68, 0.6)'
                        }}
                    />
                    <div>
                        <div style={{ fontWeight: 600, color: 'var(--color-text)' }}>
                            {isConnected ? 'Connected' : 'Disconnected'}
                        </div>
                        <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                            CLIProxy Management API
                        </div>
                    </div>
                    <div style={{ marginLeft: 'auto' }}>
                        <Button
                            size="sm"
                            variant="secondary"
                            onClick={handleRefresh}
                            loading={refreshing}
                            disabled={!isConnected}
                        >
                            Refresh
                        </Button>
                    </div>
                </div>
            </Card>

            {/* Stats Grid */}
            <div style={{ marginTop: '24px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px' }}>
                <StatCard
                    title="API Keys"
                    value={stats.apiKeyCount}
                    loading={loading}
                    icon="🔑"
                />
                <StatCard
                    title="AI Providers"
                    value={stats.providerCount}
                    loading={loading}
                    icon="☁️"
                />
                <StatCard
                    title="Auth Files"
                    value={stats.authFileCount}
                    loading={loading}
                    icon="📁"
                />
                <StatCard
                    title="Available Models"
                    value={stats.availableModels}
                    loading={loading}
                    icon="🤖"
                />
            </div>

            {/* Config Summary */}
            <Card title="Current Configuration" style={{ marginTop: '24px' }}>
                {configLoading ? (
                    <div style={{ padding: '20px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                        Loading configuration...
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <ConfigRow label="Debug Mode" value={config?.debug ? 'Enabled' : 'Disabled'} />
                        <ConfigRow label="Usage Statistics" value={config?.['usage-statistics-enabled'] ? 'Enabled' : 'Disabled'} />
                        <ConfigRow label="Request Logging" value={config?.['request-log'] ? 'Enabled' : 'Disabled'} />
                        <ConfigRow label="Logging to File" value={config?.['logging-to-file'] ? 'Enabled' : 'Disabled'} />
                        <ConfigRow label="Proxy URL" value={config?.['proxy-url'] || 'Not set'} />
                        <ConfigRow label="Request Retry" value={String(config?.['request-retry'] ?? 'Default')} />
                        <ConfigRow
                            label="Quota Fallback"
                            value={
                                config?.['quota-exceeded']?.['switch-project'] || config?.['quota-exceeded']?.['switch-preview-model']
                                    ? 'Enabled'
                                    : 'Disabled'
                            }
                        />
                    </div>
                )}
            </Card>

            {/* Quick Actions */}
            <Card title="Quick Actions" style={{ marginTop: '24px' }}>
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                    <Button
                        variant="primary"
                        onClick={() => window.location.hash = '#/settings'}
                        disabled={!isConnected}
                    >
                        Open Settings
                    </Button>
                    <Button
                        variant="secondary"
                        onClick={() => window.location.hash = '#/api-keys'}
                        disabled={!isConnected}
                    >
                        Manage API Keys
                    </Button>
                    <Button
                        variant="secondary"
                        onClick={() => window.location.hash = '#/providers'}
                        disabled={!isConnected}
                    >
                        Configure Providers
                    </Button>
                    <Button
                        variant="secondary"
                        onClick={() => window.location.hash = '#/config'}
                        disabled={!isConnected}
                    >
                        Edit Config
                    </Button>
                </div>
            </Card>

            {/* Recent Activity */}
            {recentLogs.length > 0 && (
                <Card
                    title="Recent Activity"
                    style={{ marginTop: '24px' }}
                    extra={
                        <Button
                            size="sm"
                            variant="ghost"
                            onClick={handleClearLogs}
                            disabled={!isConnected}
                        >
                            Clear Logs
                        </Button>
                    }
                >
                    <div
                        style={{
                            fontFamily: 'monospace',
                            fontSize: '12px',
                            color: 'var(--color-text-secondary)',
                            maxHeight: '300px',
                            overflowY: 'auto'
                        }}
                    >
                        {recentLogs.map((log, index) => (
                            <div
                                key={index}
                                style={{
                                    padding: '6px 0',
                                    borderBottom: index < recentLogs.length - 1 ? '1px solid var(--color-border-glass)' : 'none'
                                }}
                            >
                                {log}
                            </div>
                        ))}
                    </div>
                </Card>
            )}
        </div>
    );
}

// Stat Card Component
function StatCard({ title, value, loading, icon }: { title: string; value: number; loading: boolean; icon: string }) {
    return (
        <div
            style={{
                background: 'var(--color-bg-glass)',
                border: '1px solid var(--color-border-glass)',
                borderRadius: 'var(--radius-md)',
                padding: '20px',
                backdropFilter: 'blur(var(--glass-blur))',
                transition: 'all 0.2s ease'
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--color-text-secondary)' }}>
                    {title}
                </div>
                <div style={{ fontSize: '24px' }}>{icon}</div>
            </div>
            {loading ? (
                <div style={{ fontSize: '28px', fontWeight: 600, color: 'var(--color-text-muted)' }}>
                    ...
                </div>
            ) : (
                <div style={{ fontSize: '32px', fontWeight: 700, color: 'var(--color-text)', fontFamily: 'var(--font-heading)' }}>
                    {value}
                </div>
            )}
        </div>
    );
}

// Config Row Component
function ConfigRow({ label, value }: { label: string; value: string }) {
    return (
        <div
            style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '10px 0',
                borderBottom: '1px solid var(--color-border-glass)'
            }}
        >
            <div style={{ fontSize: '14px', color: 'var(--color-text-secondary)' }}>
                {label}
            </div>
            <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--color-text)', fontFamily: 'monospace' }}>
                {value}
            </div>
        </div>
    );
}

export default ManagementDashboard;
