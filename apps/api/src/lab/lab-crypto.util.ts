import * as crypto from 'crypto';

// 30 characters: no ambiguous characters (0, O, 1, I, L)
export const USER_ID_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

// 56 characters: uppercase + digits + lowercase
export const PASSWORD_ALPHABET =
  'ABCDEFGHJKMNPQRSTUVWXYZ23456789abcdefghjkmnpqrstuvwxyz';

/**
 * Generates an 8-character portal user ID using crypto.randomBytes
 */
export function generatePortalUserId(length = 8): string {
  const bytes = crypto.randomBytes(length);
  let result = '';
  for (let i = 0; i < length; i++) {
    result += USER_ID_ALPHABET[bytes[i] % USER_ID_ALPHABET.length];
  }
  return result;
}

/**
 * Generates a 10-character portal password using crypto.randomBytes
 */
export function generatePortalPassword(length = 10): string {
  const bytes = crypto.randomBytes(length);
  let result = '';
  for (let i = 0; i < length; i++) {
    result += PASSWORD_ALPHABET[bytes[i] % PASSWORD_ALPHABET.length];
  }
  return result;
}
