import { Tag } from 'lucide-react';
import type { CategoryMeta } from '@/types';

/**
 * The 36px tinted category tile the Dashboard lists share (.pb-dash-tile-icon):
 * the category's colour at a low strength behind its icon. A category that is
 * no longer in the user's list falls back to the quiet pine tile and a tag.
 */
export function CategoryTile({ category, categoryMeta, size = 16 }: { category: string; categoryMeta: CategoryMeta; size?: number }) {
  const meta = categoryMeta[category];
  const Icon = meta ? meta.icon : Tag;
  return (
    <span aria-hidden="true" className="pb-dash-tile-icon" style={{ backgroundColor: meta ? `${meta.color}20` : 'var(--pine-soft)' }}>
      <Icon size={size} style={{ color: meta ? meta.color : 'var(--pine)' }} />
    </span>
  );
}
