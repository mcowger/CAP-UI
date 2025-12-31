/**
 * API Keys Page
 *
 * Manages CLIProxy API keys with CRUD operations:
 * - List all API keys (masked display)
 * - Add new API key
 * - Edit existing key
 * - Delete key with confirmation
 * - Show/hide key visibility
 */

import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useNotification } from '../../contexts/NotificationContext';
import { managementApi } from '../../lib/management-api';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Modal } from '../ui/Modal';
import { EmptyState } from '../ui/EmptyState';
import { Key } from '../Icons';

interface ApiKeyItem {
    value: string;
    index: number;
    visible: boolean;
}

export function ApiKeysPage() {
    const { connectionStatus } = useAuth();
    const { showNotification } = useNotification();

    const [keys, setKeys] = useState<ApiKeyItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAddModal, setShowAddModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [newKeyValue, setNewKeyValue] = useState('');
    const [editingKey, setEditingKey] = useState<ApiKeyItem | null>(null);
    const [editKeyValue, setEditKeyValue] = useState('');
    const [deletingIndex, setDeletingIndex] = useState<number | null>(null);
    const [saving, setSaving] = useState(false);

    const disableControls = connectionStatus !== 'connected';

    // Load API keys
    const loadKeys = async () => {
        setLoading(true);
        try {
            const apiKeys = await managementApi.getApiKeys();
            setKeys(apiKeys.map((value, index) => ({
                value,
                index,
                visible: false
            })));
        } catch (error) {
            showNotification(
                `Failed to load API keys: ${error instanceof Error ? error.message : 'Unknown error'}`,
                'error'
            );
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadKeys();
    }, []);

    // Mask API key for display
    const maskKey = (key: string): string => {
        if (key.length <= 10) return '***';
        return `${key.slice(0, 7)}...${key.slice(-4)}`;
    };

    // Toggle key visibility
    const toggleVisibility = (index: number) => {
        setKeys(prev => prev.map(key =>
            key.index === index ? { ...key, visible: !key.visible } : key
        ));
    };

    // Add new key
    const handleAdd = async () => {
        if (!newKeyValue.trim()) {
            showNotification('API key cannot be empty', 'error');
            return;
        }

        setSaving(true);
        try {
            const updatedKeys = [...keys.map(k => k.value), newKeyValue.trim()];
            await managementApi.updateApiKeys(updatedKeys);
            await loadKeys();
            setShowAddModal(false);
            setNewKeyValue('');
            showNotification('API key added successfully', 'success');
        } catch (error) {
            showNotification(
                `Failed to add API key: ${error instanceof Error ? error.message : 'Unknown error'}`,
                'error'
            );
        } finally {
            setSaving(false);
        }
    };

    // Edit existing key
    const handleEdit = async () => {
        if (!editingKey || !editKeyValue.trim()) {
            showNotification('API key cannot be empty', 'error');
            return;
        }

        setSaving(true);
        try {
            await managementApi.patchApiKey(editingKey.index, editKeyValue.trim());
            await loadKeys();
            setShowEditModal(false);
            setEditingKey(null);
            setEditKeyValue('');
            showNotification('API key updated successfully', 'success');
        } catch (error) {
            showNotification(
                `Failed to update API key: ${error instanceof Error ? error.message : 'Unknown error'}`,
                'error'
            );
        } finally {
            setSaving(false);
        }
    };

    // Delete key
    const handleDelete = async () => {
        if (deletingIndex === null) return;

        setSaving(true);
        try {
            await managementApi.deleteApiKey(deletingIndex);
            await loadKeys();
            setShowDeleteModal(false);
            setDeletingIndex(null);
            showNotification('API key deleted successfully', 'success');
        } catch (error) {
            showNotification(
                `Failed to delete API key: ${error instanceof Error ? error.message : 'Unknown error'}`,
                'error'
            );
        } finally {
            setSaving(false);
        }
    };

    // Open edit modal
    const openEditModal = (key: ApiKeyItem) => {
        setEditingKey(key);
        setEditKeyValue(key.value);
        setShowEditModal(true);
    };

    // Open delete confirmation
    const openDeleteModal = (index: number) => {
        setDeletingIndex(index);
        setShowDeleteModal(true);
    };

    return (
        <div className="main-content-inner">
            <div className="page-header">
                <h1 className="page-title">API Keys</h1>
                <p className="page-description">Manage proxy API keys for client authentication</p>
            </div>

            <Card
                extra={
                    <Button
                        onClick={() => setShowAddModal(true)}
                        disabled={disableControls || loading}
                        size="sm"
                    >
                        + Add API Key
                    </Button>
                }
            >
                {loading ? (
                    <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                        Loading API keys...
                    </div>
                ) : keys.length === 0 ? (
                    <EmptyState
                        icon={<Key />}
                        title="No API Keys"
                        description="Add your first API key to enable client authentication"
                        action={
                            <Button onClick={() => setShowAddModal(true)} disabled={disableControls}>
                                Add API Key
                            </Button>
                        }
                    />
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {keys.map((key) => (
                            <div
                                key={key.index}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '12px',
                                    padding: '16px',
                                    background: 'var(--color-bg-glass)',
                                    border: '1px solid var(--color-border-glass)',
                                    borderRadius: 'var(--radius-md)',
                                    backdropFilter: 'blur(var(--glass-blur))'
                                }}
                            >
                                <code
                                    style={{
                                        flex: 1,
                                        fontFamily: 'monospace',
                                        fontSize: '14px',
                                        color: 'var(--color-text)',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap'
                                    }}
                                >
                                    {key.visible ? key.value : maskKey(key.value)}
                                </code>

                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => toggleVisibility(key.index)}
                                    disabled={disableControls}
                                >
                                    {key.visible ? 'Hide' : 'Show'}
                                </Button>

                                <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => openEditModal(key)}
                                    disabled={disableControls}
                                >
                                    Edit
                                </Button>

                                <Button
                                    variant="danger"
                                    size="sm"
                                    onClick={() => openDeleteModal(key.index)}
                                    disabled={disableControls}
                                >
                                    Delete
                                </Button>
                            </div>
                        ))}
                    </div>
                )}
            </Card>

            {/* Add API Key Modal */}
            <Modal
                isOpen={showAddModal}
                onClose={() => {
                    setShowAddModal(false);
                    setNewKeyValue('');
                }}
                title="Add API Key"
                footer={
                    <>
                        <Button
                            variant="secondary"
                            onClick={() => {
                                setShowAddModal(false);
                                setNewKeyValue('');
                            }}
                            disabled={saving}
                        >
                            Cancel
                        </Button>
                        <Button onClick={handleAdd} loading={saving}>
                            Add Key
                        </Button>
                    </>
                }
            >
                <Input
                    label="API Key"
                    placeholder="sk-..."
                    value={newKeyValue}
                    onChange={(e) => setNewKeyValue(e.target.value)}
                    fullWidth
                    autoFocus
                />
            </Modal>

            {/* Edit API Key Modal */}
            <Modal
                isOpen={showEditModal}
                onClose={() => {
                    setShowEditModal(false);
                    setEditingKey(null);
                    setEditKeyValue('');
                }}
                title="Edit API Key"
                footer={
                    <>
                        <Button
                            variant="secondary"
                            onClick={() => {
                                setShowEditModal(false);
                                setEditingKey(null);
                                setEditKeyValue('');
                            }}
                            disabled={saving}
                        >
                            Cancel
                        </Button>
                        <Button onClick={handleEdit} loading={saving}>
                            Update Key
                        </Button>
                    </>
                }
            >
                <Input
                    label="API Key"
                    placeholder="sk-..."
                    value={editKeyValue}
                    onChange={(e) => setEditKeyValue(e.target.value)}
                    fullWidth
                    autoFocus
                />
            </Modal>

            {/* Delete Confirmation Modal */}
            <Modal
                isOpen={showDeleteModal}
                onClose={() => {
                    setShowDeleteModal(false);
                    setDeletingIndex(null);
                }}
                title="Delete API Key"
                size="sm"
                footer={
                    <>
                        <Button
                            variant="secondary"
                            onClick={() => {
                                setShowDeleteModal(false);
                                setDeletingIndex(null);
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
                    Are you sure you want to delete this API key? This action cannot be undone.
                </p>
            </Modal>
        </div>
    );
}

export default ApiKeysPage;
