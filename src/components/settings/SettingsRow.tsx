'use client';

import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

interface SettingsRowProps {
  icon: LucideIcon;
  title: ReactNode;
  hint?: ReactNode;
  /** id on the title, so a control can be named by it (aria-labelledby). */
  titleId?: string;
  /** The title is a <label> for this field instead of an h3. */
  labelFor?: string;
  /** inline: the control sits right of the text on a wide card and drops
      below it on a narrow one. stack: always below (tiles, sliders, pickers).
      side: always on the right (a lone switch). */
  layout?: 'inline' | 'stack' | 'side';
  className?: string;
  /** Stable DOM id for the ROW, so an overview chip can scroll to exactly
      this setting and highlight it (see useSectionJump.jumpToRow). */
  id?: string;
  children: ReactNode;
}

/**
 * One setting inside a grouped card (.pb-settings-group): a pine icon chip,
 * the name and a one-line hint, and the control. Rows are separated by inset
 * hairlines, System Settings style. Where the control goes is decided by a
 * container query on the group card (settings.css), never by measuring.
 */
export function SettingsRow({ icon: Icon, title, hint, titleId, labelFor, layout = 'inline', className, id, children }: SettingsRowProps) {
  return (
    <div id={id} className={`pb-settings-row is-${layout}${id ? ' pb-settings-target' : ''}${className ? ` ${className}` : ''}`}>
      <span className="pb-settings-row-icon" aria-hidden="true"><Icon size={16} /></span>
      <div className="pb-settings-row-text">
        {labelFor
          ? <label htmlFor={labelFor} id={titleId} className="pb-settings-row-title">{title}</label>
          : <h3 id={titleId} className="pb-settings-row-title">{title}</h3>}
        {hint && <p className="pb-settings-row-hint">{hint}</p>}
      </div>
      <div className="pb-settings-row-control">{children}</div>
    </div>
  );
}
