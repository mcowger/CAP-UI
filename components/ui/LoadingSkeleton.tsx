/**
 * Loading Skeleton Component
 *
 * Animated loading placeholders for content.
 */

interface LoadingSkeletonProps {
    width?: string;
    height?: string;
    borderRadius?: string;
    count?: number;
    gap?: string;
}

export function LoadingSkeleton({
    width = '100%',
    height = '20px',
    borderRadius = 'var(--radius-sm)',
    count = 1,
    gap = '12px'
}: LoadingSkeletonProps) {
    if (count === 1) {
        return (
            <div
                style={{
                    width,
                    height,
                    borderRadius,
                    background: 'linear-gradient(90deg, var(--color-bg-glass) 0%, rgba(255, 255, 255, 0.05) 50%, var(--color-bg-glass) 100%)',
                    backgroundSize: '200% 100%',
                    animation: 'skeleton-loading 1.5s ease-in-out infinite'
                }}
            />
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap }}>
            {Array.from({ length: count }).map((_, i) => (
                <div
                    key={i}
                    style={{
                        width,
                        height,
                        borderRadius,
                        background: 'linear-gradient(90deg, var(--color-bg-glass) 0%, rgba(255, 255, 255, 0.05) 50%, var(--color-bg-glass) 100%)',
                        backgroundSize: '200% 100%',
                        animation: 'skeleton-loading 1.5s ease-in-out infinite',
                        animationDelay: `${i * 0.1}s`
                    }}
                />
            ))}
        </div>
    );
}

export function SkeletonCard() {
    return (
        <div
            style={{
                background: 'var(--color-bg-glass)',
                border: '1px solid var(--color-border-glass)',
                borderRadius: 'var(--radius-md)',
                padding: '20px',
                backdropFilter: 'blur(var(--glass-blur))'
            }}
        >
            <LoadingSkeleton width="40%" height="16px" />
            <div style={{ marginTop: '12px' }}>
                <LoadingSkeleton height="12px" count={3} gap="8px" />
            </div>
        </div>
    );
}

export function SkeletonTable({ rows = 5 }: { rows?: number }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <LoadingSkeleton height="40px" />
            {Array.from({ length: rows }).map((_, i) => (
                <LoadingSkeleton key={i} height="60px" />
            ))}
        </div>
    );
}

export default LoadingSkeleton;
