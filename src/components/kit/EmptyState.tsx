import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  body?: ReactNode;
  /** A button or link that fixes the emptiness. */
  action?: ReactNode;
  /** Sits inside a card that already has its own padding. */
  compact?: boolean;
  className?: string;
}

/**
 * The one shape every "nothing here yet" takes: an icon on a soft brand-tinted
 * disc, a short title, a line of help and, when there is one, the action that
 * fills it.
 */
export function EmptyState({ icon: Icon, title, body, action, compact = false, className }: EmptyStateProps) {
  return (
    <div className={`pb-empty${compact ? ' pb-empty-compact' : ''}${className ? ` ${className}` : ''}`}>
      <span className="pb-empty-icon" aria-hidden="true"><Icon size={compact ? 20 : 24} /></span>
      <p className="pb-empty-title">{title}</p>
      {body && <div className="pb-empty-body">{body}</div>}
      {action && <div className="pb-empty-action">{action}</div>}
    </div>
  );
}
