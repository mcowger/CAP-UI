/**
 * Error Boundary Component
 *
 * Catches JavaScript errors in child components and displays a fallback UI.
 */

import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle } from './Icons';
import { Button } from './ui/Button';
import { Card } from './ui/Card';

interface ErrorBoundaryProps {
    children: ReactNode;
    fallback?: ReactNode;
    onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface ErrorBoundaryState {
    hasError: boolean;
    error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    constructor(props: ErrorBoundaryProps) {
        super(props);
        this.state = {
            hasError: false,
            error: null
        };
    }

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return {
            hasError: true,
            error
        };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('ErrorBoundary caught error:', error, errorInfo);

        if (this.props.onError) {
            this.props.onError(error, errorInfo);
        }
    }

    handleReset = () => {
        this.setState({
            hasError: false,
            error: null
        });
    };

    render() {
        if (this.state.hasError) {
            if (this.props.fallback) {
                return this.props.fallback;
            }

            return (
                <div className="main-content-inner">
                    <Card>
                        <div style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: '40px',
                            textAlign: 'center',
                            gap: '24px'
                        }}>
                            <div style={{
                                width: '80px',
                                height: '80px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                background: 'rgba(239, 68, 68, 0.1)',
                                border: '2px solid var(--color-danger)',
                                borderRadius: '50%',
                                color: 'var(--color-danger)'
                            }}>
                                <AlertCircle />
                            </div>

                            <div>
                                <h2 style={{
                                    fontFamily: 'var(--font-heading)',
                                    fontSize: '20px',
                                    fontWeight: 600,
                                    color: 'var(--color-text)',
                                    margin: '0 0 12px 0'
                                }}>
                                    Something went wrong
                                </h2>
                                <p style={{
                                    fontSize: '14px',
                                    color: 'var(--color-text-secondary)',
                                    margin: 0,
                                    maxWidth: '500px'
                                }}>
                                    An unexpected error occurred. Please try again or contact support if the problem persists.
                                </p>
                            </div>

                            {this.state.error && (
                                <details style={{
                                    width: '100%',
                                    maxWidth: '600px',
                                    padding: '12px',
                                    background: 'var(--color-bg-deep)',
                                    border: '1px solid var(--color-border-glass)',
                                    borderRadius: 'var(--radius-sm)',
                                    fontSize: '12px',
                                    fontFamily: 'monospace',
                                    color: 'var(--color-text-secondary)',
                                    textAlign: 'left',
                                    cursor: 'pointer'
                                }}>
                                    <summary style={{ marginBottom: '8px', fontWeight: 600 }}>
                                        Error details
                                    </summary>
                                    <pre style={{
                                        margin: 0,
                                        whiteSpace: 'pre-wrap',
                                        wordBreak: 'break-word'
                                    }}>
                                        {this.state.error.toString()}
                                        {this.state.error.stack && `\n\n${this.state.error.stack}`}
                                    </pre>
                                </details>
                            )}

                            <div style={{ display: 'flex', gap: '12px' }}>
                                <Button onClick={this.handleReset} variant="primary">
                                    Try Again
                                </Button>
                                <Button onClick={() => window.location.href = '/#/usage-analytics'} variant="secondary">
                                    Go to Dashboard
                                </Button>
                            </div>
                        </div>
                    </Card>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
