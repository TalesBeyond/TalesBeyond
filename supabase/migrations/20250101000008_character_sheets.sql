-- Hearthbound — 08_character_sheets.sql
-- Hero tokens carry a full D&D 5e-flavored character sheet (level, AC,
-- initiative, speed, death saves, ability scores, saving throws, skills,
-- attacks, equipment, currency, spellcasting) — see src/data/characterSheet.js
-- for the exact shape and src/components/RightPanel.jsx for where it's
-- edited (tabs: Overview, Abilities, Saves & Skills, Attacks, Spells, Bag).
--
-- Stored as one jsonb blob rather than normalized columns/tables: the
-- shape is still evolving, is only ever read/written whole by the client,
-- and is never filtered or queried by individual sub-field server-side.
-- Nullable (no default) rather than defaulting to '{}' — the client's own
-- `entity.sheet || defaultCharacterSheet()` fallback expects a missing
-- sheet to be null/absent, not an empty object (which is truthy in JS and
-- would otherwise skip the fallback and break on missing sub-fields).

alter table entities add column if not exists sheet jsonb;
