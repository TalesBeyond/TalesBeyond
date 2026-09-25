// The catalog's entry key: the name in lower case with every run of other
// characters turned into one "-" ("Giant Spider" -> giant-spider). Shared by
// the app and the admin script, so it stays free of any Vite-only import.
export function slugify(name) {
  return String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
