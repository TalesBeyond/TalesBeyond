-- Hearthbound — 55_no_stored_images.sql
-- No picture is stored in the database any more (src/lib/storedImages.js).
-- A token's image_url is either a reference to one of the app's built-in
-- icons — 'icon:<name>:<#color>', drawn by the client from its own files — or
-- '' (the client then shows that kind's default icon), or a DM upload's
-- fingerprint — 'img:<sha-256 hex>' — whose picture lives only in the players'
-- browsers and travels between them (src/lib/imageExchange.js). Island
-- backgrounds are null or such a fingerprint. Custom-asset pictures are never
-- stored.
--
-- 1. Existing built-in icons, stored until now as whole SVG data URLs, are
--    converted to references (matched against the exact icon drawings in
--    src/data/defaultTokens.js, longest first).
-- 2. Every other stored picture — uploaded token art, compendium portraits,
--    map backgrounds, custom-asset images — is removed.
-- 3. Check constraints keep it that way, whatever a client sends.
--
-- Freed space becomes reusable as autovacuum runs. To shrink the database
-- files right away, run in the SQL Editor (outside a transaction):
--   vacuum full entities, islands, custom_assets;

-- The DM-only edit trigger checks auth.uid(), which a migration doesn't have.
alter table entities disable trigger trg_entities_permissions;

do $$
declare
  r record;
begin
  for r in
    select * from (values
    ('spider', '%3Cellipse%20cx%3D%2232%22%20cy%3D%2235%22%20rx%3D%229%22%20ry%3D%2211%22%20fill%3D%22%23f2e9d4%22%2F%3E%3Ccircle%20cx%3D%2232%22%20cy%3D%2220%22%20r%3D%225%22%20fill%3D%22%23f2e9d4%22%2F%3E%3Cg%20stroke%3D%22%23f2e9d4%22%20stroke-width%3D%223%22%20fill%3D%22none%22%20stroke-linecap%3D%22round%22%3E%3Cpath%20d%3D%22M24%2030%20L12%2022%22%2F%3E%3Cpath%20d%3D%22M23%2036%20L10%2038%22%2F%3E%3Cpath%20d%3D%22M24%2042%20L14%2052%22%2F%3E%3Cpath%20d%3D%22M40%2030%20L52%2022%22%2F%3E%3Cpath%20d%3D%22M41%2036%20L54%2038%22%2F%3E%3Cpath%20d%3D%22M40%2042%20L50%2052%22%2F%3E%3C%2Fg%3E'),
    ('phase-day', '%3Ccircle%20cx%3D%2232%22%20cy%3D%2232%22%20r%3D%2210%22%20fill%3D%22%23f2e9d4%22%2F%3E%3Cg%20stroke%3D%22%23f2e9d4%22%20stroke-width%3D%223.5%22%20stroke-linecap%3D%22round%22%3E%3Cpath%20d%3D%22M32%2010%20V16%22%2F%3E%3Cpath%20d%3D%22M32%2048%20V54%22%2F%3E%3Cpath%20d%3D%22M10%2032%20H16%22%2F%3E%3Cpath%20d%3D%22M48%2032%20H54%22%2F%3E%3Cpath%20d%3D%22M16.5%2016.5%20L20.7%2020.7%22%2F%3E%3Cpath%20d%3D%22M43.3%2043.3%20L47.5%2047.5%22%2F%3E%3Cpath%20d%3D%22M16.5%2047.5%20L20.7%2043.3%22%2F%3E%3Cpath%20d%3D%22M43.3%2020.7%20L47.5%2016.5%22%2F%3E%3C%2Fg%3E'),
    ('isle-gas', '%3Cg%20fill%3D%22%23f2e9d4%22%3E%3Ccircle%20cx%3D%2224%22%20cy%3D%2238%22%20r%3D%2210%22%2F%3E%3Ccircle%20cx%3D%2237%22%20cy%3D%2231%22%20r%3D%2212%22%2F%3E%3Ccircle%20cx%3D%2246%22%20cy%3D%2242%22%20r%3D%228%22%2F%3E%3Ccircle%20cx%3D%2227%22%20cy%3D%2247%22%20r%3D%228%22%2F%3E%3C%2Fg%3E%3Ccircle%20cx%3D%2233%22%20cy%3D%2236%22%20r%3D%222.6%22%20fill%3D%22%2317140f%22%2F%3E%3Ccircle%20cx%3D%2242%22%20cy%3D%2244%22%20r%3D%222%22%20fill%3D%22%2317140f%22%2F%3E%3Ccircle%20cx%3D%2224%22%20cy%3D%2244%22%20r%3D%222%22%20fill%3D%22%2317140f%22%2F%3E'),
    ('poison', '%3Cpath%20d%3D%22M32%2014%20C42%2014%2046%2024%2046%2034%20C46%2046%2040%2052%2032%2052%20C24%2052%2018%2046%2018%2034%20C18%2024%2022%2014%2032%2014%20Z%22%20fill%3D%22%23f2e9d4%22%20stroke%3D%22%2317140f%22%20stroke-width%3D%222%22%2F%3E%3Ccircle%20cx%3D%2226%22%20cy%3D%2234%22%20r%3D%222.6%22%20fill%3D%22%2317140f%22%2F%3E%3Ccircle%20cx%3D%2238%22%20cy%3D%2234%22%20r%3D%222.6%22%20fill%3D%22%2317140f%22%2F%3E%3Cpath%20d%3D%22M25%2043%20Q32%2038%2039%2043%22%20stroke%3D%22%2317140f%22%20stroke-width%3D%222%22%20fill%3D%22none%22%2F%3E'),
    ('isle-storm', '%3Cg%20fill%3D%22%23f2e9d4%22%3E%3Ccircle%20cx%3D%2224%22%20cy%3D%2226%22%20r%3D%229%22%2F%3E%3Ccircle%20cx%3D%2236%22%20cy%3D%2222%22%20r%3D%2211%22%2F%3E%3Ccircle%20cx%3D%2246%22%20cy%3D%2229%22%20r%3D%228%22%2F%3E%3Crect%20x%3D%2218%22%20y%3D%2228%22%20width%3D%2234%22%20height%3D%228%22%20rx%3D%224%22%2F%3E%3C%2Fg%3E%3Cpath%20d%3D%22M34%2034%20L26%2048%20L32%2048%20L28%2058%20L42%2042%20L35%2042%20L39%2034%20Z%22%20fill%3D%22%23e9c13a%22%20stroke%3D%22%2317140f%22%20stroke-width%3D%221.5%22%20stroke-linejoin%3D%22round%22%2F%3E'),
    ('stunned', '%3Ccircle%20cx%3D%2223%22%20cy%3D%2226%22%20r%3D%223%22%20fill%3D%22%23f2e9d4%22%2F%3E%3Ccircle%20cx%3D%2241%22%20cy%3D%2226%22%20r%3D%223%22%20fill%3D%22%23f2e9d4%22%2F%3E%3Cpath%20d%3D%22M17%2022%20L27%2030%20M27%2022%20L17%2030%22%20stroke%3D%22%23f2e9d4%22%20stroke-width%3D%222%22%2F%3E%3Cpath%20d%3D%22M37%2022%20L47%2030%20M47%2022%20L37%2030%22%20stroke%3D%22%23f2e9d4%22%20stroke-width%3D%222%22%2F%3E%3Cpath%20d%3D%22M20%2044%20Q32%2036%2044%2044%22%20stroke%3D%22%23f2e9d4%22%20stroke-width%3D%223%22%20fill%3D%22none%22%2F%3E'),
    ('isle-drowning', '%3Cg%20fill%3D%22none%22%20stroke%3D%22%23f2e9d4%22%20stroke-width%3D%224%22%20stroke-linecap%3D%22round%22%3E%3Cpath%20d%3D%22M10%2040%20Q18%2034%2026%2040%20T42%2040%20T58%2040%22%2F%3E%3Cpath%20d%3D%22M10%2050%20Q18%2044%2026%2050%20T42%2050%20T58%2050%22%2F%3E%3C%2Fg%3E%3Ccircle%20cx%3D%2224%22%20cy%3D%2222%22%20r%3D%224%22%20fill%3D%22%23f2e9d4%22%2F%3E%3Ccircle%20cx%3D%2235%22%20cy%3D%2213%22%20r%3D%223%22%20fill%3D%22%23f2e9d4%22%2F%3E%3Ccircle%20cx%3D%2242%22%20cy%3D%2226%22%20r%3D%222.5%22%20fill%3D%22%23f2e9d4%22%2F%3E'),
    ('fist', '%3Crect%20x%3D%2218%22%20y%3D%2224%22%20width%3D%2228%22%20height%3D%2222%22%20rx%3D%226%22%20fill%3D%22%23f2e9d4%22%2F%3E%3Cg%20stroke%3D%22%2317140f%22%20stroke-width%3D%222%22%3E%3Cline%20x1%3D%2225%22%20y1%3D%2224%22%20x2%3D%2225%22%20y2%3D%2234%22%2F%3E%3Cline%20x1%3D%2232%22%20y1%3D%2224%22%20x2%3D%2232%22%20y2%3D%2234%22%2F%3E%3Cline%20x1%3D%2239%22%20y1%3D%2224%22%20x2%3D%2239%22%20y2%3D%2234%22%2F%3E%3C%2Fg%3E%3Crect%20x%3D%2222%22%20y%3D%2246%22%20width%3D%2220%22%20height%3D%228%22%20fill%3D%22%23f2e9d4%22%2F%3E'),
    ('phase-dawn', '%3Cpath%20d%3D%22M18%2042%20A14%2014%200%200%201%2046%2042%20Z%22%20fill%3D%22%23f2e9d4%22%2F%3E%3Cg%20stroke%3D%22%23f2e9d4%22%20stroke-width%3D%223.5%22%20stroke-linecap%3D%22round%22%3E%3Cpath%20d%3D%22M9%2042%20H55%22%2F%3E%3Cpath%20d%3D%22M32%2016%20V22%22%2F%3E%3Cpath%20d%3D%22M13%2024%20L17%2028%22%2F%3E%3Cpath%20d%3D%22M51%2024%20L47%2028%22%2F%3E%3C%2Fg%3E%3Cpath%20d%3D%22M18%2051%20H46%22%20stroke%3D%22%23f2e9d4%22%20stroke-width%3D%223%22%20stroke-linecap%3D%22round%22%20opacity%3D%220.55%22%2F%3E'),
    ('isle-dark', '%3Cdefs%3E%3Cmask%20id%3D%22m%22%3E%3Crect%20width%3D%2264%22%20height%3D%2264%22%20fill%3D%22%23fff%22%2F%3E%3Ccircle%20cx%3D%2240%22%20cy%3D%2226%22%20r%3D%2215%22%20fill%3D%22%23000%22%2F%3E%3C%2Fmask%3E%3C%2Fdefs%3E%3Ccircle%20cx%3D%2230%22%20cy%3D%2232%22%20r%3D%2219%22%20fill%3D%22%23f2e9d4%22%20mask%3D%22url(%23m)%22%2F%3E%3Ccircle%20cx%3D%2248%22%20cy%3D%2246%22%20r%3D%222.5%22%20fill%3D%22%23f2e9d4%22%2F%3E%3Ccircle%20cx%3D%2220%22%20cy%3D%2212%22%20r%3D%222%22%20fill%3D%22%23f2e9d4%22%2F%3E'),
    ('isle-unstable', '%3Cpath%20d%3D%22M12%2028%20L26%2036%20L21%2042%20L38%2048%20L33%2056%22%20fill%3D%22none%22%20stroke%3D%22%23f2e9d4%22%20stroke-width%3D%224%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3Ccircle%20cx%3D%2244%22%20cy%3D%2224%22%20r%3D%224%22%20fill%3D%22%23f2e9d4%22%2F%3E%3Ccircle%20cx%3D%2251%22%20cy%3D%2234%22%20r%3D%222.6%22%20fill%3D%22%23f2e9d4%22%2F%3E%3Ccircle%20cx%3D%2217%22%20cy%3D%2216%22%20r%3D%222.4%22%20fill%3D%22%23f2e9d4%22%2F%3E'),
    ('chest', '%3Crect%20x%3D%2214%22%20y%3D%2226%22%20width%3D%2236%22%20height%3D%2222%22%20rx%3D%222%22%20fill%3D%22%23c98a3b%22%20stroke%3D%22%2317140f%22%20stroke-width%3D%222%22%2F%3E%3Crect%20x%3D%2214%22%20y%3D%2220%22%20width%3D%2236%22%20height%3D%2210%22%20rx%3D%222%22%20fill%3D%22%23f2e9d4%22%20stroke%3D%22%2317140f%22%20stroke-width%3D%222%22%2F%3E%3Crect%20x%3D%2229%22%20y%3D%2230%22%20width%3D%226%22%20height%3D%228%22%20rx%3D%221%22%20fill%3D%22%2317140f%22%2F%3E'),
    ('chest-open', '%3Crect%20x%3D%2214%22%20y%3D%2230%22%20width%3D%2236%22%20height%3D%2218%22%20rx%3D%222%22%20fill%3D%22%23c98a3b%22%20stroke%3D%22%2317140f%22%20stroke-width%3D%222%22%2F%3E%3Cpath%20d%3D%22M14%2030%20L18%2014%20L46%2014%20L50%2030%20Z%22%20fill%3D%22%23f2e9d4%22%20stroke%3D%22%2317140f%22%20stroke-width%3D%222%22%2F%3E%3Crect%20x%3D%2225%22%20y%3D%2234%22%20width%3D%2214%22%20height%3D%226%22%20rx%3D%221%22%20fill%3D%22%2317140f%22%20opacity%3D%220.35%22%2F%3E'),
    ('sunburst', '%3Ccircle%20cx%3D%2232%22%20cy%3D%2232%22%20r%3D%2210%22%20fill%3D%22%23f2e9d4%22%2F%3E%3Cg%20stroke%3D%22%23f2e9d4%22%20stroke-width%3D%223%22%3E%3Cline%20x1%3D%2232%22%20y1%3D%228%22%20x2%3D%2232%22%20y2%3D%2216%22%2F%3E%3Cline%20x1%3D%2232%22%20y1%3D%2248%22%20x2%3D%2232%22%20y2%3D%2256%22%2F%3E%3Cline%20x1%3D%228%22%20y1%3D%2232%22%20x2%3D%2216%22%20y2%3D%2232%22%2F%3E%3Cline%20x1%3D%2248%22%20y1%3D%2232%22%20x2%3D%2256%22%20y2%3D%2232%22%2F%3E%3C%2Fg%3E'),
    ('paw', '%3Cellipse%20cx%3D%2232%22%20cy%3D%2242%22%20rx%3D%2211%22%20ry%3D%229%22%20fill%3D%22%23f2e9d4%22%2F%3E%3Ccircle%20cx%3D%2218%22%20cy%3D%2230%22%20r%3D%225%22%20fill%3D%22%23f2e9d4%22%2F%3E%3Ccircle%20cx%3D%2227%22%20cy%3D%2221%22%20r%3D%225%22%20fill%3D%22%23f2e9d4%22%2F%3E%3Ccircle%20cx%3D%2237%22%20cy%3D%2221%22%20r%3D%225%22%20fill%3D%22%23f2e9d4%22%2F%3E%3Ccircle%20cx%3D%2246%22%20cy%3D%2230%22%20r%3D%225%22%20fill%3D%22%23f2e9d4%22%2F%3E'),
    ('isle-fire', '%3Cpath%20d%3D%22M32%208%20C36%2020%2046%2024%2046%2038%20C46%2048%2039%2056%2032%2056%20C25%2056%2018%2048%2018%2038%20C18%2030%2023%2026%2026%2020%20C27%2025%2029%2027%2031%2027%20C30%2020%2030%2014%2032%208%20Z%22%20fill%3D%22%23f2e9d4%22%2F%3E%3Cpath%20d%3D%22M32%2034%20C35%2039%2039%2041%2039%2046%20C39%2050%2036%2053%2032%2053%20C28%2053%2025%2050%2025%2046%20C25%2042%2030%2040%2032%2034%20Z%22%20fill%3D%22%23c2481f%22%2F%3E'),
    ('isle-icy', '%3Cg%20fill%3D%22none%22%20stroke%3D%22%23f2e9d4%22%20stroke-width%3D%223.5%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22M32%2010%20V54%22%2F%3E%3Cpath%20d%3D%22M13%2021%20L51%2043%22%2F%3E%3Cpath%20d%3D%22M13%2043%20L51%2021%22%2F%3E%3Cpath%20d%3D%22M27%2015%20L32%2020%20L37%2015%22%2F%3E%3Cpath%20d%3D%22M27%2049%20L32%2044%20L37%2049%22%2F%3E%3C%2Fg%3E'),
    ('skull', '%3Cellipse%20cx%3D%2232%22%20cy%3D%2228%22%20rx%3D%2216%22%20ry%3D%2214%22%20fill%3D%22%23f2e9d4%22%2F%3E%3Crect%20x%3D%2224%22%20y%3D%2238%22%20width%3D%2216%22%20height%3D%2210%22%20fill%3D%22%23f2e9d4%22%2F%3E%3Ccircle%20cx%3D%2226%22%20cy%3D%2227%22%20r%3D%224%22%20fill%3D%22%2317140f%22%2F%3E%3Ccircle%20cx%3D%2238%22%20cy%3D%2227%22%20r%3D%224%22%20fill%3D%22%2317140f%22%2F%3E'),
    ('trap', '%3Cpath%20d%3D%22M32%2010%20L55%2051%20H9%20Z%22%20fill%3D%22%23f2e9d4%22%20stroke%3D%22%2317140f%22%20stroke-width%3D%222%22%20stroke-linejoin%3D%22round%22%2F%3E%3Crect%20x%3D%2230%22%20y%3D%2224%22%20width%3D%224%22%20height%3D%2215%22%20rx%3D%221.5%22%20fill%3D%22%2317140f%22%2F%3E%3Ccircle%20cx%3D%2232%22%20cy%3D%2244%22%20r%3D%222.6%22%20fill%3D%22%2317140f%22%2F%3E'),
    ('isle-fog', '%3Cg%20fill%3D%22none%22%20stroke%3D%22%23f2e9d4%22%20stroke-width%3D%224%22%20stroke-linecap%3D%22round%22%3E%3Cpath%20d%3D%22M12%2022%20Q20%2016%2028%2022%20T44%2022%20T56%2022%22%2F%3E%3Cpath%20d%3D%22M8%2033%20Q16%2027%2024%2033%20T40%2033%20T56%2033%22%2F%3E%3Cpath%20d%3D%22M12%2044%20Q20%2038%2028%2044%20T44%2044%20T56%2044%22%2F%3E%3C%2Fg%3E'),
    ('isle-rough', '%3Cpath%20d%3D%22M8%2050%20L22%2024%20L34%2050%20Z%22%20fill%3D%22%23f2e9d4%22%20stroke%3D%22%2317140f%22%20stroke-width%3D%222%22%20stroke-linejoin%3D%22round%22%2F%3E%3Cpath%20d%3D%22M28%2050%20L42%2018%20L56%2050%20Z%22%20fill%3D%22%23f2e9d4%22%20stroke%3D%22%2317140f%22%20stroke-width%3D%222%22%20stroke-linejoin%3D%22round%22%2F%3E'),
    ('prone', '%3Cline%20x1%3D%2212%22%20y1%3D%2242%22%20x2%3D%2252%22%20y2%3D%2242%22%20stroke%3D%22%23f2e9d4%22%20stroke-width%3D%223%22%2F%3E%3Ccircle%20cx%3D%2218%22%20cy%3D%2235%22%20r%3D%225%22%20fill%3D%22%23f2e9d4%22%2F%3E%3Crect%20x%3D%2225%22%20y%3D%2237%22%20width%3D%2224%22%20height%3D%226%22%20rx%3D%223%22%20fill%3D%22%23f2e9d4%22%2F%3E'),
    ('slime', '%3Cpath%20d%3D%22M14%2046%20C12%2030%2022%2016%2032%2016%20C42%2016%2052%2030%2050%2046%20Z%22%20fill%3D%22%23f2e9d4%22%2F%3E%3Ccircle%20cx%3D%2226%22%20cy%3D%2234%22%20r%3D%223%22%20fill%3D%22%2317140f%22%2F%3E%3Ccircle%20cx%3D%2238%22%20cy%3D%2234%22%20r%3D%223%22%20fill%3D%22%2317140f%22%2F%3E'),
    ('claw', '%3Cpath%20d%3D%22M16%2046%20L26%2016%20L32%2016%20L24%2046%20Z%22%20fill%3D%22%23f2e9d4%22%2F%3E%3Cpath%20d%3D%22M26%2046%20L34%2014%20L40%2014%20L30%2046%20Z%22%20fill%3D%22%23f2e9d4%22%2F%3E%3Cpath%20d%3D%22M36%2046%20L42%2018%20L48%2018%20L40%2046%20Z%22%20fill%3D%22%23f2e9d4%22%2F%3E'),
    ('bow', '%3Cpath%20d%3D%22M20%2014%20C34%2024%2034%2040%2020%2050%22%20fill%3D%22none%22%20stroke%3D%22%23f2e9d4%22%20stroke-width%3D%223%22%2F%3E%3Cline%20x1%3D%2220%22%20y1%3D%2214%22%20x2%3D%2244%22%20y2%3D%2246%22%20stroke%3D%22%23f2e9d4%22%20stroke-width%3D%222%22%2F%3E'),
    ('door', '%3Crect%20x%3D%2220%22%20y%3D%2212%22%20width%3D%2224%22%20height%3D%2240%22%20rx%3D%222%22%20fill%3D%22%23f2e9d4%22%20stroke%3D%22%2317140f%22%20stroke-width%3D%222%22%2F%3E%3Ccircle%20cx%3D%2238%22%20cy%3D%2232%22%20r%3D%222.5%22%20fill%3D%22%2317140f%22%2F%3E'),
    ('axe', '%3Crect%20x%3D%2229%22%20y%3D%2214%22%20width%3D%226%22%20height%3D%2234%22%20rx%3D%222%22%20fill%3D%22%23f2e9d4%22%2F%3E%3Cpath%20d%3D%22M35%2016%20C46%2012%2050%2022%2040%2028%20C36%2028%2034%2024%2035%2016%20Z%22%20fill%3D%22%23f2e9d4%22%2F%3E'),
    ('bleed', '%3Cpath%20d%3D%22M32%2012%20C40%2026%2046%2034%2046%2042%20C46%2050%2040%2054%2032%2054%20C24%2054%2018%2050%2018%2042%20C18%2034%2024%2026%2032%2012%20Z%22%20fill%3D%22%238f1f1f%22%20stroke%3D%22%23f2e9d4%22%20stroke-width%3D%222%22%2F%3E'),
    ('dagger', '%3Cpath%20d%3D%22M32%2010%20L36%2034%20L32%2044%20L28%2034%20Z%22%20fill%3D%22%23f2e9d4%22%2F%3E%3Crect%20x%3D%2228%22%20y%3D%2242%22%20width%3D%228%22%20height%3D%2212%22%20rx%3D%222%22%20fill%3D%22%23f2e9d4%22%2F%3E'),
    ('lute', '%3Ccircle%20cx%3D%2226%22%20cy%3D%2238%22%20r%3D%2212%22%20fill%3D%22%23f2e9d4%22%2F%3E%3Crect%20x%3D%2234%22%20y%3D%2212%22%20width%3D%226%22%20height%3D%2226%22%20rx%3D%222%22%20fill%3D%22%23f2e9d4%22%2F%3E'),
    ('wand', '%3Ccircle%20cx%3D%2232%22%20cy%3D%2218%22%20r%3D%225%22%20fill%3D%22%23f2e9d4%22%2F%3E%3Crect%20x%3D%2229%22%20y%3D%2222%22%20width%3D%226%22%20height%3D%2230%22%20rx%3D%223%22%20fill%3D%22%23f2e9d4%22%2F%3E'),
    ('shield', '%3Cpath%20d%3D%22M32%2012%20L48%2018%20V32%20C48%2044%2040%2050%2032%2054%20C24%2050%2016%2044%2016%2032%20V18%20Z%22%20fill%3D%22%23f2e9d4%22%20stroke%3D%22%2317140f%22%20stroke-width%3D%222%22%2F%3E'),
    ('eye', '%3Cellipse%20cx%3D%2232%22%20cy%3D%2232%22%20rx%3D%2218%22%20ry%3D%2210%22%20fill%3D%22%23f2e9d4%22%2F%3E%3Ccircle%20cx%3D%2232%22%20cy%3D%2232%22%20r%3D%226%22%20fill%3D%22%2317140f%22%2F%3E'),
    ('shocked', '%3Cpath%20d%3D%22M34%208%20L18%2034%20L28%2034%20L24%2056%20L48%2026%20L36%2026%20Z%22%20fill%3D%22%23f2e9d4%22%20stroke%3D%22%2317140f%22%20stroke-width%3D%221.5%22%2F%3E'),
    ('wing', '%3Cpath%20d%3D%22M12%2040%20C24%2016%2044%2016%2052%2032%20C40%2028%2030%2030%2024%2040%20C20%2034%2016%2034%2012%2040%20Z%22%20fill%3D%22%23f2e9d4%22%2F%3E'),
    ('leaf', '%3Cpath%20d%3D%22M20%2044%20C20%2024%2044%2020%2048%2016%20C44%2044%2030%2048%2020%2044%20Z%22%20fill%3D%22%23f2e9d4%22%2F%3E'),
    ('fangs', '%3Cpath%20d%3D%22M16%2020%20L48%2020%20L40%2044%20L32%2034%20L24%2044%20Z%22%20fill%3D%22%23f2e9d4%22%2F%3E')
    ) as icons(name, inner_svg)
    order by length(inner_svg) desc
  loop
    update entities
       set image_url = 'icon:' || r.name || ':#'
         || substring(image_url from 'r%3D%2232%22%20fill%3D%22%23([0-9a-fA-F]{3,8})%22')
     where image_url like 'data:image/svg+xml;utf8,%'
       and position(r.inner_svg in image_url) > 0
       and substring(image_url from 'r%3D%2232%22%20fill%3D%22%23([0-9a-fA-F]{3,8})%22') is not null;
  end loop;
end $$;

update entities set image_url = '' where image_url !~ '^icon:[a-z-]+:#[0-9a-fA-F]{3,8}$';

alter table entities enable trigger trg_entities_permissions;

update islands set background_url = null where background_url is not null;

update custom_assets set data = data - 'imageUrl' where data ? 'imageUrl';

alter table entities drop constraint if exists entities_image_is_ref;
alter table entities add constraint entities_image_is_ref
  check (image_url = '' or image_url ~ '^icon:[a-z-]+:#[0-9a-fA-F]{3,8}$' or image_url ~ '^img:[0-9a-f]{64}$');

alter table islands drop constraint if exists islands_background_is_ref;
alter table islands add constraint islands_background_is_ref
  check (background_url is null or background_url ~ '^img:[0-9a-f]{64}$');

alter table custom_assets drop constraint if exists custom_assets_no_image;
alter table custom_assets add constraint custom_assets_no_image
  check (not (data ? 'imageUrl'));
