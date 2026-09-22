// The token sizes offered in a size dropdown: squares wide (and tall), with
// the tabletop size category for each. Shared by the monster/hero inspector
// (RightPanel.jsx's SizeField) and the trap controls, so both read the same.
// 5x5 has no standard category, so "Colossal" is this app's own label — and
// it's traps-only (entities.size allows 5 just for traps,
// 20250101000034_trap_size.sql), so a dropdown passes its own `maxSize`.

export const TOKEN_SIZES = [
  { size: 1, label: '1 × 1 (Medium)' },
  { size: 2, label: '2 × 2 (Large)' },
  { size: 3, label: '3 × 3 (Huge)' },
  { size: 4, label: '4 × 4 (Gargantuan)' },
  { size: 5, label: '5 × 5 (Colossal)' },
];

export const DEFAULT_MAX_TOKEN_SIZE = 4;

export function tokenSizesUpTo(maxSize = DEFAULT_MAX_TOKEN_SIZE) {
  return TOKEN_SIZES.filter((s) => s.size <= maxSize);
}
