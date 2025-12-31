/**
 * Settings Page
 *
 * Manages CLIProxy basic configuration settings including:
 * - Debug mode, usage statistics, logging, WS auth
 * - Proxy URL configuration
 * - Request retry count
 * - Quota fallback options
 */

import { useState, useEffect } from 'react';
import { useConfig } from '../../contexts/ConfigContext';
import { useAuth } from '../../contexts/AuthContext';
import { useNotification } from '../../contexts/NotificationContext';
import { managementApi } from '../../lib/management-api';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { ToggleSwitch } from '../ui/ToggleSwitch';

export function SettingsPage() {
    const { config, fetchConfig, updateConfigValue, clearCache, refreshConfig } = useConfig();
    const { connectionStatus } = useAuth();
    const { showNotification } = useNotification();

    const [loading, setLoading] = useState(true);
    const [proxyValue, setProxyValue] = useState('');
    const [retryValue, setRetryValue] = useState(0);
    const [pending, setPending] = useState({
        debug: false,
        usage: false,
        loggingToFile: false,
        wsAuth: false,
        proxy: false,
        retry: false,
        switchProject: false,
        switchPreview: false
    });

    const disableControls = connectionStatus !== 'connected';

    // Initial load
    useEffect(() => {
        const load = async () => {
            setLoading(true);
            try {
                const data = await fetchConfig();
                setProxyValue(data?.['proxy-url'] ?? '');
                setRetryValue(data?.['request-retry'] ?? 0);
            } catch (error) {
                showNotification(
                    `Failed to load config: ${error instanceof Error ? error.message : 'Unknown error'}`,
                    'error'
                );
            } finally {
                setLoading(false);
            }
        };

        load();
    }, []);

    // Sync local state with config changes
    useEffect(() => {
        if (config) {
            setProxyValue(config['proxy-url'] ?? '');
            setRetryValue(config['request-retry'] ?? 0);
        }
    }, [config?.['proxy-url'], config?.['request-retry']]);

    const setPendingFlag = (key: string, value: boolean) => {
        setPending(prev => ({ ...prev, [key]: value }));
    };

    // Toggle setting handler with optimistic updates
    const toggleSetting = async (
        section: string,
        configKey: string,
        value: boolean,
        updater: (val: boolean) => Promise<any>,
        successMessage: string
    ) => {
        const previous = config?.[configKey as keyof typeof config] ?? false;

        setPendingFlag(section, true);
        updateConfigValue(configKey, value);

        try {
            await updater(value);
            clearCache(configKey);
            showNotification(successMessage, 'success');
        } catch (error) {
            updateConfigValue(configKey, previous);
            showNotification(
                `Update failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
                'error'
            );
        } finally {
            setPendingFlag(section, false);
        }
    };

    // Proxy URL handlers
    const handleProxyUpdate = async () => {
        const previous = config?.['proxy-url'] ?? '';
        const trimmedValue = proxyValue.trim();

        setPendingFlag('proxy', true);
        updateConfigValue('proxy-url', trimmedValue);

        try {
            await managementApi.updateProxyUrl(trimmedValue);
            clearCache('proxy-url');
            showNotification('Proxy URL updated successfully', 'success');
        } catch (error) {
            setProxyValue(previous);
            updateConfigValue('proxy-url', previous);
            showNotification(
                `Failed to update proxy URL: ${error instanceof Error ? error.message : 'Unknown error'}`,
                'error'
            );
        } finally {
            setPendingFlag('proxy', false);
        }
    };

    const handleProxyClear = async () => {
        const previous = config?.['proxy-url'] ?? '';

        setPendingFlag('proxy', true);
        updateConfigValue('proxy-url', '');

        try {
            await managementApi.clearProxyUrl();
            clearCache('proxy-url');
            setProxyValue('');
            showNotification('Proxy URL cleared successfully', 'success');
        } catch (error) {
            setProxyValue(previous);
            updateConfigValue('proxy-url', previous);
            showNotification(
                `Failed to clear proxy URL: ${error instanceof Error ? error.message : 'Unknown error'}`,
                'error'
            );
        } finally {
            setPendingFlag('proxy', false);
        }
    };

    // Request retry handler
    const handleRetryUpdate = async () => {
        const previous = config?.['request-retry'] ?? 0;
        const parsed = Number(retryValue);

        if (!Number.isFinite(parsed) || parsed < 0) {
            showNotification('Invalid retry count. Must be a non-negative number.', 'error');
            setRetryValue(previous);
            return;
        }

        setPendingFlag('retry', true);
        updateConfigValue('request-retry', parsed);

        try {
            await managementApi.updateRequestRetry(parsed);
            clearCache('request-retry');
            showNotification('Request retry count updated successfully', 'success');
        } catch (error) {
            setRetryValue(previous);
            updateConfigValue('request-retry', previous);
            showNotification(
                `Failed to update retry count: ${error instanceof Error ? error.message : 'Unknown error'}`,
                'error'
            );
        } finally {
            setPendingFlag('retry', false);
        }
    };

    // Quota fallback handlers
    const handleQuotaToggle = async (key: 'switchProject' | 'switchPreview', value: boolean) => {
        const configPath = key === 'switchProject' ? 'switch-project' : 'switch-preview-model';
        const previous = config?.['quota-exceeded']?.[configPath] ?? false;
        const nextQuota = { ...(config?.['quota-exceeded'] || {}), [configPath]: value };

        setPendingFlag(key, true);
        updateConfigValue('quota-exceeded', nextQuota);

        try {
            if (key === 'switchProject') {
                await managementApi.updateSwitchProject(value);
            } else {
                await managementApi.updateSwitchPreviewModel(value);
            }
            clearCache('quota-exceeded');
            showNotification(
                `Quota fallback updated: ${key === 'switchProject' ? 'Switch Project' : 'Switch Preview Model'}`,
                'success'
            );
        } catch (error) {
            updateConfigValue('quota-exceeded', { ...(config?.['quota-exceeded'] || {}), [configPath]: previous });
            showNotification(
                `Failed to update quota fallback: ${error instanceof Error ? error.message : 'Unknown error'}`,
                'error'
            );
        } finally {
            setPendingFlag(key, false);
        }
    };

    return (
        <div className="main-content-inner">
            <div className="page-header">
                <h1 className="page-title">Basic Settings</h1>
                <p className="page-description">Configure CLIProxy basic settings and behavior</p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                {/* General Settings */}
                <Card title="General Settings">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        <ToggleSwitch
                            label="Debug Mode"
                            description="Enable detailed debug logging"
                            checked={config?.debug ?? false}
                            disabled={disableControls || pending.debug || loading}
                            onChange={(value) =>
                                toggleSetting(
                                    'debug',
                                    'debug',
                                    value,
                                    managementApi.updateDebug.bind(managementApi),
                                    'Debug mode updated'
                                )
                            }
                        />

                        <ToggleSwitch
                            label="Usage Statistics"
                            description="Collect and track API usage statistics"
                            checked={config?.['usage-statistics-enabled'] ?? false}
                            disabled={disableControls || pending.usage || loading}
                            onChange={(value) =>
                                toggleSetting(
                                    'usage',
                                    'usage-statistics-enabled',
                                    value,
                                    managementApi.updateUsageStatistics.bind(managementApi),
                                    'Usage statistics updated'
                                )
                            }
                        />

                        <ToggleSwitch
                            label="Logging to File"
                            description="Write logs to file system"
                            checked={config?.['logging-to-file'] ?? false}
                            disabled={disableControls || pending.loggingToFile || loading}
                            onChange={(value) =>
                                toggleSetting(
                                    'loggingToFile',
                                    'logging-to-file',
                                    value,
                                    managementApi.updateLoggingToFile.bind(managementApi),
                                    'File logging updated'
                                )
                            }
                        />

                        <ToggleSwitch
                            label="WebSocket Authentication"
                            description="Enable WebSocket authentication"
                            checked={config?.['ws-auth'] ?? false}
                            disabled={disableControls || pending.wsAuth || loading}
                            onChange={(value) =>
                                toggleSetting(
                                    'wsAuth',
                                    'ws-auth',
                                    value,
                                    managementApi.updateWsAuth.bind(managementApi),
                                    'WebSocket auth updated'
                                )
                            }
                        />
                    </div>
                </Card>

                {/* Proxy Settings */}
                <Card title="Proxy Configuration">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <Input
                            label="Proxy URL"
                            placeholder="http://proxy.example.com:8080"
                            value={proxyValue}
                            onChange={(e) => setProxyValue(e.target.value)}
                            disabled={disableControls || loading}
                            fullWidth
                        />
                        <div style={{ display: 'flex', gap: '12px' }}>
                            <Button
                                variant="secondary"
                                onClick={handleProxyClear}
                                disabled={disableControls || pending.proxy || loading}
                            >
                                Clear
                            </Button>
                            <Button
                                onClick={handleProxyUpdate}
                                loading={pending.proxy}
                                disabled={disableControls || loading}
                            >
                                Update Proxy URL
                            </Button>
                        </div>
                    </div>
                </Card>

                {/* Request Retry */}
                <Card title="Request Retry">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <Input
                            label="Retry Count"
                            type="number"
                            min={0}
                            step={1}
                            value={retryValue}
                            onChange={(e) => setRetryValue(Number(e.target.value))}
                            disabled={disableControls || loading}
                            fullWidth
                        />
                        <div>
                            <Button
                                onClick={handleRetryUpdate}
                                loading={pending.retry}
                                disabled={disableControls || loading}
                            >
                                Update Retry Count
                            </Button>
                        </div>
                    </div>
                </Card>

                {/* Quota Fallback */}
                <Card title="Quota Fallback Options">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        <ToggleSwitch
                            label="Switch Project on Quota Exceeded"
                            description="Automatically switch to another project when quota is exceeded"
                            checked={config?.['quota-exceeded']?.['switch-project'] ?? false}
                            disabled={disableControls || pending.switchProject || loading}
                            onChange={(value) => handleQuotaToggle('switchProject', value)}
                        />

                        <ToggleSwitch
                            label="Switch to Preview Model on Quota Exceeded"
                            description="Automatically switch to preview models when quota is exceeded"
                            checked={config?.['quota-exceeded']?.['switch-preview-model'] ?? false}
                            disabled={disableControls || pending.switchPreview || loading}
                            onChange={(value) => handleQuotaToggle('switchPreview', value)}
                        />
                    </div>
                </Card>
            </div>
        </div>
    );
}

export default SettingsPage;
