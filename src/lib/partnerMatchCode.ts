export const PARTNER_MATCH_CODE_LENGTH = 6;
export const PARTNER_LEGACY_CODE_LENGTH = 22;
export const PARTNER_MATCH_CODE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

const MATCH_CODE = /^(?=.*[A-Za-z])(?=.*[0-9])[A-Za-z0-9]+$/;
const LEGACY_CODE = /^[A-Za-z0-9_-]+$/;

export function parsePartnerMatchCode(input: unknown) {
  if (typeof input !== 'string') return null;
  const code = input.trim();
  if (code.length === PARTNER_MATCH_CODE_LENGTH && MATCH_CODE.test(code)) return { code, legacy: false };
  // Invites already issued before the new format can expire naturally.
  if (code.length === PARTNER_LEGACY_CODE_LENGTH && LEGACY_CODE.test(code)) return { code, legacy: true };
  return null;
}
