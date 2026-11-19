import type { Dictionary } from '@/lib/i18n';

export function partnerError(d: Dictionary, result: { error: string; reason?: string }) {
  if (!result.reason) return result.error;
  return d.partner.errors[result.reason as keyof typeof d.partner.errors] ?? d.partner.errors.unexpected;
}
