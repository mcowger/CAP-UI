/**
 * Card Component
 *
 * Glassmorphism card container with optional title and header actions.
 * Matches the existing fintech theme aesthetic.
 */

import type { ReactNode, HTMLAttributes } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  title?: string;
  extra?: ReactNode; // Header actions (buttons, etc.)
  children: ReactNode;
}

export function Card({ title, extra, children, className = '', ...rest }: CardProps) {
  const cardClasses = ['card', className].filter(Boolean).join(' ');

  return (
    <div className={cardClasses} {...rest}>
      {(title || extra) && (
        <div className="card-header">
          {title && <h3 className="card-title">{title}</h3>}
          {extra && <div className="card-extra">{extra}</div>}
        </div>
      )}
      <div className="card-content">{children}</div>
    </div>
  );
}

export default Card;
