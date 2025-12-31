/**
 * AI Providers Page
 *
 * Manages AI provider configurations with tabs for:
 * - Gemini API Keys
 * - Codex API Keys
 * - Claude API Keys
 * - OpenAI Compatible Providers
 */

import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useNotification } from '../../contexts/NotificationContext';
import { managementApi, GeminiKeyConfig, ProviderKeyConfig, OpenAIProviderConfig } from '../../lib/management-api';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Modal } from '../ui/Modal';
import { EmptyState } from '../ui/EmptyState';
import { Cloud } from '../Icons';

type ProviderTab = 'gemini' | 'codex' | 'claude' | 'openai';

export function ProvidersPage() {
    const { connectionStatus } = useAuth();
    const { showNotification } = useNotification();

    const [activeTab, setActiveTab] = useState<ProviderTab>('gemini');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // Provider state
    const [geminiConfigs, setGeminiConfigs] = useState<GeminiKeyConfig[]>([]);
    const [codexConfigs, setCodexConfigs] = useState<ProviderKeyConfig[]>([]);
    const [claudeConfigs, setClaudeConfigs] = useState<ProviderKeyConfig[]>([]);
    const [openaiConfigs, setOpenaiConfigs] = useState<OpenAIProviderConfig[]>([]);

    // Modal state
    const [showAddModal, setShowAddModal] = useState(false);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [deletingItem, setDeletingItem] = useState<{ apiKey?: string; name?: string } | null>(null);

    // Form state (simplified - just API key and prefix for now)
    const [formApiKey, setFormApiKey] = useState('');
    const [formPrefix, setFormPrefix] = useState('');
    const [formBaseUrl, setFormBaseUrl] = useState('');
    const [formName, setFormName] = useState(''); // For OpenAI compat

    const disableControls = connectionStatus !== 'connected';

    // Load configs for active tab
    useEffect(() => {
        loadConfigs();
    }, [activeTab]);

    const loadConfigs = async () => {
        setLoading(true);
        try {
            switch (activeTab) {
                case 'gemini':
                    const gemini = await managementApi.getGeminiKeys();
                    setGeminiConfigs(gemini);
                    break;
                case 'codex':
                    const codex = await managementApi.getCodexKeys();
                    setCodexConfigs(codex);
                    break;
                case 'claude':
                    const claude = await managementApi.getClaudeKeys();
                    setClaudeConfigs(claude);
                    break;
                case 'openai':
                    const openai = await managementApi.getOpenAIProviders();
                    setOpenaiConfigs(openai);
                    break;
            }
        } catch (error) {
            showNotification(
                `Failed to load ${activeTab} configs: ${error instanceof Error ? error.message : 'Unknown error'}`,
                'error'
            );
        } finally {
            setLoading(false);
        }
    };

    const handleAdd = async () => {
        if (!formApiKey.trim() && activeTab !== 'openai') {
            showNotification('API key is required', 'error');
            return;
        }

        if (activeTab === 'openai' && (!formName.trim() || !formBaseUrl.trim() || !formApiKey.trim())) {
            showNotification('Name, Base URL, and API Key are required for OpenAI providers', 'error');
            return;
        }

        setSaving(true);
        try {
            switch (activeTab) {
                case 'gemini':
                    const newGemini: GeminiKeyConfig = {
                        'api-key': formApiKey.trim(),
                        prefix: formPrefix.trim() || undefined,
                        'base-url': formBaseUrl.trim() || undefined
                    };
                    await managementApi.updateGeminiKeys([...geminiConfigs, newGemini]);
                    break;
                case 'codex':
                    const newCodex: ProviderKeyConfig = {
                        'api-key': formApiKey.trim(),
                        prefix: formPrefix.trim() || undefined,
                        'base-url': formBaseUrl.trim() || undefined
                    };
                    await managementApi.updateCodexKeys([...codexConfigs, newCodex]);
                    break;
                case 'claude':
                    const newClaude: ProviderKeyConfig = {
                        'api-key': formApiKey.trim(),
                        prefix: formPrefix.trim() || undefined,
                        'base-url': formBaseUrl.trim() || undefined
                    };
                    await managementApi.updateClaudeKeys([...claudeConfigs, newClaude]);
                    break;
                case 'openai':
                    const newOpenAI: OpenAIProviderConfig = {
                        name: formName.trim(),
                        'base-url': formBaseUrl.trim(),
                        'api-key-entries': [{
                            'api-key': formApiKey.trim()
                        }],
                        prefix: formPrefix.trim() || undefined
                    };
                    await managementApi.updateOpenAIProviders([...openaiConfigs, newOpenAI]);
                    break;
            }

            await loadConfigs();
            resetForm();
            setShowAddModal(false);
            showNotification(`${activeTab} provider added successfully`, 'success');
        } catch (error) {
            showNotification(
                `Failed to add provider: ${error instanceof Error ? error.message : 'Unknown error'}`,
                'error'
            );
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!deletingItem) return;

        setSaving(true);
        try {
            if (activeTab === 'openai' && deletingItem.name) {
                await managementApi.deleteOpenAIProvider(deletingItem.name);
            } else if (deletingItem.apiKey) {
                switch (activeTab) {
                    case 'gemini':
                        await managementApi.deleteGeminiKey(deletingItem.apiKey);
                        break;
                    case 'codex':
                        await managementApi.deleteCodexKey(deletingItem.apiKey);
                        break;
                    case 'claude':
                        await managementApi.deleteClaudeKey(deletingItem.apiKey);
                        break;
                }
            }

            await loadConfigs();
            setShowDeleteModal(false);
            setDeletingItem(null);
            showNotification(`${activeTab} provider deleted successfully`, 'success');
        } catch (error) {
            showNotification(
                `Failed to delete provider: ${error instanceof Error ? error.message : 'Unknown error'}`,
                'error'
            );
        } finally {
            setSaving(false);
        }
    };

    const resetForm = () => {
        setFormApiKey('');
        setFormPrefix('');
        setFormBaseUrl('');
        setFormName('');
    };

    const openDeleteModal = (apiKey?: string, name?: string) => {
        setDeletingItem({ apiKey, name });
        setShowDeleteModal(true);
    };

    const maskKey = (key: string): string => {
        if (key.length <= 10) return '***';
        return `${key.slice(0, 7)}...${key.slice(-4)}`;
    };

    const renderProviderList = () => {
        let configs: any[] = [];
        let emptyMessage = '';

        switch (activeTab) {
            case 'gemini':
                configs = geminiConfigs;
                emptyMessage = 'No Gemini API keys configured';
                break;
            case 'codex':
                configs = codexConfigs;
                emptyMessage = 'No Codex API keys configured';
                break;
            case 'claude':
                configs = claudeConfigs;
                emptyMessage = 'No Claude API keys configured';
                break;
            case 'openai':
                configs = openaiConfigs;
                emptyMessage = 'No OpenAI compatible providers configured';
                break;
        }

        if (loading) {
            return (
                <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                    Loading {activeTab} configs...
                </div>
            );
        }

        if (configs.length === 0) {
            return (
                <EmptyState
                    icon={<Cloud />}
                    title={emptyMessage}
                    description={`Add your first ${activeTab} provider configuration`}
                    action={
                        <Button onClick={() => setShowAddModal(true)} disabled={disableControls}>
                            Add {activeTab === 'openai' ? 'Provider' : 'API Key'}
                        </Button>
                    }
                />
            );
        }

        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {configs.map((config, index) => {
                    const isOpenAI = activeTab === 'openai';
                    const apiKey = isOpenAI ? config['api-key-entries']?.[0]?.['api-key'] : config['api-key'];
                    const displayName = isOpenAI ? config.name : (config.prefix || `Key ${index + 1}`);
                    const baseUrl = config['base-url'];

                    return (
                        <div
                            key={index}
                            style={{
                                padding: '16px',
                                background: 'var(--color-bg-glass)',
                                border: '1px solid var(--color-border-glass)',
                                borderRadius: 'var(--radius-md)',
                                backdropFilter: 'blur(var(--glass-blur))'
                            }}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '12px' }}>
                                <div>
                                    <div style={{ fontWeight: 600, color: 'var(--color-text)', marginBottom: '4px' }}>
                                        {displayName}
                                    </div>
                                    {baseUrl && (
                                        <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                                            {baseUrl}
                                        </div>
                                    )}
                                </div>
                                <Button
                                    variant="danger"
                                    size="sm"
                                    onClick={() => openDeleteModal(apiKey, isOpenAI ? config.name : undefined)}
                                    disabled={disableControls}
                                >
                                    Delete
                                </Button>
                            </div>
                            <code
                                style={{
                                    fontFamily: 'monospace',
                                    fontSize: '13px',
                                    color: 'var(--color-text-secondary)',
                                    display: 'block'
                                }}
                            >
                                {maskKey(apiKey || '')}
                            </code>
                        </div>
                    );
                })}
            </div>
        );
    };

    return (
        <div className="main-content-inner">
            <div className="page-header">
                <h1 className="page-title">AI Providers</h1>
                <p className="page-description">Configure AI provider API keys and endpoints</p>
            </div>

            {/* Provider Tabs */}
            <div style={{ marginBottom: '24px', display: 'flex', gap: '8px', borderBottom: '1px solid var(--color-border)' }}>
                {(['gemini', 'codex', 'claude', 'openai'] as ProviderTab[]).map(tab => (
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
                        {tab === 'openai' ? 'OpenAI Compatible' : tab}
                    </button>
                ))}
            </div>

            <Card
                extra={
                    <Button
                        onClick={() => setShowAddModal(true)}
                        disabled={disableControls || loading}
                        size="sm"
                    >
                        + Add {activeTab === 'openai' ? 'Provider' : 'API Key'}
                    </Button>
                }
            >
                {renderProviderList()}
            </Card>

            {/* Add Provider Modal */}
            <Modal
                isOpen={showAddModal}
                onClose={() => {
                    setShowAddModal(false);
                    resetForm();
                }}
                title={`Add ${activeTab === 'openai' ? 'OpenAI Provider' : activeTab + ' API Key'}`}
                footer={
                    <>
                        <Button
                            variant="secondary"
                            onClick={() => {
                                setShowAddModal(false);
                                resetForm();
                            }}
                            disabled={saving}
                        >
                            Cancel
                        </Button>
                        <Button onClick={handleAdd} loading={saving}>
                            Add
                        </Button>
                    </>
                }
            >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {activeTab === 'openai' && (
                        <Input
                            label="Provider Name"
                            placeholder="e.g., MyProvider"
                            value={formName}
                            onChange={(e) => setFormName(e.target.value)}
                            fullWidth
                            autoFocus
                        />
                    )}
                    <Input
                        label="API Key"
                        placeholder="Enter API key"
                        value={formApiKey}
                        onChange={(e) => setFormApiKey(e.target.value)}
                        fullWidth
                        autoFocus={activeTab !== 'openai'}
                    />
                    <Input
                        label="Base URL (Optional)"
                        placeholder="https://api.example.com"
                        value={formBaseUrl}
                        onChange={(e) => setFormBaseUrl(e.target.value)}
                        fullWidth
                    />
                    <Input
                        label="Prefix (Optional)"
                        placeholder="e.g., my-provider"
                        value={formPrefix}
                        onChange={(e) => setFormPrefix(e.target.value)}
                        fullWidth
                    />
                </div>
            </Modal>

            {/* Delete Confirmation Modal */}
            <Modal
                isOpen={showDeleteModal}
                onClose={() => {
                    setShowDeleteModal(false);
                    setDeletingItem(null);
                }}
                title="Delete Provider"
                size="sm"
                footer={
                    <>
                        <Button
                            variant="secondary"
                            onClick={() => {
                                setShowDeleteModal(false);
                                setDeletingItem(null);
                            }}
                            disabled={saving}
                        >
                            Cancel
                        </Button>
                        <Button variant="danger" onClick={handleDelete} loading={saving}>
                            Delete
                        </Button>
                    </>
                }
            >
                <p style={{ margin: 0, color: 'var(--color-text-secondary)' }}>
                    Are you sure you want to delete this provider configuration? This action cannot be undone.
                </p>
            </Modal>
        </div>
    );
}

export default ProvidersPage;
