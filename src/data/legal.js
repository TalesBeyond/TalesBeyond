// Who runs Hearthbound, for the legal pages (components/LegalPage.jsx).
// FILL THESE IN BEFORE PUBLISHING: anything still in [square brackets]
// shows on the page exactly as written here, brackets and all, so a
// missing detail is obvious instead of silently wrong.
export const LEGAL = {
  appName: 'Hearthbound',
  operator: '[OPERATOR NAME — the person or company that runs this site]',
  operatorAddress: '[POSTAL ADDRESS, if you are required to publish one]',
  contactEmail: '[CONTACT EMAIL]',
  governingLaw: '[COUNTRY OR STATE WHOSE LAW APPLIES]',
  // The date these documents last changed, shown at the top of each.
  effectiveDate: 'September 30, 2026',
  // Youngest age allowed to use the app. 13 follows the US children's
  // privacy law (COPPA); some countries set 14, 15 or 16 for consent.
  minAge: 13,
};

// The documents, in the order the page's tabs show them. `id` is the part
// after #/legal/ in the address.
export const LEGAL_DOCS = [
  { id: 'privacy', title: 'Privacy Policy' },
  { id: 'cookies', title: 'Cookies & Storage' },
  { id: 'terms', title: 'Terms of Use' },
  { id: 'credits', title: 'Licenses & Credits' },
];

export function legalDocFromHash(hash) {
  const match = /^#\/legal(?:\/([a-z]+))?/.exec(hash || '');
  if (!match) return null;
  return LEGAL_DOCS.some((d) => d.id === match[1]) ? match[1] : 'privacy';
}
