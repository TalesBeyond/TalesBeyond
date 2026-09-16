# Hearthbound — Virtual D&D Table
## Full Application Specification (Frontend + Backend)

Version 0.2 · Phase 1 (local-storage backed React front end) is fully built. Of Phase 2 (§9), **points 9.1–9.6 are now also implemented** in code — Postgres schema, RLS, anonymous auth, join/create RPCs, Realtime sync, and Storage — as an opt-in "cloud mode" the app switches into automatically when Supabase credentials are present (see `supabase/README.md`). Local mode remains the default and fully working fallback. §9.7 (the API/RPC surface table) and §13 (roadmap) remain specification only.

> **Implementation status legend used below:** ✅ *Implemented* marks sections with working code in this repository. Everything else is still specification for future work.

---

## 1. Product summary

Hearthbound is a browser-based virtual tabletop (VTT) for running Dungeons & Dragons–style sessions. A **host** (Dungeon Master) creates a table, builds a square-grid battle map, and invites up to **9 players** with a short invitation code. Everyone sees the same map and can place, move, and edit hero and monster tokens, measure distances with a ruler, and leave/return to the table at any time because the full table state — map, tokens, players — is persisted.

### 1.1 Goals (Phase 1 scope, delivered now)
- Configurable square grid map (A × B), with optional background image.
- Token system: default hero/monster art plus custom image upload, drag-to-move, resize (1×1 to 4×4 squares), HP tracking.
- Ruler tool measuring grid distance using D&D 5e's 5-10-5 diagonal rule.
- Host/player roles, up to 10 total occupants (1 host + 9 players).
- Invite-code based joining; a **new code is generated every time the host opens a table**, and the previous code stops working.
- Full state persistence (map + tokens + players) so anyone can close the tab and come back later to the same table.
- Manual export/import of a table as a `.json` file (works even with no backend).

### 1.2 Goals (Phase 2 scope, specified now, built next)
- Real multi-computer, real-time sync (today's Phase 1 only syncs across tabs of the *same* browser via `localStorage`).
- Durable server-side storage (Postgres via Supabase), image storage (Supabase Storage), and auth.
- Presence (who's currently connected), live cursors optionally, and conflict-free concurrent token moves.

### 1.3 Explicit non-goals (for now)
- Fog of war / dynamic lighting & line-of-sight.
- Dice rolling, initiative tracker, chat, character sheets.
- Voice/video.
- Automated rules enforcement (spell ranges, AoE templates, conditions).

These are natural Phase 3 features — see §13 Roadmap — and the data model below leaves room for them, but they are not built in Phase 1 or 2.

---

## 2. Roles & permissions

| Capability | Host (DM) | Player |
|---|---|---|
| Create a table / generate invite code | ✅ | ❌ |
| Join a table with a code | n/a (already in) | ✅ |
| Regenerate invite code | ✅ | ❌ |
| Open/close the table to new joins | ✅ | ❌ |
| Create/resize the map, set feet-per-square, upload background | ✅ | ❌ (view-only, Phase 1 UI reflects this) |
| Place/move/edit/delete any token (hero or monster) | ✅ | ✅ (Phase 1: unrestricted at the table, trust-based, matching how physical tabletop groups behave) |
| Use the ruler | ✅ | ✅ |
| Save / export / import the table file | ✅ | ✅ (import overwrites shared state, so Phase 2 should gate this to host — see §12) |
| Kick a player | ✅ (Phase 2) | ❌ |

Phase 1 deliberately keeps token permissions open to everyone at the table (a real table is a cooperative, trusted space). Phase 2 adds an optional **"lock hero tokens to their owner"** setting for hosts who want it (see §13).

Capacity is hard-capped at **10 occupants** (`MAX_PLAYERS = 10`, 1 host + 9 players) both in the UI and — in Phase 2 — enforced server-side.

---

## 3. Functional requirements (detailed)

### 3.1 Map / grid
- Host defines map **name**, **width** (`cols`) and **height** (`rows`) in squares, each from 4–60.
- Each square has a fixed pixel `cellSize` (default 42px, independent of `cols`/`rows`); the rendered map is `cols × cellSize` by `rows × cellSize`, scrollable within the stage if larger than the viewport.
- Host may upload a background image, stretched to fill the full grid area; grid lines render on top at ~28% ink opacity, with a heavier line every 5 squares for quick counting.
- Host sets **feet-per-square** (default 5 ft, matching 5e) used by the ruler.
- Map settings (name/size/feet-per-square/background) are host-only; a player opening the map settings popover sees read-only fields and a note explaining why.

### 3.2 Tokens (heroes, monsters, and — implicitly — the host's own miniature)
- A token has: id, kind (`hero` | `mob`), name, image (URL or embedded data URL), accent color, grid position (`col`,`row`), size in squares (1–4, for Large/Huge/Gargantuan creatures), current HP, max HP, and an optional `ownerId` (the player who "owns" a hero token, reserved for the Phase 2 locking feature).
- **Default art:** the app ships 8 default hero archetypes (Fighter, Wizard, Rogue, Ranger, Bard, Barbarian, Cleric, Paladin) and 6 default monsters (Goblin, Skeleton, Orc, Dire Wolf, Young Dragon, Beholder), each an original, simple vector icon generated at build time — no third-party or copyrighted art, so there are no licensing concerns shipping it by default.
- **Custom art:** any user can upload an image (PNG/JPG/WebP/SVG) which becomes a token's portrait. Phase 1 embeds it as a base64 data URL directly in the saved state (simple, no backend needed, but bloats save size — see §12 for the Phase 2 Storage-backed replacement). Phase 2 must cap upload size (suggested: 3 MB, downscaled client-side to ≤512×512 before upload).
- **Add "on the fly":** placing a token from the sidebar (default or freshly uploaded) drops it on the first free square scanning from the top-left; it can then be dragged anywhere.
- **Move:** click-drag a token; on release it snaps to the nearest square. Multi-square tokens (2×2+) are anchored by their top-left square.
- **Edit:** selecting a token opens an inspector to rename it, adjust current/max HP (with a visual HP bar that turns red under 30%), change its footprint size, or remove it from the map.
- Both host and any player can move/edit any token in Phase 1 (see §2).

### 3.3 Ruler
- Selecting the Ruler tool and dragging on the map draws a dashed line from the press point's square-center to the current pointer's square-center.
- Distance uses the 5e "5-10-5" diagonal rule: straight moves cost 1 square, diagonal moves normally cost 1 square but every *second* diagonal step costs 2 (i.e., a run of diagonals costs 5, 10, 15, 20 ft… on a 5-ft grid), rather than naive Euclidean or Chebyshev distance. Implemented in `utils/grid.js::feetDistance`.
- The measured distance is shown in feet (using the map's feet-per-square) at the line's midpoint, live while dragging, and remains visible until a new measurement starts.

### 3.4 Session / invitation codes
- Codes are 6 characters from an unambiguous alphabet (`ABCDEFGHJKMNPQRSTUVWXYZ23456789` — no `0/O/1/I/L`), giving ~32^6 ≈ 1.07 billion combinations — ample for collision-avoidance with a client-side existence check today, and for a `UNIQUE` DB constraint in Phase 2.
- **A new code is generated every time the host opens a table** (i.e., on table creation) — this satisfies "generate a new invitation code every session the host closes or opens." Hosts can also manually **regenerate** the code mid-session (e.g., if it leaked); the old code is immediately invalidated and cannot be used to join, even by someone who already has the page open (Phase 2: a `revoked_at` timestamp on old invite rows plus a realtime "your code was rotated" toast; Phase 1: the old `localStorage` key is deleted).
- **Closing the table** (host action, distinct from regenerating the code) stops *new* joins but does not remove already-connected players — useful for a mid-session break without losing anyone.
- Joining requires: invite code + display name + accent color. If the browser already has a remembered identity for that code (see §3.5), joining silently resumes as that same player instead of creating a duplicate.

### 3.5 Persistence & "come back later"
- The entire table — map, all tokens, all players and their colors/host flag/connection state — is one JSON document, autosaved ~300ms after any change (debounced) and on explicit "Save".
- Phase 1 storage key: `hearthbound:session:<CODE>` in `localStorage`.
- Each browser also remembers **"who am I" per table** (`hearthbound:identity:<CODE>`) and **"which table am I currently at"** (`hearthbound:current`), so refreshing the page — or closing and reopening the browser — silently resumes the same table as the same player, satisfying "players leave and can come back at any point."
- **Export/Import**: any user can download the current table as a portable `.json` file, and import one back in, which is useful for backing up a campaign or moving a Phase-1-only table between two independent browsers before Phase 2 sync exists.

---

## 4. Information architecture & screen flows

```
┌────────────────────┐
│      Landing        │
│  [Host]  [Join]      │
└──────┬───────┬───────┘
       │       │
       ▼       ▼
 ┌───────────┐ ┌───────────────┐
 │ Host setup │ │  Join form     │
 │ name/color │ │ code/name/color │
 │ map W×H    │ └───────┬───────┘
 └─────┬──────┘         │
       │  creates table │ loads existing table,
       │  + new code    │ adds player (or resumes
       ▼                ▼ existing identity)
      ┌────────────────────────────┐
      │           Game view          │
      │ ┌────────┬──────────┬──────┐ │
      │ │ Tokens │  Toolbar   │Roster│ │
      │ │ sidebar│  + Board   │+Insp.│ │
      │ └────────┴──────────┴──────┘ │
      └────────────────────────────┘
```

### 4.1 Landing
Mode toggle between **Host a table** and **Join a table**. Host form collects DM name, color, map name, and W×H. Join form collects invite code, name, color.

### 4.2 Game view (three-column layout)
- **Left panel — Tokens:** upload-and-place your own image (as Hero or Monster), plus scrollable galleries of default heroes and monsters, each with a one-click "Place" button.
- **Center — Toolbar + Stage:** tool switch (Move / Ruler), map name button (opens map settings popover), autosave status, Save/Export/Import buttons, invite code with copy button, host-only New Code / Close Table controls, and Leave. Below it, the scrollable stage containing the grid.
- **Right panel — Roster + Inspector:** live player list (host tagged, disconnected players tagged "AWAY" rather than removed), and an inspector for whatever token is currently selected (rename, HP, size, remove).

---

## 5. Visual design system (implemented)

A tabletop-at-night feel rather than generic SaaS defaults: ink-dark charcoal shell, warm parchment map surface, ember-orange primary actions, moss-green secondary/HP accents, antique-gold hairlines for borders and the invite-code chip. Typography: **Spectral** (serif) for headings/brand and map name, **Inter** for all UI controls and body text, **IBM Plex Mono** for the invite code, coordinates, and distances — so "numbers you'd note on a character sheet" are visually distinct from prose. Full token list and component styles are in `src/styles.css`.

---

## 6. Frontend architecture (Phase 1, as built)

- **Stack:** React 18 + Vite 5. No UI kit dependency — hand-built design system in plain CSS for a distinctive look and zero extra weight.
- **State:** a single reducer (`src/state/store.jsx`) holding `{ session, map, entities, entityOrder, players }`, exposed via two React Contexts (state + dispatch) so components only re-render on the slice they read via `useGameState()`/`useGameDispatch()`. `entityOrder` is kept separate from the `entities` map to give stable render order without relying on object key iteration order.
- **Persistence boundary:** `src/state/persistence.js` is the *only* module allowed to touch `localStorage`. It exposes `saveSession/loadSession/deleteSession/sessionExists`, identity helpers, a "current table" pointer, and file export/import. This boundary is intentional: Phase 2 replaces the bodies of these functions with Supabase calls (§9) without touching a single component.
- **Components:**
  - `App.jsx` — screen switch (Landing vs. game), resume-on-refresh via the "current table" pointer.
  - `Landing.jsx` — Host/Join forms.
  - `GameView.jsx` — owns local UI state (selected tool, selected token) and all the dispatch-wrapping handlers passed down.
  - `MapBoard.jsx` — SVG grid + absolutely-positioned token layer + ruler overlay; all drag math funnels through `utils/grid.js` so board, ruler, and future backend share one coordinate system.
  - `TokenSidebar.jsx`, `RightPanel.jsx`, `Toolbar.jsx` — self-explanatory, all presentational, driven by props from `GameView`.
- **No routing library** — a single code (not a URL) identifies a table in Phase 1; Phase 2 should add a shareable `/t/:code` URL (see §9.4).

### 6.1 Full client-side data shape

```ts
interface TableState {
  session: {
    code: string;              // current invite code, e.g. "K7QX2M"
    hostPlayerId: string;
    isOpen: boolean;            // accepting new joins?
    createdAt: number;          // epoch ms
  };
  map: {
    name: string;
    cols: number;                // 4–60
    rows: number;                // 4–60
    cellSize: number;            // px, default 42
    feetPerSquare: number;       // default 5
    backgroundImage: string | null; // data URL (Phase 1) / Storage URL (Phase 2)
  };
  entities: Record<string, Entity>;
  entityOrder: string[];         // render/z-order
  players: Record<string, Player>;
}

interface Entity {
  id: string;
  kind: 'hero' | 'mob';
  name: string;
  imageUrl: string;              // data URL or remote URL
  color: string;                 // accent / border color
  col: number;
  row: number;
  size: number;                  // 1–4 squares wide/tall
  hp: number;
  maxHp: number;
  ownerId: string | null;        // reserved for Phase 2 permission lock
}

interface Player {
  id: string;
  name: string;
  color: string;
  isHost: boolean;
  connected: boolean;
  joinedAt: number;
}
```

---

## 7. Non-functional requirements

- **Capacity:** 1 host + 9 players (10 total) enforced client-side today (`MAX_PLAYERS` in `store.jsx`), and must be enforced server-side in Phase 2 (a Postgres check constraint / RPC guard — never trust the client).
- **Resilience:** losing connection or closing the tab must never lose table state; autosave debounce is 300ms, well under any reasonable "oops I closed the tab" window.
- **Performance:** grids up to 60×60 (3,600 cells) render as plain SVG lines with no measurable jank on modern hardware; tokens are DOM nodes positioned with `left/top`, dragged via native Pointer Events (no drag-and-drop library needed).
- **Accessibility:** all interactive controls are real `<button>`/`<input>` elements with visible focus states inherited from the design system; color is never the only signal (HP bars pair color with numbers, host status is a text tag not just a color).
- **Portability:** the entire Phase 1 app is static files (Vite build output) — deployable to Vercel, Netlify, GitHub Pages, or any static host with zero server requirements.

---

## 8. Why the persistence layer is designed for a swap, not a rewrite

Every place in the UI that needs to "know about the network" already goes through one of:
1. `state/persistence.js` (save/load/export/import/identity/current-pointer), or
2. `state/store.jsx`'s reducer actions (`ADD_ENTITY`, `MOVE_ENTITY`, etc).

Phase 2 replaces (1) with real network calls and layers realtime *subscriptions* that dispatch the same reducer actions (2) when other clients make changes. No component in `src/components/` needs to change.

---

## 9. Phase 2 backend architecture (Supabase) — ✅ 9.1–9.6 implemented

Chosen because it gives, from one project: Postgres (source of truth), Realtime (Postgres change streams → WebSocket), Storage (token/background images), and Auth (anonymous sessions) — and it deploys independently of the Vercel-hosted frontend, matching the requirement to be "free to migrate between Vercel or Supabase."

### 9.1 Postgres schema — ✅ `supabase/01_schema.sql`

```sql
-- One row per table/session. The invite code is only ever valid while
-- revoked_at is null; regenerating issues a new row rather than mutating
-- the code in place, which keeps a full audit trail of past codes.
create table tables (
  id            uuid primary key default gen_random_uuid(),
  name          text not null default 'Untitled Table',
  host_id       uuid not null references players(id),
  is_open       boolean not null default true,
  created_at    timestamptz not null default now()
);

create table invite_codes (
  code          text primary key,           -- 6-char human code
  table_id      uuid not null references tables(id) on delete cascade,
  created_at    timestamptz not null default now(),
  revoked_at    timestamptz
);
create index on invite_codes (table_id) where revoked_at is null;

create table players (
  id            uuid primary key default gen_random_uuid(),
  table_id      uuid not null references tables(id) on delete cascade,
  auth_user_id  uuid not null references auth.users(id),
  name          text not null,
  color         text not null,
  is_host       boolean not null default false,
  connected     boolean not null default true,
  joined_at     timestamptz not null default now(),
  unique (table_id, auth_user_id)
);

create table maps (
  table_id          uuid primary key references tables(id) on delete cascade,
  name              text not null default 'Untitled Map',
  cols              int not null check (cols between 4 and 60),
  rows              int not null check (rows between 4 and 60),
  cell_size         int not null default 42,
  feet_per_square   int not null default 5,
  background_url    text,                    -- Supabase Storage public/signed URL
  updated_at        timestamptz not null default now()
);

create table entities (
  id            uuid primary key default gen_random_uuid(),
  table_id      uuid not null references tables(id) on delete cascade,
  kind          text not null check (kind in ('hero','mob')),
  name          text not null,
  image_url     text not null,
  color         text not null,
  col           int not null,
  row           int not null,
  size          int not null default 1 check (size between 1 and 4),
  hp            int not null default 10,
  max_hp        int not null default 10,
  owner_id      uuid references players(id),
  z_order       int not null default 0,
  updated_at    timestamptz not null default now()
);

-- Server-side seatbelt on capacity: 1 host + 9 players.
create or replace function enforce_table_capacity() returns trigger as $$
begin
  if (select count(*) from players where table_id = new.table_id) >= 10 then
    raise exception 'Table is full (10/10)';
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_table_capacity
  before insert on players
  for each row execute function enforce_table_capacity();
```

### 9.2 Row Level Security (RLS) — ✅ `supabase/02_policies.sql`

RLS scopes every row to "am I a player at this table," using `auth.uid()` from Supabase Auth (anonymous sign-in, see §9.3):

```sql
alter table tables enable row level security;
alter table players enable row level security;
alter table maps enable row level security;
alter table entities enable row level security;
alter table invite_codes enable row level security;

create policy "members can read their table"
  on tables for select
  using (id in (select table_id from players where auth_user_id = auth.uid()));

create policy "members can read/write their table's map"
  on maps for select using (table_id in (select table_id from players where auth_user_id = auth.uid()));
create policy "host can write map"
  on maps for update using (
    table_id in (select table_id from players where auth_user_id = auth.uid() and is_host)
  );

create policy "members can read/write entities at their table"
  on entities for all using (
    table_id in (select table_id from players where auth_user_id = auth.uid())
  );

create policy "members can read invite codes for their table"
  on invite_codes for select using (
    table_id in (select table_id from players where auth_user_id = auth.uid())
  );
-- Joining by code is done through a SECURITY DEFINER RPC (below), not a
-- direct insert, so an unauthenticated visitor can look up a code without
-- being able to read anyone else's table.
```

### 9.3 Auth strategy — ✅ `src/lib/auth.js`

- **Anonymous auth** (`supabase.auth.signInAnonymously()`) on first visit — no email/password friction, matching a "type a code and go" flow. The resulting `auth.uid()` becomes each browser's durable identity; Hearthbound's own `players.auth_user_id` links it to a display name/color/table.
- If a user later wants a persistent account across devices (e.g., a DM who always hosts), anonymous auth can be **upgraded** to email/OAuth via Supabase's `linkIdentity`, without changing `auth.uid()` or any RLS policy.

### 9.4 Join / create RPCs (SECURITY DEFINER, capacity- and code-checked server-side) — ✅ `supabase/03_functions.sql`, called from `src/lib/remoteApi.js`

```sql
create or replace function create_table(p_name text, p_cols int, p_rows int, p_display_name text, p_color text)
returns table (table_id uuid, code text) as $$
declare
  v_table_id uuid;
  v_code text;
begin
  -- caller must already be auth'd (anonymous is fine)
  insert into tables (name, host_id) values (p_name, auth.uid()) returning id into v_table_id;
  insert into maps (table_id, name, cols, rows) values (v_table_id, p_name, p_cols, p_rows);
  insert into players (table_id, auth_user_id, name, color, is_host) values (v_table_id, auth.uid(), p_display_name, p_color, true);
  v_code := generate_unique_code();          -- helper: unambiguous alphabet, retries on collision
  insert into invite_codes (code, table_id) values (v_code, v_table_id);
  return query select v_table_id, v_code;
end;
$$ language plpgsql security definer;

create or replace function join_table(p_code text, p_display_name text, p_color text)
returns uuid as $$
declare
  v_table_id uuid;
begin
  select table_id into v_table_id from invite_codes where code = upper(p_code) and revoked_at is null;
  if v_table_id is null then raise exception 'Invalid or expired invite code'; end if;
  if not (select is_open from tables where id = v_table_id) then raise exception 'Table is closed'; end if;

  insert into players (table_id, auth_user_id, name, color)
    values (v_table_id, auth.uid(), p_display_name, p_color)
    on conflict (table_id, auth_user_id) do update set connected = true
    returning id into strict v_table_id; -- capacity trigger fires here
  return v_table_id;
end;
$$ language plpgsql security definer;

create or replace function regenerate_invite_code(p_table_id uuid)
returns text as $$
declare v_code text;
begin
  if not exists (select 1 from players where table_id = p_table_id and auth_user_id = auth.uid() and is_host) then
    raise exception 'Only the host may regenerate the invite code';
  end if;
  update invite_codes set revoked_at = now() where table_id = p_table_id and revoked_at is null;
  v_code := generate_unique_code();
  insert into invite_codes (code, table_id) values (v_code, p_table_id);
  return v_code;
end;
$$ language plpgsql security definer;
```

### 9.5 Realtime sync — ✅ `src/lib/realtime.js`

Supabase Realtime streams Postgres changes over WebSocket per table, scoped with a channel per table id:

```js
const channel = supabase.channel(`table:${tableId}`);
channel
  .on('postgres_changes', { event: '*', schema: 'public', table: 'entities', filter: `table_id=eq.${tableId}` },
      (payload) => dispatch(mapPostgresChangeToAction(payload)))
  .on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: `table_id=eq.${tableId}` },
      (payload) => dispatch(mapPostgresChangeToAction(payload)))
  .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'maps', filter: `table_id=eq.${tableId}` },
      (payload) => dispatch({ type: 'SET_MAP', patch: payload.new }))
  .subscribe();
```

- **Optimistic local updates:** dragging a token dispatches `MOVE_ENTITY` locally immediately (unchanged from Phase 1) *and* fires a Supabase update; when that update's own change event comes back it's a no-op (same data), and when a remote player's change arrives it dispatches the same action, converging both views.
- **Conflict resolution:** last-write-wins on `entities.updated_at`, which is fine for token position/HP (single-owner-in-the-moment fields dragged by one person at a time). If two people grab the same token simultaneously, whoever's update commits last wins — acceptable for a cooperative table; a future refinement could add a soft per-token "being dragged by X" broadcast presence event to grey out a token others are currently moving.
- **Presence:** Supabase Realtime Presence tracks `connected` per player without a DB write, syncing the "AWAY" tag instantly when someone closes their tab.

### 9.6 Storage (images) — ✅ `supabase/04_storage.sql`, `src/lib/storageUpload.js` (implemented but not yet called from the upload UI — see README)

- Bucket `token-art` (public-read, authenticated-write) for uploaded hero/monster portraits; bucket `map-backgrounds` likewise for background images.
- Client resizes images to ≤512×512 (tokens) / ≤2048×2048 (backgrounds) via `<canvas>` before upload to bound storage and bandwidth.
- Default hero/monster art stays as the inline SVG data URLs already in `data/defaultTokens.js` — no need to round-trip those through Storage.

### 9.7 API/RPC surface consumed by the frontend — specification only (implemented calls listed inline below)

| Action | Phase 1 (`persistence.js`) | Phase 2 (Supabase) |
|---|---|---|
| Create table | `saveSession(code, state)` | `rpc('create_table', {...})` |
| Join table | `loadSession(code)` + local player insert | `rpc('join_table', {...})` |
| Load table | `loadSession(code)` | `select * from tables/maps/entities/players where table_id = ...` (or a single `get_table_snapshot` RPC) |
| Save map settings | reducer + autosave | `update maps set ...` (host-only via RLS) |
| Move/add/edit/remove entity | reducer + autosave | `insert/update/delete entities ...` + realtime broadcast |
| Regenerate code | reducer + local key swap | `rpc('regenerate_invite_code', {...})` |
| Close/open table | reducer + autosave | `update tables set is_open = ...` |
| Export/import `.json` | file download/`FileReader` | unchanged — still useful as an offline backup even with a backend |

---

## 10. Deployment

- **Frontend:** Vite build (`npm run build`) → static `dist/` → deploy to **Vercel** (or Netlify/GitHub Pages) with zero server config. Environment variables needed in Phase 2: `VITE_SUPABASE_PROJECT_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`.
- **Backend:** a **Supabase** project (free tier is sufficient for early testing) hosts Postgres + Realtime + Storage + Auth; schema and RPCs above are applied via Supabase migrations (`supabase/migrations/*.sql`) so the schema is version-controlled alongside the frontend repo.
- Because the frontend only ever talks to Supabase through `@supabase/supabase-js` using the public anon key plus RLS, the two halves can be deployed, scaled, and redeployed independently — matching the "free to migrate between Vercel or Supabase" requirement. Supabase's own project can equally be swapped for a self-hosted Postgres + a small Node/Express API implementing the same RPC contract in §9.4–9.7, since nothing in the frontend depends on a Supabase-specific SDK feature beyond `supabase-js`'s query/RPC/realtime/storage calls, all of which have documented equivalents.

---

## 11. Testing plan

**Phase 1 (now — front end only):**
- Manual test matrix: create table → verify code shown/copyable; open a second tab, join with the code, verify both tabs converge after a save (since both read the same `localStorage`); resize map; upload a background; place each default hero/monster; upload a custom image; drag tokens including a 2×2 token; use the ruler across straight, diagonal, and mixed paths and hand-verify the 5-10-5 math; edit HP down to trigger the red bar; remove a token; close the table and confirm Join fails with the old code; regenerate the code and confirm the old one is dead; export, clear `localStorage`, import, and confirm full restoration; refresh mid-session and confirm auto-resume.
- Unit-test candidates (pure functions, easy to isolate): `utils/grid.js` (`feetDistance`, `pixelToCell`, `clampGridDims`), `state/store.jsx` reducer (every action, especially the `MAX_PLAYERS` guard in `ADD_PLAYER`).

**Phase 2 (backend):**
- RLS policy tests (a player from Table A must never read/write Table B's rows) via `supabase test db` or `pgTAP`.
- RPC tests for `create_table`/`join_table`/`regenerate_invite_code`, especially the capacity trigger (10th `join_table` call must fail) and the revoked-code path.
- Realtime integration test: two headless clients both subscribed to a table, one moves a token, assert the other receives and applies the same `MOVE_ENTITY`-equivalent update within a bounded time.

---

## 12. Security & privacy considerations

- Invite codes are the *only* credential to join — treat them like a shareable link, not a secret; the "regenerate on open/close" behavior limits how long a leaked code stays useful.
- Phase 1's `.json` export contains everything, including any uploaded images as base64 — warn users not to share exported files publicly if they contain likenesses they don't want shared (this is inherent to the "portable file" feature, not a bug).
- Phase 2 must validate uploaded file MIME types and size limits **server-side** (Storage policies + an edge function check), not just in the client `<input accept>` hint.
- Phase 2's `import_table`-equivalent (overwriting shared state from a file) should be **host-only**, unlike Phase 1's current everyone-can-import default — tighten this policy when the backend lands.
- Rate-limit `join_table` attempts per IP/anon-session to blunt invite-code brute forcing (6-char code space is large, but not infinite).

---

## 13. Roadmap (post Phase 2)

- Fog of war / per-player revealed areas.
- Initiative tracker synced with the turn order of placed tokens.
- Dice roller with shared chat log.
- Freehand/shape drawing tools (cones, circles, lines) for spell templates, snapping to the ruler's distance math.
- "Lock hero tokens to owner" toggle using the `ownerId` field already present in the data model.
- Line-of-sight/vision blocking from wall objects drawn on the map.
- Mobile/touch-optimized token dragging (current Pointer Events implementation already works on touch, but the three-column layout needs a responsive collapse for phones).
