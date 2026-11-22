/** Marks the final Next action argument so the service worker can authorize
 * that exact request before it leaves the device. */
export interface QuietPostPermit { __pebbleQuietPost: string }

export function isQuietPostPermit(value: unknown): value is QuietPostPermit {
  return typeof value === 'object' && value !== null && '__pebbleQuietPost' in value &&
    typeof value.__pebbleQuietPost === 'string' && /^[a-f0-9-]{36}$/.test(value.__pebbleQuietPost);
}
