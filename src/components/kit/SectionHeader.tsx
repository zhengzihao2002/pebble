import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

interface SectionHeaderProps {
  title: ReactNode;
  /** A quieter line under the title: a range, a count, a hint. */
  subtitle?: ReactNode;
  icon?: LucideIcon;
  /** Controls on the right (they wrap under the title on a narrow card). */
  actions?: ReactNode;
  /** Heading level. Page sections are h2, card titles h3. */
  as?: 'h2' | 'h3';
  id?: string;
  className?: string;
}

/**
 * The heading at the top of a card or page section: an optional icon chip,
 * the title, a quiet subtitle, and actions aligned to the right.
 */
export function SectionHeader({ title, subtitle, icon: Icon, actions, as: Tag = 'h3', id, className }: SectionHeaderProps) {
  return (
    <div className={`pb-sec-head${className ? ` ${className}` : ''}`}>
      <div className="pb-sec-head-main">
        {Icon && <span className="pb-sec-head-icon" aria-hidden="true"><Icon size={15} /></span>}
        <div style={{ minWidth: 0 }}>
          <Tag id={id} className="pb-sec-head-title">{title}</Tag>
          {subtitle && <div className="pb-sec-head-sub">{subtitle}</div>}
        </div>
      </div>
      {actions && <div className="pb-sec-head-actions">{actions}</div>}
    </div>
  );
}
