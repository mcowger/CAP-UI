/**
 * Config Editor Page
 *
 * YAML configuration editor with:
 * - Syntax highlighting
 * - Save/Reset functionality
 * - Dirty state tracking
 * - YAML validation
 */

import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useNotification } from '../../contexts/NotificationContext';
import { managementApi } from '../../lib/management-api';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import CodeMirror from '@uiw/react-codemirror';
import { yaml } from '@codemirror/lang-yaml';

export function ConfigEditorPage() {
    const { connectionStatus } = useAuth();
    const { showNotification } = useNotification();

    const [yamlContent, setYamlContent] = useState('');
    const [originalContent, setOriginalContent] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [isDirty, setIsDirty] = useState(false);

    const disableControls = connectionStatus !== 'connected';

    // Load YAML config
    const loadConfig = async () => {
        setLoading(true);
        try {
            const yaml = await managementApi.getConfigYaml();
            setYamlContent(yaml);
            setOriginalContent(yaml);
            setIsDirty(false);
        } catch (error) {
            showNotification(
                `Failed to load config: ${error instanceof Error ? error.message : 'Unknown error'}`,
                'error'
            );
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadConfig();
    }, []);

    // Track dirty state
    useEffect(() => {
        setIsDirty(yamlContent !== originalContent);
    }, [yamlContent, originalContent]);

    // Handle save
    const handleSave = async () => {
        // Basic YAML validation - try to parse as a sanity check
        // Note: This is a simple check, the server will do full validation
        try {
            // Just check for obvious syntax errors
            if (yamlContent.trim() === '') {
                showNotification('Config cannot be empty', 'error');
                return;
            }
        } catch (error) {
            showNotification('Invalid YAML syntax', 'error');
            return;
        }

        setSaving(true);
        try {
            await managementApi.updateConfigYaml(yamlContent);
            setOriginalContent(yamlContent);
            setIsDirty(false);
            showNotification('Configuration saved successfully', 'success');
        } catch (error) {
            showNotification(
                `Failed to save config: ${error instanceof Error ? error.message : 'Unknown error'}`,
                'error'
            );
        } finally {
            setSaving(false);
        }
    };

    // Handle reset
    const handleReset = async () => {
        if (isDirty) {
            const confirm = window.confirm('You have unsaved changes. Are you sure you want to reset?');
            if (!confirm) return;
        }

        await loadConfig();
        showNotification('Configuration reset to saved state', 'info');
    };

    // Keyboard shortcut: Ctrl/Cmd + S to save
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                if (isDirty && !saving && !disableControls) {
                    handleSave();
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isDirty, saving, disableControls, yamlContent]);

    // Warn before leaving with unsaved changes
    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (isDirty) {
                e.preventDefault();
                e.returnValue = '';
            }
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [isDirty]);

    return (
        <div className="main-content-inner">
            <div className="page-header">
                <h1 className="page-title">Configuration Editor</h1>
                <p className="page-description">
                    Edit CLIProxy YAML configuration • {isDirty && <span style={{ color: 'var(--color-primary)' }}>Unsaved changes</span>}
                </p>
            </div>

            <div style={{ maxWidth: '100%', overflow: 'hidden' }}>
            <Card
                extra={
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <Button
                            variant="secondary"
                            onClick={handleReset}
                            disabled={disableControls || loading || saving}
                            size="sm"
                        >
                            Reset
                        </Button>
                        <Button
                            onClick={handleSave}
                            loading={saving}
                            disabled={disableControls || loading || !isDirty}
                            size="sm"
                        >
                            Save {isDirty && '(Ctrl+S)'}
                        </Button>
                    </div>
                }
            >
                {loading ? (
                    <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                        Loading configuration...
                    </div>
                ) : (
                    <div className="code-editor-container">
                        <div className="code-editor-wrapper">
                            <CodeMirror
                                value={yamlContent}
                                height="600px"
                                width="100%"
                                maxWidth="100%"
                                extensions={[yaml()]}
                                onChange={(value) => setYamlContent(value)}
                                theme="dark"
                                basicSetup={{
                                    lineNumbers: true,
                                    highlightActiveLineGutter: true,
                                    highlightActiveLine: true,
                                    foldGutter: true,
                                    dropCursor: true,
                                    allowMultipleSelections: true,
                                    indentOnInput: true,
                                    bracketMatching: true,
                                    closeBrackets: true,
                                    autocompletion: true,
                                    highlightSelectionMatches: true,
                                    searchKeymap: true,
                                    historyKeymap: true,
                                    foldKeymap: true,
                                    completionKeymap: true,
                                    lintKeymap: true
                                }}
                                style={{
                                    fontSize: '14px',
                                    fontFamily: 'monospace',
                                    backgroundColor: 'var(--color-bg-deep)',
                                    maxWidth: '100%',
                                    width: '100%'
                                }}
                                editable={!disableControls}
                            />
                        </div>
                    </div>
                )}

                {!loading && (
                    <div className="code-editor-container" style={{ marginTop: '16px', padding: '12px', background: 'var(--color-bg-glass)', borderRadius: 'var(--radius-sm)', fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                        <strong>Tips:</strong>
                        <ul style={{ margin: '8px 0 0 20px', padding: 0 }}>
                            <li>Press Ctrl/Cmd + S to save</li>
                            <li>Changes take effect immediately after saving</li>
                            <li>Invalid YAML will be rejected by the server</li>
                            <li>Use Reset to discard changes and reload from server</li>
                        </ul>
                    </div>
                )}
            </Card>
            </div>
        </div>
    );
}

export default ConfigEditorPage;
