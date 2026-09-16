-- DM-only personal notes on hero and mob tokens: a free-text field the
-- host can jot private notes into. It round-trips through this column like
-- every other entity field; the UI is what keeps it host-only (RightPanel.jsx
-- never renders it for a non-host viewer), matching this schema's existing
-- table-wide "members read" trust model rather than adding field-level RLS.
alter table entities add column dm_notes text not null default '';
