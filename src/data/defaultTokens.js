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
  paw: '<ellipse cx="32" cy="42" rx="11" ry="9" fill="#f2e9d4"/><circle cx="18" cy="30" r="5" fill="#f2e9d4"/><circle cx="27" cy="21" r="5" fill="#f2e9d4"/><circle cx="37" cy="21" r="5" fill="#f2e9d4"/><circle cx="46" cy="30" r="5" fill="#f2e9d4"/>',
  spider: '<ellipse cx="32" cy="35" rx="9" ry="11" fill="#f2e9d4"/><circle cx="32" cy="20" r="5" fill="#f2e9d4"/><g stroke="#f2e9d4" stroke-width="3" fill="none" stroke-linecap="round"><path d="M24 30 L12 22"/><path d="M23 36 L10 38"/><path d="M24 42 L14 52"/><path d="M40 30 L52 22"/><path d="M41 36 L54 38"/><path d="M40 42 L50 52"/></g>',
  slime: '<path d="M14 46 C12 30 22 16 32 16 C42 16 52 30 50 46 Z" fill="#f2e9d4"/><circle cx="26" cy="34" r="3" fill="#17140f"/><circle cx="38" cy="34" r="3" fill="#17140f"/>',
  fist: '<rect x="18" y="24" width="28" height="22" rx="6" fill="#f2e9d4"/><g stroke="#17140f" stroke-width="2"><line x1="25" y1="24" x2="25" y2="34"/><line x1="32" y1="24" x2="32" y2="34"/><line x1="39" y1="24" x2="39" y2="34"/></g><rect x="22" y="46" width="20" height="8" fill="#f2e9d4"/>',
  door: '<rect x="20" y="12" width="24" height="40" rx="2" fill="#f2e9d4" stroke="#17140f" stroke-width="2"/><circle cx="38" cy="32" r="2.5" fill="#17140f"/>',
  chest: '<rect x="14" y="26" width="36" height="22" rx="2" fill="#c98a3b" stroke="#17140f" stroke-width="2"/><rect x="14" y="20" width="36" height="10" rx="2" fill="#f2e9d4" stroke="#17140f" stroke-width="2"/><rect x="29" y="30" width="6" height="8" rx="1" fill="#17140f"/>',
  'chest-open': '<rect x="14" y="30" width="36" height="18" rx="2" fill="#c98a3b" stroke="#17140f" stroke-width="2"/><path d="M14 30 L18 14 L46 14 L50 30 Z" fill="#f2e9d4" stroke="#17140f" stroke-width="2"/><rect x="25" y="34" width="14" height="6" rx="1" fill="#17140f" opacity="0.35"/>',
  trap: '<path d="M32 10 L55 51 H9 Z" fill="#f2e9d4" stroke="#17140f" stroke-width="2" stroke-linejoin="round"/><rect x="30" y="24" width="4" height="15" rx="1.5" fill="#17140f"/><circle cx="32" cy="44" r="2.6" fill="#17140f"/>',
  // Day/night phase glyphs (data/dayPhases.js). Night reuses 'isle-dark'.
  'phase-day': '<circle cx="32" cy="32" r="10" fill="#f2e9d4"/><g stroke="#f2e9d4" stroke-width="3.5" stroke-linecap="round"><path d="M32 10 V16"/><path d="M32 48 V54"/><path d="M10 32 H16"/><path d="M48 32 H54"/><path d="M16.5 16.5 L20.7 20.7"/><path d="M43.3 43.3 L47.5 47.5"/><path d="M16.5 47.5 L20.7 43.3"/><path d="M43.3 20.7 L47.5 16.5"/></g>',
  'phase-dawn': '<path d="M18 42 A14 14 0 0 1 46 42 Z" fill="#f2e9d4"/><g stroke="#f2e9d4" stroke-width="3.5" stroke-linecap="round"><path d="M9 42 H55"/><path d="M32 16 V22"/><path d="M13 24 L17 28"/><path d="M51 24 L47 28"/></g><path d="M18 51 H46" stroke="#f2e9d4" stroke-width="3" stroke-linecap="round" opacity="0.55"/>',
  // Island-condition glyphs (data/islandConditions.js): the same simple
  // hand-drawn shapes as the token condition glyphs below, no third-party art.
  'isle-fog': '<g fill="none" stroke="#f2e9d4" stroke-width="4" stroke-linecap="round"><path d="M12 22 Q20 16 28 22 T44 22 T56 22"/><path d="M8 33 Q16 27 24 33 T40 33 T56 33"/><path d="M12 44 Q20 38 28 44 T44 44 T56 44"/></g>',
  'isle-dark': '<defs><mask id="m"><rect width="64" height="64" fill="#fff"/><circle cx="40" cy="26" r="15" fill="#000"/></mask></defs><circle cx="30" cy="32" r="19" fill="#f2e9d4" mask="url(#m)"/><circle cx="48" cy="46" r="2.5" fill="#f2e9d4"/><circle cx="20" cy="12" r="2" fill="#f2e9d4"/>',
  'isle-fire': '<path d="M32 8 C36 20 46 24 46 38 C46 48 39 56 32 56 C25 56 18 48 18 38 C18 30 23 26 26 20 C27 25 29 27 31 27 C30 20 30 14 32 8 Z" fill="#f2e9d4"/><path d="M32 34 C35 39 39 41 39 46 C39 50 36 53 32 53 C28 53 25 50 25 46 C25 42 30 40 32 34 Z" fill="#c2481f"/>',
  'isle-unstable': '<path d="M12 28 L26 36 L21 42 L38 48 L33 56" fill="none" stroke="#f2e9d4" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><circle cx="44" cy="24" r="4" fill="#f2e9d4"/><circle cx="51" cy="34" r="2.6" fill="#f2e9d4"/><circle cx="17" cy="16" r="2.4" fill="#f2e9d4"/>',
  'isle-drowning': '<g fill="none" stroke="#f2e9d4" stroke-width="4" stroke-linecap="round"><path d="M10 40 Q18 34 26 40 T42 40 T58 40"/><path d="M10 50 Q18 44 26 50 T42 50 T58 50"/></g><circle cx="24" cy="22" r="4" fill="#f2e9d4"/><circle cx="35" cy="13" r="3" fill="#f2e9d4"/><circle cx="42" cy="26" r="2.5" fill="#f2e9d4"/>',
  'isle-icy': '<g fill="none" stroke="#f2e9d4" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="M32 10 V54"/><path d="M13 21 L51 43"/><path d="M13 43 L51 21"/><path d="M27 15 L32 20 L37 15"/><path d="M27 49 L32 44 L37 49"/></g>',
  'isle-gas': '<g fill="#f2e9d4"><circle cx="24" cy="38" r="10"/><circle cx="37" cy="31" r="12"/><circle cx="46" cy="42" r="8"/><circle cx="27" cy="47" r="8"/></g><circle cx="33" cy="36" r="2.6" fill="#17140f"/><circle cx="42" cy="44" r="2" fill="#17140f"/><circle cx="24" cy="44" r="2" fill="#17140f"/>',
  'isle-storm': '<g fill="#f2e9d4"><circle cx="24" cy="26" r="9"/><circle cx="36" cy="22" r="11"/><circle cx="46" cy="29" r="8"/><rect x="18" y="28" width="34" height="8" rx="4"/></g><path d="M34 34 L26 48 L32 48 L28 58 L42 42 L35 42 L39 34 Z" fill="#e9c13a" stroke="#17140f" stroke-width="1.5" stroke-linejoin="round"/>',
  'isle-rough': '<path d="M8 50 L22 24 L34 50 Z" fill="#f2e9d4" stroke="#17140f" stroke-width="2" stroke-linejoin="round"/><path d="M28 50 L42 18 L56 50 Z" fill="#f2e9d4" stroke="#17140f" stroke-width="2" stroke-linejoin="round"/>',
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
