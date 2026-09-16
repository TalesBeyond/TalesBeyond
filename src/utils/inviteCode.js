// Invite codes are short, unambiguous, human-typeable strings.
// Excludes visually confusable characters (0/O, 1/I/L).
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function generateInviteCode(length = 8) {
  let code = '';
  for (let i = 0; i < length; i++) {
    code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return code;
}

export function generatePlayerId() {
  return 'p_' + Math.random().toString(36).slice(2, 10);
}

// A real UUID (v4), not a prefixed random string like generatePlayerId:
// entity ids are picked client-side in *both* local and cloud mode, and in
// cloud mode this same id is inserted as the entities.id primary key, so it
// has to be a value Postgres's `uuid` column type will accept.
export function generateEntityId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  // Fallback UUID v4 for older browsers without crypto.randomUUID.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
