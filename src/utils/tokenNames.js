// Tokens that share a name on the same layer are told apart by a number:
// the first is "Goblin", the next "Goblin (1)", then "Goblin (2)". The space
// before the bracket matters — combat.js's defaultMobAttacks reads "Goblin
// (1)" as still a goblin because it starts with "Goblin ".
//
// `takenNames` is every name already in use there. A number freed by a
// removed token is used again before a higher one is handed out.
export function uniqueTokenName(name, takenNames) {
  const base = (name || '').trim();
  if (!base) return name;
  const taken = new Set([...takenNames].map((n) => (n || '').trim().toLowerCase()));
  if (!taken.has(base.toLowerCase())) return name;
  for (let n = 1; ; n++) {
    const candidate = `${base} (${n})`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}
