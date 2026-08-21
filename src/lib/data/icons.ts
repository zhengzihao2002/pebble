import type { LucideIcon } from 'lucide-react';
import { Shield } from 'lucide-react';
import { GOAL_ICON_OPTIONS } from '@/data/seed';

/**
 * Maps a stored goal `icon_key` to its Lucide component.
 *
 * NOT a server module. LucideIcon is a function and cannot be passed from a
 * Server Component to a Client Component, so this lookup must happen inside
 * the client component that renders the icon. The data layer carries the
 * string key only.
 *
 * Unknown keys fall back to Shield rather than throwing: a goal saved with an
 * icon key that a later release removed should still render.
 */
const ICON_BY_KEY: Record<string, LucideIcon> = Object.fromEntries(
  GOAL_ICON_OPTIONS.map((option) => [option.key, option.icon]),
);

export const DEFAULT_GOAL_ICON_KEY = 'Shield';

export function resolveGoalIcon(iconKey: string): LucideIcon {
  return ICON_BY_KEY[iconKey] ?? Shield;
}

export function isKnownGoalIconKey(iconKey: string): boolean {
  return iconKey in ICON_BY_KEY;
}
