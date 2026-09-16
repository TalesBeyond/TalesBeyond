// Original, simple vector "token portraits" generated as data: URLs so the
// board can treat every token — default or custom — as just an image URL.
// Each icon is hand-drawn inline SVG, not derived from any published art.

function svgToDataUrl(inner, bg) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
    <circle cx="32" cy="32" r="32" fill="${bg}"/>
    ${inner}
  </svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

const ICONS = {
  shield: '<path d="M32 12 L48 18 V32 C48 44 40 50 32 54 C24 50 16 44 16 32 V18 Z" fill="#f2e9d4" stroke="#17140f" stroke-width="2"/>',
  wand: '<circle cx="32" cy="18" r="5" fill="#f2e9d4"/><rect x="29" y="22" width="6" height="30" rx="3" fill="#f2e9d4"/>',
  dagger: '<path d="M32 10 L36 34 L32 44 L28 34 Z" fill="#f2e9d4"/><rect x="28" y="42" width="8" height="12" rx="2" fill="#f2e9d4"/>',
  leaf: '<path d="M20 44 C20 24 44 20 48 16 C44 44 30 48 20 44 Z" fill="#f2e9d4"/>',
  lute: '<circle cx="26" cy="38" r="12" fill="#f2e9d4"/><rect x="34" y="12" width="6" height="26" rx="2" fill="#f2e9d4"/>',
  axe: '<rect x="29" y="14" width="6" height="34" rx="2" fill="#f2e9d4"/><path d="M35 16 C46 12 50 22 40 28 C36 28 34 24 35 16 Z" fill="#f2e9d4"/>',
  sunburst: '<circle cx="32" cy="32" r="10" fill="#f2e9d4"/><g stroke="#f2e9d4" stroke-width="3"><line x1="32" y1="8" x2="32" y2="16"/><line x1="32" y1="48" x2="32" y2="56"/><line x1="8" y1="32" x2="16" y2="32"/><line x1="48" y1="32" x2="56" y2="32"/></g>',
  bow: '<path d="M20 14 C34 24 34 40 20 50" fill="none" stroke="#f2e9d4" stroke-width="3"/><line x1="20" y1="14" x2="44" y2="46" stroke="#f2e9d4" stroke-width="2"/>',
  skull: '<ellipse cx="32" cy="28" rx="16" ry="14" fill="#f2e9d4"/><rect x="24" y="38" width="16" height="10" fill="#f2e9d4"/><circle cx="26" cy="27" r="4" fill="#17140f"/><circle cx="38" cy="27" r="4" fill="#17140f"/>',
  fangs: '<path d="M16 20 L48 20 L40 44 L32 34 L24 44 Z" fill="#f2e9d4"/>',
  claw: '<path d="M16 46 L26 16 L32 16 L24 46 Z" fill="#f2e9d4"/><path d="M26 46 L34 14 L40 14 L30 46 Z" fill="#f2e9d4"/><path d="M36 46 L42 18 L48 18 L40 46 Z" fill="#f2e9d4"/>',
  wing: '<path d="M12 40 C24 16 44 16 52 32 C40 28 30 30 24 40 C20 34 16 34 12 40 Z" fill="#f2e9d4"/>',
  eye: '<ellipse cx="32" cy="32" rx="18" ry="10" fill="#f2e9d4"/><circle cx="32" cy="32" r="6" fill="#17140f"/>',
  door: '<rect x="20" y="12" width="24" height="40" rx="2" fill="#f2e9d4" stroke="#17140f" stroke-width="2"/><circle cx="38" cy="32" r="2.5" fill="#17140f"/>',
  chest: '<rect x="14" y="26" width="36" height="22" rx="2" fill="#c98a3b" stroke="#17140f" stroke-width="2"/><rect x="14" y="20" width="36" height="10" rx="2" fill="#f2e9d4" stroke="#17140f" stroke-width="2"/><rect x="29" y="30" width="6" height="8" rx="1" fill="#17140f"/>',
  'chest-open': '<rect x="14" y="30" width="36" height="18" rx="2" fill="#c98a3b" stroke="#17140f" stroke-width="2"/><path d="M14 30 L18 14 L46 14 L50 30 Z" fill="#f2e9d4" stroke="#17140f" stroke-width="2"/><rect x="25" y="34" width="14" height="6" rx="1" fill="#17140f" opacity="0.35"/>',
  // Condition-state glyphs (SPEC.md-style: simple hand-drawn shapes, no
  // third-party art) used as small badges wherever a status effect is shown.
  poison: '<path d="M32 14 C42 14 46 24 46 34 C46 46 40 52 32 52 C24 52 18 46 18 34 C18 24 22 14 32 14 Z" fill="#f2e9d4" stroke="#17140f" stroke-width="2"/><circle cx="26" cy="34" r="2.6" fill="#17140f"/><circle cx="38" cy="34" r="2.6" fill="#17140f"/><path d="M25 43 Q32 38 39 43" stroke="#17140f" stroke-width="2" fill="none"/>',
  stunned: '<circle cx="23" cy="26" r="3" fill="#f2e9d4"/><circle cx="41" cy="26" r="3" fill="#f2e9d4"/><path d="M17 22 L27 30 M27 22 L17 30" stroke="#f2e9d4" stroke-width="2"/><path d="M37 22 L47 30 M47 22 L37 30" stroke="#f2e9d4" stroke-width="2"/><path d="M20 44 Q32 36 44 44" stroke="#f2e9d4" stroke-width="3" fill="none"/>',
  prone: '<line x1="12" y1="42" x2="52" y2="42" stroke="#f2e9d4" stroke-width="3"/><circle cx="18" cy="35" r="5" fill="#f2e9d4"/><rect x="25" y="37" width="24" height="6" rx="3" fill="#f2e9d4"/>',
  shocked: '<path d="M34 8 L18 34 L28 34 L24 56 L48 26 L36 26 Z" fill="#f2e9d4" stroke="#17140f" stroke-width="1.5"/>',
  bleed: '<path d="M32 12 C40 26 46 34 46 42 C46 50 40 54 32 54 C24 54 18 50 18 42 C18 34 24 26 32 12 Z" fill="#8f1f1f" stroke="#f2e9d4" stroke-width="2"/>',
};

export const DEFAULT_HEROES = [
  { key: 'fighter', name: 'Fighter', color: '#8f3a20', icon: 'shield' },
  { key: 'wizard', name: 'Wizard', color: '#4c7a86', icon: 'wand' },
  { key: 'rogue', name: 'Rogue', color: '#3a3226', icon: 'dagger' },
  { key: 'ranger', name: 'Ranger', color: '#45573f', icon: 'leaf' },
  { key: 'bard', name: 'Bard', color: '#a9853f', icon: 'lute' },
  { key: 'barbarian', name: 'Barbarian', color: '#762f2f', icon: 'axe' },
  { key: 'cleric', name: 'Cleric', color: '#c9a13b', icon: 'sunburst' },
  { key: 'paladin', name: 'Paladin', color: '#6b6b8f', icon: 'bow' },
].map((h) => ({ ...h, imageUrl: svgToDataUrl(ICONS[h.icon], h.color) }));

export const DEFAULT_MOBS = [
  { key: 'goblin', name: 'Goblin', color: '#45573f', icon: 'fangs' },
  { key: 'skeleton', name: 'Skeleton', color: '#5c5648', icon: 'skull' },
  { key: 'orc', name: 'Orc', color: '#4a5d33', icon: 'claw' },
  { key: 'wolf', name: 'Dire Wolf', color: '#3a3a3a', icon: 'claw' },
  { key: 'dragon', name: 'Young Dragon', color: '#8f3a20', icon: 'wing' },
  { key: 'beholder', name: 'Beholder', color: '#5c3a6b', icon: 'eye' },
].map((m) => ({ ...m, imageUrl: svgToDataUrl(ICONS[m.icon], m.color) }));

export function makeIconDataUrl(icon, color) {
  return svgToDataUrl(ICONS[icon] || ICONS.shield, color);
}
