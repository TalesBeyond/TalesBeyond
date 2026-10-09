// The Potions chapter of the compendium: what a Potion Brewer
// (data/merchants.js) keeps on the shelves, and what each is brewed from.
// All of it is this app's own, names, prices and recipes alike. Same shape as
// foods.js, with one more field on a potion:
//   recipe: [{ name, qty }]
// Every name in a recipe is an entry of INGREDIENTS below, so a hero who
// carries them all can have the potion brewed (merchants.js's
// sheetAfterMaking). What a potion does is written in its description, for
// the DM to apply; the app rolls none of it.

export const POTION_CATEGORIES = ['potion', 'elixir', 'magic potion', 'venom'];
export const INGREDIENT_CATEGORY = 'ingredient';

// cost is in gold pieces (gp): 0.01 is one copper, 0.1 one silver.
// `parts` is the recipe, written [qty, 'Ingredient name'].
const P = (category, name, cost, description, parts) => ({
  category,
  name,
  cost,
  description,
  recipe: parts.map(([qty, ingredient]) => ({ name: ingredient, qty })),
});
const I = (name, cost, description) => ({ category: INGREDIENT_CATEGORY, name, cost, description });

export const POTIONS = [
  // Potions: remedies and everyday draughts.
  P('potion', 'Healing draught', 25, 'Thin, red and faintly sweet. The drinker regains 2d4 + 2 hit points.', [[2, 'Heartleaf'], [1, 'Honeycomb'], [1, 'Spring water']]),
  P('potion', 'Greater healing draught', 100, 'Dark red and warm in the hand. The drinker regains 4d4 + 4 hit points.', [[3, 'Heartleaf'], [1, 'Troll sweat'], [1, 'Spring water']]),
  P('potion', 'Superior healing draught', 400, 'It glows like a banked coal. The drinker regains 8d4 + 8 hit points.', [[4, 'Heartleaf'], [2, 'Troll sweat'], [1, 'Pearl dust'], [1, 'Spring water']]),
  P('potion', 'Antidote', 30, 'Black, gritty and foul. It ends one poison in the drinker, and they cannot be poisoned for the next hour.', [[2, 'Willow bark'], [1, 'Charcoal'], [1, 'Spring water']]),
  P('potion', 'Fever tonic', 5, 'A bitter green tea in a bottle. It breaks a common fever overnight and gives advantage on the next saving throw against disease.', [[1, 'Willow bark'], [1, 'Frostmint'], [1, 'Spring water']]),
  P('potion', 'Sleeping draught', 20, 'Milky and smelling of lilies. The drinker makes a DC 12 Constitution saving throw or sleeps for an hour. A willing drinker sleeps soundly through the night.', [[2, 'Dreamlily'], [1, 'Honeycomb'], [1, 'Spring water']]),
  P('potion', 'Wakeroot tonic', 8, 'Brown, sharp and hard to keep down. The drinker needs no sleep tonight and loses one level of exhaustion.', [[2, 'Bitterroot'], [1, 'Frostmint']]),
  P('potion', 'Clotting paste', 10, 'A rust-coloured paste pressed into a wound. It stops bleeding at once and stabilises a dying creature.', [[1, 'Bloodmoss'], [1, 'Chalk dust']]),
  P('potion', 'Burn salve', 6, 'A cool white ointment. Rubbed on a burn, it restores 1d4 hit points lost to fire or acid in the last hour.', [[1, 'Frostmint'], [1, 'Amber resin']]),
  P('potion', 'Smelling salts', 5, 'A stoppered vial that stings the nose from an arm away. Held under the nose, it wakes a sleeping creature and ends the stunned condition.', [[1, 'Salt crystal'], [1, 'Sulfur']]),
  P('potion', 'Night-eye drops', 35, 'Two drops in each eye. The user sees in the dark out to 60 feet for an hour.', [[2, 'Moonpetal'], [1, 'Owl feather'], [1, 'Spring water']]),
  P('potion', 'Diver’s draught', 60, 'It tastes of the bottom of a pond. The drinker breathes water as easily as air for an hour.', [[2, 'Fish scales'], [1, 'Marsh reed'], [1, 'Spring water']]),
  P('potion', 'Hearthwarm cordial', 12, 'Amber and peppery. The drinker shrugs off cold weather for eight hours and has advantage on saving throws against extreme cold.', [[1, 'Emberbloom'], [1, 'Honeycomb']]),
  P('potion', 'Coolwater cordial', 12, 'Pale blue and sharp with mint. The drinker shrugs off heat for eight hours and has advantage on saving throws against extreme heat.', [[2, 'Frostmint'], [1, 'Spring water']]),
  P('potion', 'Gravewarden tonic', 80, 'Cloudy, with a silver sediment. For an hour the drinker has resistance to necrotic damage and cannot catch a disease from the undead.', [[1, 'Powdered silver'], [1, 'Sunwort'], [1, 'Salt crystal']]),

  // Elixirs: slow-brewed, and good for an hour.
  P('elixir', 'Elixir of the Ox', 120, 'Thick, brown and smelling of a stable. For an hour the drinker has advantage on Strength checks and adds 2 to melee damage.', [[1, 'Ogre hair'], [2, 'Iron filings'], [1, 'Bitterroot']]),
  P('elixir', 'Elixir of the Cat', 120, 'Clear, with a green shimmer. For an hour the drinker has advantage on Dexterity checks and lands on their feet from any fall.', [[2, 'Cat whisker'], [1, 'Silverthistle'], [1, 'Spring water']]),
  P('elixir', 'Elixir of the Bear', 120, 'Heavy and sweet as syrup. The drinker gains 2d6 temporary hit points that last an hour.', [[2, 'Beetle shell'], [1, 'Heartleaf'], [1, 'Honeycomb']]),
  P('elixir', 'Elixir of the Owl', 120, 'Grey and perfectly still in the bottle. For an hour the drinker has advantage on Wisdom (Perception) checks and cannot be surprised.', [[2, 'Owl feather'], [1, 'Sunwort'], [1, 'Spring water']]),
  P('elixir', 'Elixir of the Fox', 120, 'A swirl of orange that never settles. For an hour the drinker has advantage on Intelligence checks.', [[1, 'Ghost orchid'], [1, 'Quicksilver'], [1, 'Spring water']]),
  P('elixir', 'Elixir of the Silver Tongue', 150, 'Golden, with a taste of honey and wine. For an hour the drinker has advantage on Charisma checks made to persuade or deceive.', [[2, 'Honeycomb'], [1, 'Dreamlily'], [1, 'Gold flake']]),
  P('elixir', 'Elixir of Swiftness', 200, 'It fizzes against the glass. For an hour the drinker’s walking speed rises by 10 feet and opportunity attacks against them have disadvantage.', [[1, 'Quicksilver'], [2, 'Silverthistle'], [1, 'Frostmint']]),
  P('elixir', 'Elixir of Ironhide', 250, 'Grey and gritty, like wet slate. For an hour the drinker’s Armor Class rises by 1.', [[2, 'Iron filings'], [2, 'Beetle shell'], [1, 'Amber resin']]),
  P('elixir', 'Elixir of Fire Ward', 150, 'Cold enough to frost the bottle. For an hour the drinker has resistance to fire damage.', [[1, 'Dragon scale flake'], [2, 'Frostmint'], [1, 'Spring water']]),
  P('elixir', 'Elixir of Frost Ward', 150, 'It steams when the stopper is pulled. For an hour the drinker has resistance to cold damage.', [[2, 'Emberbloom'], [1, 'Sulfur'], [1, 'Spring water']]),
  P('elixir', 'Elixir of Storm Ward', 150, 'A slick yellow oil that makes the hair stand up. For an hour the drinker has resistance to lightning and thunder damage.', [[1, 'Eel slime'], [2, 'Amber resin']]),
  P('elixir', 'Elixir of Clear Mind', 180, 'As clear as water, with one grain of salt at the bottom. For an hour the drinker has advantage on saving throws against being charmed or frightened.', [[2, 'Sunwort'], [1, 'Salt crystal'], [1, 'Spring water']]),
  P('elixir', 'Elixir of Second Wind', 90, 'Bright green and bitter. The drinker loses two levels of exhaustion and can travel a full day more without rest.', [[2, 'Bitterroot'], [1, 'Heartleaf'], [1, 'Honeycomb']]),
  P('elixir', 'Elixir of Giant Might', 600, 'It is heavier than the bottle looks. For an hour the drinker’s Strength is 21.', [[1, 'Giant toenail'], [2, 'Ogre hair'], [2, 'Iron filings']]),
  P('elixir', 'Elixir of Life', 1500, 'A single mouthful of gold light. Poured between the lips of a creature that died within the last minute, it returns them to life with 1 hit point.', [[1, 'Phoenix ash'], [4, 'Heartleaf'], [2, 'Pearl dust'], [1, 'Gold flake']]),

  // Magic potions: an enchantment in a bottle.
  P('magic potion', 'Potion of Invisibility', 500, 'The bottle looks empty. The drinker and everything they carry are invisible for 10 minutes, or until they attack or cast a spell.', [[2, 'Ghost orchid'], [2, 'Moonpetal'], [1, 'Quicksilver']]),
  P('magic potion', 'Potion of Flight', 600, 'It floats to the top of its own bottle. The drinker has a flying speed of 60 feet for 10 minutes, and comes down gently when it ends.', [[2, 'Bat wing'], [2, 'Owl feather'], [1, 'Quicksilver']]),
  P('magic potion', 'Potion of Giant Growth', 300, 'Red, with a cap of foam that keeps rising. The drinker grows one size larger for 10 minutes and adds 1d4 to weapon damage.', [[1, 'Giant toenail'], [2, 'Redcap mushroom']]),
  P('magic potion', 'Potion of Shrinking', 300, 'A thimble of grey liquid. The drinker and their gear shrink to the size of a mouse for 10 minutes.', [[1, 'Mole claw'], [2, 'Redcap mushroom'], [1, 'Chalk dust']]),
  P('magic potion', 'Potion of Mist Form', 450, 'Fog coils inside the glass. For 10 minutes the drinker is a drifting cloud that can pass through any crack, and cannot attack or speak.', [[1, 'Ghost orchid'], [2, 'Marsh reed'], [2, 'Spring water']]),
  P('magic potion', 'Potion of Mind Reading', 350, 'Violet, with slow sparks in it. For 10 minutes the drinker hears the surface thoughts of one creature within 30 feet that they can see.', [[2, 'Dreamlily'], [1, 'Pearl dust'], [1, 'Quicksilver']]),
  P('magic potion', 'Potion of Dragon Breath', 400, 'Orange, and too hot to hold for long. Three times in the next 10 minutes the drinker can breathe a 15-foot cone of fire: 3d6 fire damage, or half on a DC 13 Dexterity saving throw.', [[2, 'Dragon scale flake'], [2, 'Emberbloom'], [1, 'Sulfur']]),
  P('magic potion', 'Potion of Stoneskin', 500, 'Grey sludge that sets if left unstoppered. For 10 minutes the drinker has resistance to bludgeoning, piercing and slashing damage from weapons that are not magical.', [[1, 'Basilisk scale'], [2, 'Chalk dust'], [1, 'Iron filings']]),
  P('magic potion', 'Potion of Beast Speech', 100, 'It smells of wet fur. For an hour the drinker understands animals and is understood by them.', [[1, 'Cat whisker'], [1, 'Owl feather'], [1, 'Honeycomb']]),
  P('magic potion', 'Potion of Tongues', 200, 'It tastes different to everyone. For an hour the drinker speaks and understands every spoken language.', [[1, 'Ghost orchid'], [1, 'Honeycomb'], [1, 'Gold flake']]),
  P('magic potion', 'Potion of Feather Fall', 150, 'White, with down floating in it. For an hour the drinker falls slowly and takes no damage on landing.', [[2, 'Owl feather'], [1, 'Marsh reed'], [1, 'Spring water']]),
  P('magic potion', 'Potion of Water Walking', 150, 'It beads on the glass like oil. For an hour the drinker walks on water, mud and snow as if on firm ground.', [[1, 'Eel slime'], [2, 'Fish scales'], [1, 'Marsh reed']]),
  P('magic potion', 'Potion of True Seeing', 800, 'Clear, and bright enough to read by. For 10 minutes the drinker sees invisible creatures, sees through illusions and sees a shapechanger’s real form.', [[2, 'Pearl dust'], [2, 'Sunwort'], [1, 'Powdered silver']]),
  P('magic potion', 'Potion of Luck', 700, 'A green leaf turns in it without ever sinking. Once in the next hour the drinker can roll a d20 again and keep either result.', [[1, 'Four-leaf clover'], [2, 'Gold flake'], [1, 'Sunwort']]),
  P('magic potion', 'Potion of Disguise', 250, 'Its colour changes each time you look away. For an hour the drinker looks and sounds like another person of their size that they have seen.', [[1, 'Toad skin'], [1, 'Quicksilver'], [1, 'Dreamlily']]),

  // Venoms: for a blade, a cup or a pinch of dust.
  P('venom', 'Spider venom', 60, 'Coats one weapon or three arrows for a minute. A creature it wounds makes a DC 11 Constitution saving throw or takes 1d6 poison damage and is poisoned for a minute.', [[2, 'Spider venom gland'], [1, 'Spring water']]),
  P('venom', 'Serpent kiss', 100, 'A yellow oil for a blade. A creature it wounds takes 3d6 poison damage, or half on a DC 13 Constitution saving throw.', [[2, 'Serpent fang'], [1, 'Nightshade berries']]),
  P('venom', 'Nightshade tincture', 75, 'Dark, sweet and easily hidden in wine. A creature that drinks it makes a DC 13 Constitution saving throw or takes 2d6 poison damage and is poisoned for an hour.', [[3, 'Nightshade berries'], [1, 'Spring water']]),
  P('venom', 'Drowsing venom', 120, 'A pale gum for a dart or an arrowhead. A creature it wounds makes a DC 13 Constitution saving throw or falls asleep for a minute, waking if it is hurt or shaken.', [[2, 'Dreamlily'], [1, 'Wasp stinger'], [1, 'Spider venom gland']]),
  P('venom', 'Numbing toad oil', 90, 'A grease that works through the skin. A creature that touches it makes a DC 12 Constitution saving throw or has disadvantage on attack rolls for a minute.', [[2, 'Toad skin'], [1, 'Marsh reed']]),
  P('venom', 'Wyvern sting', 600, 'A black drop that eats at the bottle’s cork. A creature it wounds takes 7d6 poison damage, or half on a DC 15 Constitution saving throw.', [[1, 'Wyvern stinger'], [1, 'Nightshade berries'], [1, 'Sulfur']]),
  P('venom', 'Widow’s whisper', 200, 'Without colour, smell or taste. A creature that drinks it makes a DC 14 Constitution saving throw or cannot speak for an hour.', [[1, 'Ghost orchid'], [1, 'Nightshade berries'], [1, 'Chalk dust']]),
  P('venom', 'Bloodthinner', 110, 'A thin red oil for a blade. A creature it wounds bleeds for 1d4 damage at the start of each of its next three turns.', [[2, 'Bloodmoss'], [1, 'Wasp stinger']]),
  P('venom', 'Stonejoint venom', 400, 'Grey and slow as cold honey. A creature it wounds makes a DC 14 Constitution saving throw or is paralysed for a minute. It repeats the saving throw at the end of each of its turns.', [[1, 'Basilisk scale'], [2, 'Spider venom gland']]),
  P('venom', 'Fool’s honey', 50, 'It looks and tastes like honey. A creature that eats it makes a DC 12 Wisdom saving throw or laughs helplessly for a minute, able to do nothing else on its turn.', [[2, 'Redcap mushroom'], [1, 'Honeycomb']]),
  P('venom', 'Blindeye dust', 150, 'A pinch of black powder to throw. Each creature in a 5-foot square makes a DC 13 Constitution saving throw or is blinded for a minute.', [[1, 'Sulfur'], [1, 'Charcoal'], [1, 'Bat wing']]),
  P('venom', 'Gravecap extract', 300, 'It does nothing for an hour. Then the creature that swallowed it makes a DC 15 Constitution saving throw or takes 4d6 poison damage and is poisoned for a day.', [[3, 'Gravecap mushroom'], [1, 'Ghoul nail']]),
  P('venom', 'Loose-tongue serum', 150, 'A sour, clear liquid. A creature that drinks it makes a DC 13 Charisma saving throw or cannot knowingly tell a lie for an hour.', [[1, 'Moonpetal'], [1, 'Salt crystal'], [1, 'Quicksilver']]),
  P('venom', 'Rot-gut', 20, 'Cheap, green and common in bad taverns. A creature that drinks it makes a DC 10 Constitution saving throw or is poisoned for an hour.', [[1, 'Toad skin'], [1, 'Marsh reed']]),
  P('venom', 'Wasp-fire oil', 80, 'Coats one weapon for a minute. Its next three hits each deal 1d4 more poison damage.', [[3, 'Wasp stinger'], [1, 'Amber resin']]),
];

// What the potions above are brewed from. Found in a chest, handed out by the
// DM or sold by a Wandering Salesman; a Potion Brewer sells none of it.
export const INGREDIENTS = [
  // Gathered.
  I('Heartleaf', 1, 'A broad leaf with red veins. Crushed, it closes a small cut.'),
  I('Willow bark', 0.1, 'Strips of grey bark, chewed for aches and fever.'),
  I('Frostmint', 0.5, 'A blue-green herb that numbs the tongue with cold.'),
  I('Bitterroot', 0.5, 'A knotted brown root. One bite keeps a watchman awake.'),
  I('Moonpetal', 3, 'A pale flower that opens only at night.'),
  I('Dreamlily', 4, 'A white lily with a heavy, drowsy scent.'),
  I('Silverthistle', 2, 'A thistle with a bright metallic down that drifts on any breeze.'),
  I('Emberbloom', 5, 'An orange flower that stays warm for days after it is picked.'),
  I('Sunwort', 2, 'A small yellow herb that turns to face the light, even in a jar.'),
  I('Bloodmoss', 2, 'A red moss that grows on old battlefields.'),
  I('Ghost orchid', 25, 'A leafless orchid, nearly clear, found in deep and quiet woods.'),
  I('Nightshade berries', 3, 'Glossy black berries. Sweet, and deadly by the handful.'),
  I('Redcap mushroom', 1, 'A red mushroom with white spots. It makes things seem larger or smaller than they are.'),
  I('Gravecap mushroom', 15, 'A grey mushroom that grows only on graves.'),
  I('Marsh reed', 0.1, 'A hollow reed from still water.'),
  I('Four-leaf clover', 20, 'Pressed flat in a scrap of paper. Hard to find, harder to find twice.'),
  I('Honeycomb', 0.5, 'A piece of wax comb, still full.'),

  // Dug, ground or bought by weight.
  I('Spring water', 0.1, 'A vial of clean water taken where it leaves the rock.'),
  I('Salt crystal', 0.2, 'A clear lump of rock salt.'),
  I('Sulfur', 1, 'Yellow powder with the smell of bad eggs.'),
  I('Charcoal', 0.05, 'Burnt willow, ground fine.'),
  I('Chalk dust', 0.05, 'White powder scraped from a cliff.'),
  I('Iron filings', 0.5, 'Sweepings from under a smith’s file.'),
  I('Quicksilver', 15, 'A bead of liquid metal in a sealed glass tube.'),
  I('Amber resin', 5, 'A lump of hardened golden sap.'),
  I('Pearl dust', 30, 'A river pearl ground to a fine white powder.'),
  I('Gold flake', 25, 'A pinch of beaten gold leaf.'),
  I('Powdered silver', 10, 'Silver filed to dust, kept in a twist of cloth.'),

  // Taken from a creature.
  I('Spider venom gland', 8, 'A small sac cut from a giant spider, still full.'),
  I('Serpent fang', 10, 'A hollow fang with venom dried inside it.'),
  I('Toad skin', 2, 'The warty hide of a marsh toad, dried flat.'),
  I('Bat wing', 1, 'A leathery wing, folded and dried.'),
  I('Owl feather', 1, 'A soft grey feather that makes no sound in the air.'),
  I('Cat whisker', 0.5, 'Freely shed, the brewers insist.'),
  I('Fish scales', 0.2, 'A spoonful of silver scales.'),
  I('Eel slime', 3, 'A jar of clear slime that tingles on the skin.'),
  I('Beetle shell', 1, 'The black wing cases of a stag beetle.'),
  I('Wasp stinger', 2, 'The sting of a giant wasp, as long as a finger.'),
  I('Mole claw', 1, 'A small, broad claw made for digging.'),
  I('Ogre hair', 15, 'A coarse black tuft, thick as wire.'),
  I('Troll sweat', 30, 'A greasy green fluid. A cut smeared with it closes while you watch.'),
  I('Giant toenail', 80, 'A yellow clipping the size of a roof slate.'),
  I('Dragon scale flake', 60, 'A chip from a shed dragon scale, warm to the touch.'),
  I('Basilisk scale', 70, 'A scale as grey and heavy as a stone.'),
  I('Wyvern stinger', 150, 'The barbed tip of a wyvern’s tail, wrapped in oilcloth.'),
  I('Ghoul nail', 12, 'A long black fingernail that never stops smelling of the grave.'),
  I('Phoenix ash', 400, 'A pinch of white ash that is still faintly warm.'),
];
