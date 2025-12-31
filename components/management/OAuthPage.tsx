/**
 * OAuth Login Page
 *
 * OAuth authentication flows for:
 * - Codex (ChatGPT)
 * - Anthropic (Claude)
 * - Antigravity (Google)
 * - Gemini CLI
 * - Qwen
 * - iFlow (cookie-based)
 *
 * Features:
 * - Device code flow with auto-polling
 * - Manual callback URL submission
 * - iFlow cookie authentication
 */

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useNotification } from '../../contexts/NotificationContext';
import { managementApi, OAuthStartResponse, OAuthStatusResponse } from '../../lib/management-api';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Modal } from '../ui/Modal';
import { Shield } from '../Icons';

type OAuthProvider = 'codex' | 'anthropic' | 'antigravity' | 'gemini-cli' | 'qwen' | 'iflow';

interface OAuthState {
    provider: OAuthProvider;
    status: 'idle' | 'starting' | 'polling' | 'success' | 'error';
    data?: OAuthStartResponse;
    error?: string;
    pollingStartTime?: number;
}

const PROVIDER_LABELS: Record<OAuthProvider, string> = {
    'codex': 'Codex (ChatGPT)',
    'anthropic': 'Anthropic (Claude)',
    'antigravity': 'Antigravity (Google)',
    'gemini-cli': 'Gemini CLI',
    'qwen': 'Qwen',
    'iflow': 'iFlow'
};

const PROVIDER_DESCRIPTIONS: Record<OAuthProvider, string> = {
    'codex': 'Authenticate with OpenAI ChatGPT/Codex API',
    'anthropic': 'Authenticate with Anthropic Claude API',
    'antigravity': 'Authenticate with Google Antigravity service',
    'gemini-cli': 'Authenticate with Google Gemini CLI',
    'qwen': 'Authenticate with Alibaba Qwen API',
    'iflow': 'Authenticate with iFlow using cookies'
};

const MAX_POLL_DURATION = 5 * 60 * 1000; // 5 minutes
const POLL_INTERVAL = 2000; // 2 seconds

export function OAuthPage() {
    const { connectionStatus } = useAuth();
    const { showNotification } = useNotification();

    const [oauthStates, setOAuthStates] = useState<Map<OAuthProvider, OAuthState>>(new Map());
    const [showDeviceCodeModal, setShowDeviceCodeModal] = useState(false);
    const [showCallbackModal, setShowCallbackModal] = useState(false);
    const [showIFlowModal, setShowIFlowModal] = useState(false);
    const [activeProvider, setActiveProvider] = useState<OAuthProvider | null>(null);
    const [callbackUrl, setCallbackUrl] = useState('');
    const [iflowCookie, setIflowCookie] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const pollTimerRef = useRef<NodeJS.Timeout | null>(null);

    const disableControls = connectionStatus !== 'connected';

    // Cleanup polling on unmount
    useEffect(() => {
        return () => {
            if (pollTimerRef.current) {
                clearInterval(pollTimerRef.current);
            }
        };
    }, []);

    // Get or create OAuth state for a provider
    const getOAuthState = (provider: OAuthProvider): OAuthState => {
        return oauthStates.get(provider) || {
            provider,
            status: 'idle'
        };
    };

    const updateOAuthState = (provider: OAuthProvider, updates: Partial<OAuthState>) => {
        setOAuthStates(prev => {
            const newMap = new Map(prev);
            const current = getOAuthState(provider);
            newMap.set(provider, { ...current, ...updates });
            return newMap;
        });
    };

    // Start OAuth flow
    const startOAuth = async (provider: OAuthProvider) => {
        if (provider === 'iflow') {
            // iFlow uses cookie input, not device code
            setActiveProvider(provider);
            setShowIFlowModal(true);
            return;
        }

        updateOAuthState(provider, { status: 'starting' });

        try {
            const response = await managementApi.startOAuth(provider);

            updateOAuthState(provider, {
                status: 'polling',
                data: response,
                pollingStartTime: Date.now()
            });

            setActiveProvider(provider);
            setShowDeviceCodeModal(true);

            // Start polling if we have a state
            if (response.state) {
                startPolling(provider, response.state);
            }
        } catch (error) {
            updateOAuthState(provider, {
                status: 'error',
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            showNotification(
                `Failed to start OAuth flow: ${error instanceof Error ? error.message : 'Unknown error'}`,
                'error'
            );
        }
    };

    // Poll OAuth status
    const startPolling = (provider: OAuthProvider, state: string) => {
        // Clear any existing timer
        if (pollTimerRef.current) {
            clearInterval(pollTimerRef.current);
        }

        pollTimerRef.current = setInterval(async () => {
            const oauthState = getOAuthState(provider);

            // Check if polling timeout exceeded
            if (oauthState.pollingStartTime && Date.now() - oauthState.pollingStartTime > MAX_POLL_DURATION) {
                if (pollTimerRef.current) {
                    clearInterval(pollTimerRef.current);
                }
                updateOAuthState(provider, {
                    status: 'error',
                    error: 'Polling timeout exceeded (5 minutes)'
                });
                showNotification('OAuth flow timed out', 'error');
                return;
            }

            try {
                const statusResponse = await managementApi.pollOAuthStatus(state);

                if (statusResponse.status === 'ok') {
                    // Success!
                    if (pollTimerRef.current) {
                        clearInterval(pollTimerRef.current);
                    }
                    updateOAuthState(provider, {
                        status: 'success'
                    });
                    showNotification(`Successfully authenticated with ${PROVIDER_LABELS[provider]}`, 'success');
                    setShowDeviceCodeModal(false);
                } else if (statusResponse.status === 'error') {
                    // Error
                    if (pollTimerRef.current) {
                        clearInterval(pollTimerRef.current);
                    }
                    updateOAuthState(provider, {
                        status: 'error',
                        error: statusResponse.error || 'Authentication failed'
                    });
                    showNotification(`OAuth error: ${statusResponse.error}`, 'error');
                    setShowDeviceCodeModal(false);
                }
                // If status === 'wait', continue polling
            } catch (error) {
                console.error('Poll error:', error);
                // Don't stop polling on network errors, just log
            }
        }, POLL_INTERVAL);
    };

    // Submit callback URL manually
    const submitCallback = async () => {
        if (!activeProvider || !callbackUrl.trim()) {
            showNotification('Please enter a valid callback URL', 'error');
            return;
        }

        setSubmitting(true);
        try {
            await managementApi.submitOAuthCallback(activeProvider, callbackUrl.trim());
            updateOAuthState(activeProvider, { status: 'success' });
            showNotification(`Successfully authenticated with ${PROVIDER_LABELS[activeProvider]}`, 'success');
            setShowCallbackModal(false);
            setCallbackUrl('');
        } catch (error) {
            showNotification(
                `Failed to submit callback: ${error instanceof Error ? error.message : 'Unknown error'}`,
                'error'
            );
        } finally {
            setSubmitting(false);
        }
    };

    // Submit iFlow cookie
    const submitIFlowAuth = async () => {
        if (!iflowCookie.trim()) {
            showNotification('Please enter your iFlow cookie', 'error');
            return;
        }

        setSubmitting(true);
        try {
            await managementApi.submitIFlowAuth(iflowCookie.trim());
            updateOAuthState('iflow', { status: 'success' });
            showNotification('Successfully authenticated with iFlow', 'success');
            setShowIFlowModal(false);
            setIflowCookie('');
        } catch (error) {
            showNotification(
                `Failed to authenticate: ${error instanceof Error ? error.message : 'Unknown error'}`,
                'error'
            );
        } finally {
            setSubmitting(false);
        }
    };

    const providers: OAuthProvider[] = ['codex', 'anthropic', 'antigravity', 'gemini-cli', 'qwen', 'iflow'];

    return (
        <div className="main-content-inner">
            <div className="page-header">
                <h1 className="page-title">OAuth Login</h1>
                <p className="page-description">Configure OAuth provider authentication</p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '16px' }}>
                {providers.map(provider => {
                    const state = getOAuthState(provider);
                    const isActive = state.status !== 'idle';

                    return (
                        <Card key={provider}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <Shield />
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontWeight: 600, color: 'var(--color-text)', marginBottom: '4px' }}>
                                            {PROVIDER_LABELS[provider]}
                                        </div>
                                        <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                                            {PROVIDER_DESCRIPTIONS[provider]}
                                        </div>
                                    </div>
                                </div>

                                {/* Status indicator */}
                                {isActive && (
                                    <div
                                        style={{
                                            padding: '8px 12px',
                                            background: state.status === 'success'
                                                ? 'rgba(16, 185, 129, 0.1)'
                                                : state.status === 'error'
                                                ? 'rgba(239, 68, 68, 0.1)'
                                                : 'rgba(245, 158, 11, 0.1)',
                                            border: `1px solid ${
                                                state.status === 'success'
                                                    ? 'rgba(16, 185, 129, 0.3)'
                                                    : state.status === 'error'
                                                    ? 'rgba(239, 68, 68, 0.3)'
                                                    : 'rgba(245, 158, 11, 0.3)'
                                            }`,
                                            borderRadius: 'var(--radius-sm)',
                                            fontSize: '13px',
                                            color: state.status === 'success'
                                                ? '#10B981'
                                                : state.status === 'error'
                                                ? 'var(--color-danger)'
                                                : 'var(--color-primary)'
                                        }}
                                    >
                                        {state.status === 'success' && '✓ Authenticated successfully'}
                                        {state.status === 'error' && `✗ Error: ${state.error}`}
                                        {state.status === 'starting' && 'Starting OAuth flow...'}
                                        {state.status === 'polling' && 'Waiting for authentication...'}
                                    </div>
                                )}

                                {/* Action buttons */}
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <Button
                                        onClick={() => startOAuth(provider)}
                                        loading={state.status === 'starting' || state.status === 'polling'}
                                        disabled={disableControls}
                                        fullWidth
                                    >
                                        {provider === 'iflow' ? 'Enter Cookie' : 'Start OAuth'}
                                    </Button>
                                    {provider !== 'iflow' && (
                                        <Button
                                            variant="secondary"
                                            onClick={() => {
                                                setActiveProvider(provider);
                                                setShowCallbackModal(true);
                                            }}
                                            disabled={disableControls}
                                        >
                                            Manual
                                        </Button>
                                    )}
                                </div>
                            </div>
                        </Card>
                    );
                })}
            </div>

            {/* Device Code Modal */}
            <Modal
                isOpen={showDeviceCodeModal}
                onClose={() => {
                    setShowDeviceCodeModal(false);
                    if (pollTimerRef.current) {
                        clearInterval(pollTimerRef.current);
                    }
                    if (activeProvider) {
                        const state = getOAuthState(activeProvider);
                        if (state.status === 'polling') {
                            updateOAuthState(activeProvider, { status: 'idle', data: undefined });
                        }
                    }
                }}
                title={activeProvider ? `Authenticate with ${PROVIDER_LABELS[activeProvider]}` : 'OAuth Authentication'}
                size="md"
            >
                {activeProvider && (() => {
                    const state = getOAuthState(activeProvider);
                    if (!state.data) return null;

                    return (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                            {state.data.verification_uri && (
                                <div>
                                    <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text)', marginBottom: '8px' }}>
                                        1. Visit this URL:
                                    </div>
                                    <a
                                        href={state.data.verification_uri}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        style={{
                                            display: 'block',
                                            padding: '12px',
                                            background: 'var(--color-bg-deep)',
                                            border: '1px solid var(--color-border-glass)',
                                            borderRadius: 'var(--radius-sm)',
                                            color: 'var(--color-primary)',
                                            textDecoration: 'none',
                                            fontFamily: 'monospace',
                                            fontSize: '14px',
                                            wordBreak: 'break-all'
                                        }}
                                    >
                                        {state.data.verification_uri}
                                    </a>
                                </div>
                            )}

                            {state.data.user_code && (
                                <div>
                                    <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text)', marginBottom: '8px' }}>
                                        2. Enter this code:
                                    </div>
                                    <div
                                        style={{
                                            padding: '16px',
                                            background: 'var(--color-bg-deep)',
                                            border: '2px solid var(--color-primary)',
                                            borderRadius: 'var(--radius-sm)',
                                            fontSize: '24px',
                                            fontWeight: 700,
                                            fontFamily: 'monospace',
                                            textAlign: 'center',
                                            color: 'var(--color-text)',
                                            letterSpacing: '4px'
                                        }}
                                    >
                                        {state.data.user_code}
                                    </div>
                                </div>
                            )}

                            {state.data.url && !state.data.verification_uri && (
                                <div>
                                    <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text)', marginBottom: '8px' }}>
                                        Click here to authenticate:
                                    </div>
                                    <a
                                        href={state.data.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        style={{
                                            display: 'block',
                                            padding: '12px',
                                            background: 'linear-gradient(135deg, var(--color-primary), var(--color-secondary))',
                                            borderRadius: 'var(--radius-sm)',
                                            color: '#000',
                                            textDecoration: 'none',
                                            textAlign: 'center',
                                            fontWeight: 600
                                        }}
                                    >
                                        Open OAuth Login Page
                                    </a>
                                </div>
                            )}

                            <div
                                style={{
                                    padding: '12px',
                                    background: 'rgba(245, 158, 11, 0.1)',
                                    border: '1px solid rgba(245, 158, 11, 0.3)',
                                    borderRadius: 'var(--radius-sm)',
                                    fontSize: '13px',
                                    color: 'var(--color-text-secondary)'
                                }}
                            >
                                Waiting for you to complete authentication... This window will close automatically when done.
                            </div>
                        </div>
                    );
                })()}
            </Modal>

            {/* Callback URL Modal */}
            <Modal
                isOpen={showCallbackModal}
                onClose={() => {
                    setShowCallbackModal(false);
                    setCallbackUrl('');
                }}
                title="Manual OAuth Callback"
                footer={
                    <>
                        <Button
                            variant="secondary"
                            onClick={() => {
                                setShowCallbackModal(false);
                                setCallbackUrl('');
                            }}
                            disabled={submitting}
                        >
                            Cancel
                        </Button>
                        <Button onClick={submitCallback} loading={submitting}>
                            Submit
                        </Button>
                    </>
                }
            >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <p style={{ margin: 0, fontSize: '14px', color: 'var(--color-text-secondary)' }}>
                        After completing OAuth in your browser, paste the full callback URL here:
                    </p>
                    <Input
                        label="Callback URL"
                        placeholder="https://..."
                        value={callbackUrl}
                        onChange={(e) => setCallbackUrl(e.target.value)}
                        fullWidth
                        autoFocus
                    />
                </div>
            </Modal>

            {/* iFlow Cookie Modal */}
            <Modal
                isOpen={showIFlowModal}
                onClose={() => {
                    setShowIFlowModal(false);
                    setIflowCookie('');
                }}
                title="iFlow Cookie Authentication"
                footer={
                    <>
                        <Button
                            variant="secondary"
                            onClick={() => {
                                setShowIFlowModal(false);
                                setIflowCookie('');
                            }}
                            disabled={submitting}
                        >
                            Cancel
                        </Button>
                        <Button onClick={submitIFlowAuth} loading={submitting}>
                            Submit
                        </Button>
                    </>
                }
            >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <p style={{ margin: 0, fontSize: '14px', color: 'var(--color-text-secondary)' }}>
                        Enter your iFlow authentication cookie:
                    </p>
                    <Input
                        label="Cookie"
                        placeholder="Enter cookie value..."
                        value={iflowCookie}
                        onChange={(e) => setIflowCookie(e.target.value)}
                        fullWidth
                        autoFocus
                    />
                </div>
            </Modal>
        </div>
    );
}

export default OAuthPage;
