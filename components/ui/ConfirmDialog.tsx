/**
 * Confirmation Dialog Component
 *
 * Reusable confirmation dialog for destructive actions.
 */

import { Modal } from './Modal';
import { Button } from './Button';
import { AlertCircle } from '../Icons';

interface ConfirmDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    danger?: boolean;
    loading?: boolean;
}

export function ConfirmDialog({
    isOpen,
    onClose,
    onConfirm,
    title,
    message,
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    danger = false,
    loading = false
}: ConfirmDialogProps) {
    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={title}
            size="sm"
            footer={
                <>
                    <Button
                        variant="secondary"
                        onClick={onClose}
                        disabled={loading}
                    >
                        {cancelText}
                    </Button>
                    <Button
                        variant={danger ? 'danger' : 'primary'}
                        onClick={onConfirm}
                        loading={loading}
                    >
                        {confirmText}
                    </Button>
                </>
            }
        >
            <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
                {danger && (
                    <div style={{ color: 'var(--color-danger)', flexShrink: 0 }}>
                        <AlertCircle />
                    </div>
                )}
                <p style={{ margin: 0, fontSize: '14px', color: 'var(--color-text)', lineHeight: '1.6' }}>
                    {message}
                </p>
            </div>
        </Modal>
    );
}

export default ConfirmDialog;
