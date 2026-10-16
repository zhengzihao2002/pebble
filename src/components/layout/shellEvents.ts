/**
 * Requests a page can make of the app shell. The dialogs they open are
 * mounted in AppShell (their header and bottom-bar triggers live there), so a
 * page that wants one - an empty state's "Add transaction" button, say -
 * dispatches an event rather than mounting a second copy of the dialog.
 * Same pattern as WELCOME_PREVIEW_EVENT.
 */
export const SHELL_EVENTS = {
  addTransaction: 'pebble-open-add-transaction',
  transfer: 'pebble-open-transfer',
  addGoal: 'pebble-open-add-goal',
  addSchedule: 'pebble-open-add-schedule',
  palette: 'pebble-open-palette',
} as const;

export type ShellRequest = keyof typeof SHELL_EVENTS;

/** Opens the shell's dialog for `request`. Client only. */
export function requestShell(request: ShellRequest): void {
  window.dispatchEvent(new Event(SHELL_EVENTS[request]));
}
