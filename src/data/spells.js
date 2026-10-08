// The Spells chapter of the compendium: one hundred spells, cantrips first.
// The names, levels and schools follow the published 5e SRD; the descriptions
// are our own wording, short enough to read at the table. A spell given or
// sold to a hero is written into its Spells tab at the spell's level
// (data/merchants.js's sheetWithGoods), not put in its bag.

export const SPELL_SCHOOLS = ['abjuration', 'conjuration', 'divination', 'enchantment', 'evocation', 'illusion', 'necromancy', 'transmutation'];

export function spellLevelLabel(level) {
  return level === 0 ? 'Cantrip' : `Level ${level}`;
}

// What it costs to be taught a spell or buy its scroll, in gold pieces, by
// spell level (0 is a cantrip). The SRD sets no price, so these are our own.
export const SPELL_COST = [15, 50, 150, 300, 600, 1200, 2500, 5000, 10000, 25000];

const S = (level, school, name, description) => ({ level, school, name, cost: SPELL_COST[level], description });

export const SPELLS = [
  S(0, 'conjuration', 'Acid Splash', 'Hurls a bubble of acid at one creature, or two standing side by side, for 1d6 acid damage on a failed Dexterity save.'),
  S(0, 'necromancy', 'Chill Touch', 'A ghostly hand grips a creature within 120 feet for 1d8 necrotic damage and stops it regaining hit points until your next turn.'),
  S(0, 'evocation', 'Dancing Lights', 'Up to four floating lights, like torches or glowing orbs, that you can move about for a minute.'),
  S(0, 'evocation', 'Fire Bolt', 'A mote of fire streaks at a target within 120 feet for 1d10 fire damage and sets loose flammable things alight.'),
  S(0, 'divination', 'Guidance', 'A touch lets one willing creature add 1d4 to a single ability check within the next minute.'),
  S(0, 'evocation', 'Light', 'An object you touch shines like a torch for an hour.'),
  S(0, 'conjuration', 'Mage Hand', 'A spectral hand that can carry ten pounds, open a door or fetch a key from 30 feet away.'),
  S(0, 'transmutation', 'Mending', 'Repairs a single break or tear in an object: a snapped chain link, a torn cloak, a leaking wineskin.'),
  S(0, 'transmutation', 'Message', 'You whisper to a creature within 120 feet. Only it hears you, and it can whisper back.'),
  S(0, 'illusion', 'Minor Illusion', 'A sound or the image of an object, no larger than a 5-foot cube, that lasts a minute.'),
  S(0, 'transmutation', 'Prestidigitation', 'A small magical trick: light a candle, clean a shirt, chill a drink or flavour a meal.'),
  S(0, 'evocation', 'Ray of Frost', 'A beam of cold deals 1d8 cold damage and slows the target by 10 feet until your next turn.'),
  S(0, 'evocation', 'Sacred Flame', 'Radiance falls on a creature you can see for 1d8 radiant damage on a failed Dexterity save. Cover does not help it.'),
  S(0, 'evocation', 'Shocking Grasp', 'A jolt of lightning from your hand deals 1d8 lightning damage and stops the target taking reactions.'),

  S(1, 'enchantment', 'Bless', 'Up to three creatures add 1d4 to their attack rolls and saving throws for a minute.'),
  S(1, 'evocation', 'Burning Hands', 'A 15-foot cone of flame from your fingertips deals 3d6 fire damage, half on a successful Dexterity save.'),
  S(1, 'enchantment', 'Charm Person', 'A humanoid that fails a Wisdom save treats you as a friendly acquaintance for an hour, and knows it afterward.'),
  S(1, 'enchantment', 'Command', 'You speak a one-word order, such as flee, drop or halt, and a creature that fails a Wisdom save obeys on its turn.'),
  S(1, 'evocation', 'Cure Wounds', 'A creature you touch regains 1d8 hit points plus your spellcasting modifier.'),
  S(1, 'divination', 'Detect Magic', 'For ten minutes you sense magic within 30 feet and can see its aura and school.'),
  S(1, 'illusion', 'Disguise Self', 'You look like someone else, clothes and gear included, for an hour.'),
  S(1, 'conjuration', 'Entangle', 'Weeds and vines sprout in a 20-foot square, restraining creatures that fail a Strength save.'),
  S(1, 'evocation', 'Faerie Fire', 'Creatures in a 20-foot cube are outlined in light. Attacks against them have advantage and they cannot turn invisible.'),
  S(1, 'transmutation', 'Feather Fall', 'Up to five falling creatures drift down at 60 feet a round and land on their feet unhurt.'),
  S(1, 'conjuration', 'Fog Cloud', 'A 20-foot sphere of thick fog heavily obscures everything inside it for up to an hour.'),
  S(1, 'evocation', 'Guiding Bolt', 'A flash of light deals 4d6 radiant damage, and the next attack against the target has advantage.'),
  S(1, 'evocation', 'Healing Word', 'A word spoken as a bonus action restores 1d4 hit points plus your modifier to a creature within 60 feet.'),
  S(1, 'divination', 'Identify', 'You learn the properties of a magic item you hold, and whether it needs attunement.'),
  S(1, 'transmutation', 'Jump', 'A creature you touch can jump three times as far for a minute.'),
  S(1, 'abjuration', 'Mage Armor', 'An unarmoured creature’s armor class becomes 13 plus its Dexterity modifier for eight hours.'),
  S(1, 'evocation', 'Magic Missile', 'Three glowing darts each strike for 1d4+1 force damage. They never miss.'),
  S(1, 'abjuration', 'Shield', 'As a reaction you gain +5 to armor class until your next turn, and Magic Missile cannot hurt you.'),
  S(1, 'enchantment', 'Sleep', 'Creatures within 20 feet of a point fall asleep, weakest first, up to 5d8 hit points’ worth.'),
  S(1, 'evocation', 'Thunderwave', 'A wave of force deals 2d8 thunder damage in a 15-foot cube and pushes creatures 10 feet back.'),

  S(2, 'abjuration', 'Aid', 'Three creatures each gain 5 maximum and current hit points for eight hours.'),
  S(2, 'illusion', 'Blur', 'Your outline wavers. Attacks against you have disadvantage for a minute.'),
  S(2, 'evocation', 'Darkness', 'Magical darkness fills a 15-foot sphere. Darkvision cannot see through it.'),
  S(2, 'divination', 'Detect Thoughts', 'You read the surface thoughts of creatures within 30 feet, and can probe deeper on a failed Wisdom save.'),
  S(2, 'conjuration', 'Flaming Sphere', 'A 5-foot ball of fire rolls where you send it, burning what it rams for 2d6 fire damage.'),
  S(2, 'enchantment', 'Hold Person', 'A humanoid that fails a Wisdom save is paralyzed. It repeats the save at the end of each of its turns.'),
  S(2, 'illusion', 'Invisibility', 'A creature you touch cannot be seen for an hour, or until it attacks or casts a spell.'),
  S(2, 'transmutation', 'Knock', 'One lock, bar or stuck door opens, with a knock heard up to 300 feet away.'),
  S(2, 'abjuration', 'Lesser Restoration', 'Ends one disease, or one condition: blinded, deafened, paralyzed or poisoned.'),
  S(2, 'transmutation', 'Levitate', 'A creature or object rises up to 20 feet and hangs in the air for ten minutes.'),
  S(2, 'illusion', 'Mirror Image', 'Three copies of you shift about your space and draw attacks that were meant for you.'),
  S(2, 'conjuration', 'Misty Step', 'A bonus action teleports you up to 30 feet to a spot you can see.'),
  S(2, 'evocation', 'Scorching Ray', 'Three rays of fire, each a separate attack for 2d6 fire damage.'),
  S(2, 'evocation', 'Shatter', 'A painful ringing deals 3d8 thunder damage in a 10-foot sphere. Stone and crystal take it worst.'),
  S(2, 'evocation', 'Spiritual Weapon', 'A floating weapon of force strikes for 1d8 plus your modifier, and again each turn as a bonus action.'),
  S(2, 'conjuration', 'Web', 'Sticky webs fill a 20-foot cube and restrain creatures that fail a Dexterity save. The webs burn.'),

  S(3, 'abjuration', 'Counterspell', 'A reaction that stops a spell as it is cast. Stronger spells call for an ability check.'),
  S(3, 'abjuration', 'Dispel Magic', 'Ends spells of 3rd level or lower on a target. Stronger ones call for an ability check.'),
  S(3, 'illusion', 'Fear', 'Creatures in a 30-foot cone that fail a Wisdom save drop what they hold and run from you.'),
  S(3, 'evocation', 'Fireball', 'A bead of fire bursts into a 20-foot sphere for 8d6 fire damage, half on a successful Dexterity save.'),
  S(3, 'transmutation', 'Fly', 'A creature you touch gains a flying speed of 60 feet for ten minutes.'),
  S(3, 'transmutation', 'Haste', 'A creature’s speed doubles, and it gains +2 to armor class and one extra action each turn, for a minute.'),
  S(3, 'evocation', 'Lightning Bolt', 'A line of lightning 100 feet long deals 8d6 lightning damage, half on a successful Dexterity save.'),
  S(3, 'illusion', 'Major Image', 'An illusion as large as a 20-foot cube, complete with sound, smell and warmth.'),
  S(3, 'abjuration', 'Protection from Energy', 'A creature gains resistance to acid, cold, fire, lightning or thunder for an hour.'),
  S(3, 'necromancy', 'Revivify', 'Returns a creature that died within the last minute to life with 1 hit point. Needs a 300 gp diamond.'),
  S(3, 'transmutation', 'Slow', 'Up to six creatures that fail a Wisdom save move at half speed and can do far less on each turn.'),
  S(3, 'necromancy', 'Speak with Dead', 'A corpse answers five questions with what it knew in life. It is under no duty to be helpful.'),
  S(3, 'conjuration', 'Spirit Guardians', 'Spirits circle you out to 15 feet, slowing enemies and dealing 3d8 damage to those who come near.'),
  S(3, 'transmutation', 'Water Breathing', 'Up to ten creatures can breathe underwater for a day.'),

  S(4, 'abjuration', 'Banishment', 'A creature that fails a Charisma save is sent to another plane for up to a minute.'),
  S(4, 'necromancy', 'Blight', 'Drains the moisture from a creature for 8d8 necrotic damage. Plants take it worst.'),
  S(4, 'enchantment', 'Confusion', 'Creatures in a 10-foot sphere that fail a Wisdom save act at random on their turns.'),
  S(4, 'conjuration', 'Dimension Door', 'You and one companion teleport up to 500 feet, even to a place you cannot see.'),
  S(4, 'abjuration', 'Freedom of Movement', 'For an hour a creature ignores difficult terrain and cannot be paralyzed, restrained or slowed by magic.'),
  S(4, 'illusion', 'Greater Invisibility', 'A creature is invisible for a minute, even while it attacks and casts spells.'),
  S(4, 'evocation', 'Ice Storm', 'Hail hammers a 20-foot cylinder for 2d8 bludgeoning and 4d6 cold damage and leaves the ground treacherous.'),
  S(4, 'transmutation', 'Polymorph', 'Turns a creature into a beast of your choosing for up to an hour.'),
  S(4, 'abjuration', 'Stoneskin', 'A creature’s skin turns hard as rock: resistance to nonmagical weapon damage for an hour.'),
  S(4, 'evocation', 'Wall of Fire', 'A wall of flame up to 60 feet long deals 5d8 fire damage to creatures in it or close to one side.'),

  S(5, 'conjuration', 'Cloudkill', 'A 20-foot sphere of poison fog drifts away from you, dealing 5d8 poison damage each turn.'),
  S(5, 'evocation', 'Cone of Cold', 'A 60-foot cone of freezing air deals 8d8 cold damage, half on a successful Constitution save.'),
  S(5, 'enchantment', 'Dominate Person', 'A humanoid that fails a Wisdom save obeys your commands for up to a minute.'),
  S(5, 'abjuration', 'Greater Restoration', 'Ends a charm, a petrification or a curse, or restores a drained ability score or hit point maximum.'),
  S(5, 'enchantment', 'Hold Monster', 'Paralyzes any creature that fails a Wisdom save, not only humanoids.'),
  S(5, 'necromancy', 'Raise Dead', 'Returns a creature dead for no more than ten days to life. Needs a 500 gp diamond.'),
  S(5, 'divination', 'Scrying', 'You watch and listen to a creature on the same plane for up to ten minutes.'),
  S(5, 'transmutation', 'Telekinesis', 'You move a creature or an object of up to 1,000 pounds with your mind.'),
  S(5, 'evocation', 'Wall of Stone', 'Raises a solid stone wall of ten panels, each 10 feet square, that can become permanent.'),

  S(6, 'evocation', 'Chain Lightning', 'A bolt strikes one target for 10d8 lightning damage, then leaps to three more.'),
  S(6, 'transmutation', 'Disintegrate', 'A green ray deals 10d6+40 force damage. A creature reduced to 0 hit points is turned to dust.'),
  S(6, 'abjuration', 'Globe of Invulnerability', 'A 10-foot barrier around you that spells of 5th level or lower cannot pass.'),
  S(6, 'evocation', 'Heal', 'Restores 70 hit points and ends blindness, deafness and disease.'),
  S(6, 'enchantment', 'Mass Suggestion', 'Up to twelve creatures follow a reasonable-sounding course of action for a day.'),
  S(6, 'divination', 'True Seeing', 'A creature sees through darkness, illusion and invisibility, and into the Ethereal Plane, for an hour.'),

  S(7, 'necromancy', 'Finger of Death', 'Deals 7d8+30 necrotic damage. A humanoid it kills rises as a zombie under your command.'),
  S(7, 'conjuration', 'Plane Shift', 'Carries you and up to eight others to another plane, or banishes an unwilling creature there.'),
  S(7, 'necromancy', 'Resurrection', 'Returns a creature dead for up to a century to life with all its hit points. Needs a 1,000 gp diamond.'),
  S(7, 'conjuration', 'Teleport', 'Carries you and up to eight others to a place you know on the same plane, with some risk of arriving off target.'),

  S(8, 'enchantment', 'Dominate Monster', 'Any creature that fails a Wisdom save obeys your commands for up to an hour.'),
  S(8, 'evocation', 'Earthquake', 'The ground shakes in a 100-foot circle, opening fissures and bringing buildings down.'),
  S(8, 'enchantment', 'Power Word Stun', 'A creature with 150 hit points or fewer is stunned. It gets no saving throw at first.'),
  S(8, 'evocation', 'Sunburst', 'Blinding sunlight fills a 60-foot sphere for 12d6 radiant damage and blinds those who fail a Constitution save.'),

  S(9, 'evocation', 'Meteor Swarm', 'Four blazing meteors strike points within a mile for 20d6 fire and 20d6 bludgeoning damage each.'),
  S(9, 'transmutation', 'Time Stop', 'Time halts for everyone but you for 1d4+1 turns.'),
  S(9, 'conjuration', 'Wish', 'The mightiest spell a mortal can cast. It copies any spell of 8th level or lower, or reshapes reality at great risk.'),
];
