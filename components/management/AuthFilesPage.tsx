/**
 * Auth Files Page
 *
 * Manage authentication files:
 * - List auth files with metadata
 * - Upload new files
 * - Download existing files
 * - Delete files
 * - Filter by provider/type
 * - Pagination
 */

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useNotification } from '../../contexts/NotificationContext';
import { managementApi, AuthFile } from '../../lib/management-api';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { EmptyState } from '../ui/EmptyState';
import { File, Robot, Info } from '../Icons';

export function AuthFilesPage() {
    const { connectionStatus } = useAuth();
    const { showNotification } = useNotification();

    const [files, setFiles] = useState<AuthFile[]>([]);
    const [filteredFiles, setFilteredFiles] = useState<AuthFile[]>([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [deleting, setDeleting] = useState(false);

    // Pagination
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);

    // Filters
    const [providerFilter, setProviderFilter] = useState<string>('all');

    // Modals
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [deletingFile, setDeletingFile] = useState<AuthFile | null>(null);
    const [showUploadModal, setShowUploadModal] = useState(false);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [showModelsModal, setShowModelsModal] = useState(false);
    const [showInfoModal, setShowInfoModal] = useState(false);
    const [modelsFile, setModelsFile] = useState<AuthFile | null>(null);
    const [infoFile, setInfoFile] = useState<AuthFile | null>(null);
    const [models, setModels] = useState<any[]>([]);
    const [fileContent, setFileContent] = useState<string>('');
    const [loadingModels, setLoadingModels] = useState(false);
    const [loadingInfo, setLoadingInfo] = useState(false);
    const [copying, setCopying] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);

    const disableControls = connectionStatus !== 'connected';

    // Load auth files
    const loadFiles = async () => {
        setLoading(true);
        try {
            const authFiles = await managementApi.listAuthFiles();
            setFiles(authFiles);
            applyFilters(authFiles);
        } catch (error) {
            showNotification(
                `Failed to load auth files: ${error instanceof Error ? error.message : 'Unknown error'}`,
                'error'
            );
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadFiles();
    }, []);

    // Apply filters
    const applyFilters = (fileList: AuthFile[]) => {
        let filtered = fileList;

        if (providerFilter !== 'all') {
            filtered = filtered.filter(f =>
                f.provider?.toLowerCase() === providerFilter.toLowerCase()
            );
        }

        setFilteredFiles(filtered);
        setCurrentPage(1); // Reset to first page when filters change
    };

    useEffect(() => {
        applyFilters(files);
    }, [providerFilter, files]);

    // Get unique providers for filter dropdown
    const getProviders = (): string[] => {
        const providers = new Set(files.map(f => f.provider).filter(Boolean) as string[]);
        return Array.from(providers).sort();
    };

    // Pagination
    const totalPages = Math.ceil(filteredFiles.length / pageSize);
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const currentFiles = filteredFiles.slice(startIndex, endIndex);

    // Handle file upload
    const handleUpload = async () => {
        if (!selectedFile) {
            showNotification('Please select a file', 'error');
            return;
        }

        setUploading(true);
        try {
            await managementApi.uploadAuthFile(selectedFile);
            await loadFiles();
            setShowUploadModal(false);
            setSelectedFile(null);
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
            showNotification('File uploaded successfully', 'success');
        } catch (error) {
            showNotification(
                `Failed to upload file: ${error instanceof Error ? error.message : 'Unknown error'}`,
                'error'
            );
        } finally {
            setUploading(false);
        }
    };

    // Handle file download
    const handleDownload = async (file: AuthFile) => {
        try {
            const blob = await managementApi.downloadAuthFile(file.name);
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = file.name;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            showNotification(`Downloaded ${file.name}`, 'success');
        } catch (error) {
            showNotification(
                `Failed to download file: ${error instanceof Error ? error.message : 'Unknown error'}`,
                'error'
            );
        }
    };

    // Handle file delete
    const handleDelete = async () => {
        if (!deletingFile) return;

        setDeleting(true);
        try {
            await managementApi.deleteAuthFile(deletingFile.name);
            await loadFiles();
            setShowDeleteModal(false);
            setDeletingFile(null);
            showNotification(`Deleted ${deletingFile.name}`, 'success');
        } catch (error) {
            showNotification(
                `Failed to delete file: ${error instanceof Error ? error.message : 'Unknown error'}`,
                'error'
            );
        } finally {
            setDeleting(false);
        }
    };

    const openDeleteModal = (file: AuthFile) => {
        setDeletingFile(file);
        setShowDeleteModal(true);
    };

    // Handle view models
    const handleViewModels = async (file: AuthFile) => {
        setModelsFile(file);
        setShowModelsModal(true);
        setLoadingModels(true);
        setModels([]);

        try {
            const modelList = await managementApi.getAuthFileModels(file.name);
            setModels(modelList);
        } catch (error) {
            showNotification(
                `Failed to fetch models: ${error instanceof Error ? error.message : 'Unknown error'}`,
                'error'
            );
            setModels([]);
        } finally {
            setLoadingModels(false);
        }
    };

    // Handle view info
    const handleViewInfo = async (file: AuthFile) => {
        setInfoFile(file);
        setShowInfoModal(true);
        setLoadingInfo(true);
        setFileContent('');

        try {
            const blob = await managementApi.downloadAuthFile(file.name);
            const text = await blob.text();
            console.log('[AuthFilesPage] Raw file content length:', text.length);
            console.log('[AuthFilesPage] First 100 chars:', text.substring(0, 100));

            // Try to parse and format as JSON
            try {
                const parsed = JSON.parse(text);
                console.log('[AuthFilesPage] Successfully parsed JSON');
                const formatted = JSON.stringify(parsed, null, 2);
                console.log('[AuthFilesPage] Formatted JSON length:', formatted.length);
                console.log('[AuthFilesPage] First 200 chars of formatted:', formatted.substring(0, 200));
                setFileContent(formatted);
            } catch (e) {
                // Not JSON, use raw text
                console.log('[AuthFilesPage] Not valid JSON, using raw text:', e);
                setFileContent(text);
            }
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            console.error('[AuthFilesPage] Failed to load file content:', errorMsg, error);
            showNotification(`Failed to load file content: ${errorMsg}`, 'error');
            setFileContent(`Error loading file content:\n\n${errorMsg}\n\nCheck the browser console and server logs for more details.`);
        } finally {
            setLoadingInfo(false);
        }
    };

    // Format file size
    const formatSize = (bytes?: number): string => {
        if (!bytes) return 'N/A';
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    // Format modified date
    const formatDate = (timestamp?: number): string => {
        if (!timestamp) return 'N/A';
        return new Date(timestamp * 1000).toLocaleString();
    };

    // Handle copy to clipboard
    const handleCopyContent = async () => {
        try {
            setCopying(true);
            await navigator.clipboard.writeText(fileContent);
            showNotification('Content copied to clipboard', 'success');
        } catch (error) {
            showNotification('Failed to copy to clipboard', 'error');
        } finally {
            setTimeout(() => setCopying(false), 1000);
        }
    };

    // Check if content is JSON
    const isJsonContent = (content: string): boolean => {
        try {
            JSON.parse(content);
            return true;
        } catch {
            return false;
        }
    };

    // Syntax highlight JSON
    const highlightJson = (json: string): string => {
        // First escape HTML entities
        let html = json
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');

        // Then apply syntax highlighting
        html = html.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, (match) => {
            let cls = 'json-number';
            if (/^"/.test(match)) {
                if (/:$/.test(match)) {
                    cls = 'json-key';
                } else {
                    cls = 'json-string';
                }
            } else if (/true|false/.test(match)) {
                cls = 'json-boolean';
            } else if (/null/.test(match)) {
                cls = 'json-null';
            }
            return `<span class="${cls}">${match}</span>`;
        });

        return html;
    };

    return (
        <div className="main-content-inner">
            <div className="page-header">
                <h1 className="page-title">Auth Files</h1>
                <p className="page-description">Upload and manage authentication files</p>
            </div>

            {/* Filters */}
            <div style={{ marginBottom: '16px', display: 'flex', gap: '12px', alignItems: 'center' }}>
                <div>
                    <label style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginRight: '8px' }}>
                        Provider:
                    </label>
                    <select
                        value={providerFilter}
                        onChange={(e) => setProviderFilter(e.target.value)}
                        disabled={loading}
                        style={{
                            padding: '6px 12px',
                            background: 'var(--color-bg-glass)',
                            border: '1px solid var(--color-border-glass)',
                            borderRadius: 'var(--radius-sm)',
                            color: 'var(--color-text)',
                            fontSize: '13px',
                            outline: 'none'
                        }}
                    >
                        <option value="all">All Providers</option>
                        {getProviders().map(provider => (
                            <option key={provider} value={provider}>
                                {provider}
                            </option>
                        ))}
                    </select>
                </div>

                <div style={{ marginLeft: 'auto' }}>
                    <label style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginRight: '8px' }}>
                        Per Page:
                    </label>
                    <select
                        value={pageSize}
                        onChange={(e) => {
                            setPageSize(Number(e.target.value));
                            setCurrentPage(1);
                        }}
                        disabled={loading}
                        style={{
                            padding: '6px 12px',
                            background: 'var(--color-bg-glass)',
                            border: '1px solid var(--color-border-glass)',
                            borderRadius: 'var(--radius-sm)',
                            color: 'var(--color-text)',
                            fontSize: '13px',
                            outline: 'none'
                        }}
                    >
                        <option value="10">10</option>
                        <option value="25">25</option>
                        <option value="50">50</option>
                    </select>
                </div>
            </div>

            <Card
                extra={
                    <Button
                        onClick={() => setShowUploadModal(true)}
                        disabled={disableControls || loading}
                        size="sm"
                    >
                        + Upload File
                    </Button>
                }
            >
                {loading ? (
                    <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                        Loading auth files...
                    </div>
                ) : filteredFiles.length === 0 ? (
                    <EmptyState
                        icon={<File />}
                        title="No auth files found"
                        description={providerFilter === 'all' ? 'Upload authentication files to get started' : `No files for provider: ${providerFilter}`}
                        action={
                            providerFilter === 'all' ? (
                                <Button onClick={() => setShowUploadModal(true)} disabled={disableControls}>
                                    Upload File
                                </Button>
                            ) : (
                                <Button variant="secondary" onClick={() => setProviderFilter('all')}>
                                    Clear Filter
                                </Button>
                            )
                        }
                    />
                ) : (
                    <>
                        {/* File Table */}
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ borderBottom: '2px solid var(--color-border-glass)' }}>
                                        <th style={{ padding: '12px', textAlign: 'left', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                                            Name
                                        </th>
                                        <th style={{ padding: '12px', textAlign: 'left', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                                            Provider
                                        </th>
                                        <th style={{ padding: '12px', textAlign: 'left', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                                            Type
                                        </th>
                                        <th style={{ padding: '12px', textAlign: 'left', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                                            Size
                                        </th>
                                        <th style={{ padding: '12px', textAlign: 'left', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                                            Modified
                                        </th>
                                        <th style={{ padding: '12px', textAlign: 'right', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                                            Actions
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {currentFiles.map((file, index) => (
                                        <tr
                                            key={index}
                                            style={{
                                                borderBottom: '1px solid var(--color-border-glass)',
                                                transition: 'background 0.2s ease'
                                            }}
                                        >
                                            <td style={{ padding: '12px', fontSize: '14px', color: 'var(--color-text)' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    {file.name}
                                                    {file.runtime_only && (
                                                        <span
                                                            style={{
                                                                fontSize: '11px',
                                                                padding: '2px 6px',
                                                                background: 'rgba(245, 158, 11, 0.2)',
                                                                color: 'var(--color-primary)',
                                                                borderRadius: '3px',
                                                                fontWeight: 600
                                                            }}
                                                        >
                                                            RUNTIME
                                                        </span>
                                                    )}
                                                    {file.disabled && (
                                                        <span
                                                            style={{
                                                                fontSize: '11px',
                                                                padding: '2px 6px',
                                                                background: 'rgba(239, 68, 68, 0.2)',
                                                                color: 'var(--color-danger)',
                                                                borderRadius: '3px',
                                                                fontWeight: 600
                                                            }}
                                                        >
                                                            DISABLED
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td style={{ padding: '12px', fontSize: '14px', color: 'var(--color-text-secondary)' }}>
                                                {file.provider || 'N/A'}
                                            </td>
                                            <td style={{ padding: '12px', fontSize: '14px', color: 'var(--color-text-secondary)' }}>
                                                {file.type || 'N/A'}
                                            </td>
                                            <td style={{ padding: '12px', fontSize: '14px', color: 'var(--color-text-secondary)' }}>
                                                {formatSize(file.size)}
                                            </td>
                                            <td style={{ padding: '12px', fontSize: '14px', color: 'var(--color-text-secondary)' }}>
                                                {formatDate(file.modified)}
                                            </td>
                                            <td style={{ padding: '12px', textAlign: 'right' }}>
                                                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', alignItems: 'center' }}>
                                                    <button
                                                        onClick={() => handleViewModels(file)}
                                                        disabled={disableControls}
                                                        title="View Models"
                                                        style={{
                                                            padding: '6px 8px',
                                                            background: 'var(--color-bg-glass)',
                                                            border: '1px solid var(--color-border-glass)',
                                                            borderRadius: 'var(--radius-sm)',
                                                            color: 'var(--color-text)',
                                                            cursor: disableControls ? 'not-allowed' : 'pointer',
                                                            opacity: disableControls ? 0.5 : 1,
                                                            transition: 'all 0.2s ease',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center'
                                                        }}
                                                        onMouseEnter={(e) => {
                                                            if (!disableControls) {
                                                                e.currentTarget.style.background = 'var(--color-bg-hover)';
                                                                e.currentTarget.style.borderColor = 'var(--color-primary)';
                                                            }
                                                        }}
                                                        onMouseLeave={(e) => {
                                                            e.currentTarget.style.background = 'var(--color-bg-glass)';
                                                            e.currentTarget.style.borderColor = 'var(--color-border-glass)';
                                                        }}
                                                    >
                                                        <Robot />
                                                    </button>
                                                    <button
                                                        onClick={() => handleViewInfo(file)}
                                                        disabled={disableControls || file.runtime_only}
                                                        title="View File Info"
                                                        style={{
                                                            padding: '6px 8px',
                                                            background: 'var(--color-bg-glass)',
                                                            border: '1px solid var(--color-border-glass)',
                                                            borderRadius: 'var(--radius-sm)',
                                                            color: 'var(--color-text)',
                                                            cursor: disableControls || file.runtime_only ? 'not-allowed' : 'pointer',
                                                            opacity: disableControls || file.runtime_only ? 0.5 : 1,
                                                            transition: 'all 0.2s ease',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center'
                                                        }}
                                                        onMouseEnter={(e) => {
                                                            if (!disableControls && !file.runtime_only) {
                                                                e.currentTarget.style.background = 'var(--color-bg-hover)';
                                                                e.currentTarget.style.borderColor = 'var(--color-primary)';
                                                            }
                                                        }}
                                                        onMouseLeave={(e) => {
                                                            e.currentTarget.style.background = 'var(--color-bg-glass)';
                                                            e.currentTarget.style.borderColor = 'var(--color-border-glass)';
                                                        }}
                                                    >
                                                        <Info />
                                                    </button>
                                                    <Button
                                                        size="sm"
                                                        variant="secondary"
                                                        onClick={() => handleDownload(file)}
                                                        disabled={disableControls || file.runtime_only}
                                                    >
                                                        Download
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        variant="danger"
                                                        onClick={() => openDeleteModal(file)}
                                                        disabled={disableControls}
                                                    >
                                                        Delete
                                                    </Button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Pagination */}
                        {totalPages > 1 && (
                            <div
                                style={{
                                    marginTop: '16px',
                                    padding: '16px 0',
                                    borderTop: '1px solid var(--color-border-glass)',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center'
                                }}
                            >
                                <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                                    Showing {startIndex + 1}-{Math.min(endIndex, filteredFiles.length)} of {filteredFiles.length} files
                                </div>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <Button
                                        size="sm"
                                        variant="secondary"
                                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                        disabled={currentPage === 1}
                                    >
                                        Previous
                                    </Button>
                                    <div style={{ padding: '6px 12px', fontSize: '13px', color: 'var(--color-text)' }}>
                                        Page {currentPage} of {totalPages}
                                    </div>
                                    <Button
                                        size="sm"
                                        variant="secondary"
                                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                        disabled={currentPage === totalPages}
                                    >
                                        Next
                                    </Button>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </Card>

            {/* Upload Modal */}
            <Modal
                isOpen={showUploadModal}
                onClose={() => {
                    setShowUploadModal(false);
                    setSelectedFile(null);
                    if (fileInputRef.current) {
                        fileInputRef.current.value = '';
                    }
                }}
                title="Upload Auth File"
                footer={
                    <>
                        <Button
                            variant="secondary"
                            onClick={() => {
                                setShowUploadModal(false);
                                setSelectedFile(null);
                                if (fileInputRef.current) {
                                    fileInputRef.current.value = '';
                                }
                            }}
                            disabled={uploading}
                        >
                            Cancel
                        </Button>
                        <Button onClick={handleUpload} loading={uploading} disabled={!selectedFile}>
                            Upload
                        </Button>
                    </>
                }
            >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <input
                        ref={fileInputRef}
                        type="file"
                        onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                        style={{
                            padding: '10px',
                            background: 'var(--color-bg-glass)',
                            border: '1px solid var(--color-border-glass)',
                            borderRadius: 'var(--radius-sm)',
                            color: 'var(--color-text)',
                            fontSize: '14px',
                            outline: 'none'
                        }}
                    />
                    {selectedFile && (
                        <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                            Selected: {selectedFile.name} ({formatSize(selectedFile.size)})
                        </div>
                    )}
                </div>
            </Modal>

            {/* Delete Confirmation Modal */}
            <Modal
                isOpen={showDeleteModal}
                onClose={() => {
                    setShowDeleteModal(false);
                    setDeletingFile(null);
                }}
                title="Delete Auth File"
                size="sm"
                footer={
                    <>
                        <Button
                            variant="secondary"
                            onClick={() => {
                                setShowDeleteModal(false);
                                setDeletingFile(null);
                            }}
                            disabled={deleting}
                        >
                            Cancel
                        </Button>
                        <Button variant="danger" onClick={handleDelete} loading={deleting}>
                            Delete
                        </Button>
                    </>
                }
            >
                <p style={{ margin: 0, color: 'var(--color-text-secondary)' }}>
                    Are you sure you want to delete <strong>{deletingFile?.name}</strong>? This action cannot be undone.
                </p>
            </Modal>

            {/* Models Modal */}
            <Modal
                isOpen={showModelsModal}
                onClose={() => {
                    setShowModelsModal(false);
                    setModelsFile(null);
                    setModels([]);
                }}
                title={`Models - ${modelsFile?.name || ''}`}
                size="md"
            >
                {loadingModels ? (
                    <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                        Loading models...
                    </div>
                ) : models.length === 0 ? (
                    <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                        No models found
                    </div>
                ) : (
                    <div
                        style={{
                            maxHeight: '400px',
                            overflowY: 'auto',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '8px'
                        }}
                    >
                        {models.map((model, index) => (
                            <div
                                key={index}
                                style={{
                                    padding: '12px',
                                    background: 'var(--color-bg-glass)',
                                    border: '1px solid var(--color-border-glass)',
                                    borderRadius: 'var(--radius-sm)',
                                    backdropFilter: 'blur(var(--glass-blur))'
                                }}
                            >
                                <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text)', fontFamily: 'monospace' }}>
                                    {typeof model === 'string' ? model : model.name || model.id || 'Unknown Model'}
                                </div>
                                {typeof model === 'object' && model.description && (
                                    <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
                                        {model.description}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </Modal>

            {/* Info Modal */}
            <Modal
                isOpen={showInfoModal}
                onClose={() => {
                    setShowInfoModal(false);
                    setInfoFile(null);
                    setFileContent('');
                }}
                title={`File Info - ${infoFile?.name || ''}`}
                size="lg"
            >
                {loadingInfo ? (
                    <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                        Loading file content...
                    </div>
                ) : (
                    <div style={{ position: 'relative' }}>
                        {/* Copy button */}
                        <button
                            onClick={handleCopyContent}
                            disabled={!fileContent || copying}
                            style={{
                                position: 'absolute',
                                top: '8px',
                                right: '8px',
                                padding: '8px 16px',
                                background: copying ? 'var(--color-success)' : 'var(--color-bg-glass)',
                                border: `1px solid ${copying ? 'var(--color-success)' : 'var(--color-border-glass)'}`,
                                borderRadius: 'var(--radius-sm)',
                                color: copying ? '#fff' : 'var(--color-text)',
                                fontSize: '13px',
                                fontWeight: 500,
                                cursor: !fileContent || copying ? 'not-allowed' : 'pointer',
                                opacity: !fileContent ? 0.5 : 1,
                                transition: 'all 0.2s ease',
                                zIndex: 10,
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px'
                            }}
                            onMouseEnter={(e) => {
                                if (!copying && fileContent) {
                                    e.currentTarget.style.background = 'var(--color-bg-hover)';
                                    e.currentTarget.style.borderColor = 'var(--color-primary)';
                                }
                            }}
                            onMouseLeave={(e) => {
                                if (!copying) {
                                    e.currentTarget.style.background = 'var(--color-bg-glass)';
                                    e.currentTarget.style.borderColor = 'var(--color-border-glass)';
                                }
                            }}
                        >
                            {copying ? (
                                <>
                                    <span>✓</span>
                                    <span>Copied!</span>
                                </>
                            ) : (
                                <>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                                    </svg>
                                    <span>Copy</span>
                                </>
                            )}
                        </button>

                        {isJsonContent(fileContent) ? (
                            <pre
                                className="json-viewer"
                                dangerouslySetInnerHTML={{ __html: highlightJson(fileContent) }}
                                style={{
                                    fontFamily: 'monospace',
                                    fontSize: '13px',
                                    background: 'var(--color-bg-deep)',
                                    padding: '16px',
                                    paddingTop: '48px',
                                    borderRadius: 'var(--radius-sm)',
                                    maxHeight: '500px',
                                    overflowY: 'auto',
                                    overflowX: 'auto',
                                    whiteSpace: 'pre',
                                    margin: 0
                                }}
                            />
                        ) : (
                            <pre
                                style={{
                                    fontFamily: 'monospace',
                                    fontSize: '12px',
                                    color: 'var(--color-text-secondary)',
                                    background: 'var(--color-bg-deep)',
                                    padding: '16px',
                                    paddingTop: '48px',
                                    borderRadius: 'var(--radius-sm)',
                                    maxHeight: '500px',
                                    overflowY: 'auto',
                                    overflowX: 'auto',
                                    whiteSpace: 'pre-wrap',
                                    wordBreak: 'break-all',
                                    margin: 0
                                }}
                            >
                                {fileContent || 'No content'}
                            </pre>
                        )}
                    </div>
                )}
            </Modal>
        </div>
    );
}

export default AuthFilesPage;
