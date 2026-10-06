/**
 * Which "add" action each page offers. On desktop the header shows it; on a
 * phone the centre button of the bottom nav does, so the header hides its
 * copy there (.header-actions in globals.css).
 *
 * Header.tsx still spells the same mapping out in its pageMeta, together with
 * the labels it shows. Change a page's action in both places.
 */
export type PageActionKind = 'addTransaction' | 'addGoal' | 'addSchedule';

const PAGE_ACTIONS: Record<string, PageActionKind> = {
  '/dashboard': 'addTransaction',
  '/transactions': 'addTransaction',
  '/goals': 'addGoal',
  '/scheduled': 'addSchedule',
};

export function pageAction(pathname: string): PageActionKind | undefined {
  return PAGE_ACTIONS[pathname];
}
