import { makeIconDataUrl } from './defaultTokens.js';
import { defaultCharacterSheet } from './characterSheet.js';

// The Monsters chapter of the compendium: twenty of the creatures a table
// meets most often, lowest challenge rating first. Stat numbers follow the
// published 5e SRD stat blocks; the descriptions are our own wording.
// `size` is the token's width in squares (Large creatures are 2x2), `attack`
// is the short action line the DM gets as a starting note on the token.

const M = (key, name, kind, cr, hp, ac, speed, abilities, size, icon, color, attack, description) => ({
  key,
  name,
  kind,
  cr,
  hp,
  ac,
  speed,
  abilities: { str: abilities[0], dex: abilities[1], con: abilities[2], int: abilities[3], wis: abilities[4], cha: abilities[5] },
  size,
  icon,
  color,
  attack,
  description,
});

export const MONSTERS = [
  M('giant-rat', 'Giant Rat', 'Small beast', '1/8', 7, 12, 30, [7, 15, 11, 2, 10, 4], 1, 'paw', '#6b5a3e', 'Bite +4, 1d4+2 piercing.', 'A dog-sized rat that thrives in sewers and cellars. It rarely fights alone; where there is one, a swarm is close behind.'),
  M('kobold', 'Kobold', 'Small humanoid', '1/8', 5, 12, 30, [7, 15, 9, 8, 7, 8], 1, 'dagger', '#8f3a20', 'Dagger +4, 1d4+2 piercing. Sling +4, 1d4+2 bludgeoning.', 'A timid, scaly trap-maker that fights best in packs and in its own lair, and lights out for the tunnels the moment a fight turns against it.'),
  M('bandit', 'Bandit', 'Medium humanoid', '1/8', 11, 12, 30, [11, 12, 12, 10, 10, 10], 1, 'dagger', '#5c5648', 'Scimitar +3, 1d6+1 slashing. Light crossbow +3, 1d8+1 piercing.', 'A road robber in leather armor who would rather threaten than fight. Bandits work in gangs and surrender when their leader falls.'),
  M('goblin', 'Goblin', 'Small humanoid', '1/4', 7, 15, 30, [8, 14, 10, 10, 8, 8], 1, 'fangs', '#45573f', 'Scimitar +4, 1d6+2 slashing. Shortbow +4, 1d6+2 piercing. Nimble Escape: Disengage or Hide as a bonus action.', 'A spiteful raider that ambushes travelers from cover and then vanishes into the brush before anyone can hit back.'),
  M('skeleton', 'Skeleton', 'Medium undead', '1/4', 13, 13, 30, [10, 14, 15, 6, 8, 5], 1, 'skull', '#5c5648', 'Shortsword +4, 1d6+2 piercing. Shortbow +4, 1d6+2 piercing. Vulnerable to bludgeoning.', 'The animated bones of a fallen warrior, bound to guard a tomb or serve a necromancer. It follows orders and feels nothing.'),
  M('zombie', 'Zombie', 'Medium undead', '1/4', 22, 8, 20, [13, 6, 16, 3, 6, 5], 1, 'skull', '#4a5d33', 'Slam +3, 1d6+1 bludgeoning. Undead Fortitude: may stay at 1 HP when reduced to 0.', 'A slow, shambling corpse driven by dark magic. It is hard to put down, and it keeps coming until it is destroyed.'),
  M('wolf', 'Wolf', 'Medium beast', '1/4', 11, 13, 40, [12, 15, 12, 3, 12, 6], 1, 'paw', '#3a3a3a', 'Bite +4, 2d4+2 piercing; DC 11 Strength save or knocked prone. Pack Tactics.', 'A cunning hunter that circles its prey in a pack and picks off the straggler at the edge of the group.'),
  M('hobgoblin', 'Hobgoblin', 'Medium humanoid', '1/2', 11, 18, 30, [13, 12, 12, 10, 10, 9], 1, 'shield', '#8f3a20', 'Longsword +3, 1d8+1 slashing. Longbow +3, 1d8+1 piercing. Martial Advantage: +2d6 once per turn.', 'A disciplined soldier from a warlike people. Hobgoblins fight in formation, shields locked, and follow their commanders without question.'),
  M('orc', 'Orc', 'Medium humanoid', '1/2', 15, 13, 30, [16, 12, 16, 7, 11, 10], 1, 'axe', '#4a5d33', 'Greataxe +5, 1d12+3 slashing. Javelin +5, 1d6+3 piercing. Aggressive: Dash as a bonus action toward an enemy.', 'A brutal raider that charges headlong into battle behind a war cry, more interested in plunder than in tactics.'),
  M('giant-spider', 'Giant Spider', 'Large beast', '1', 26, 14, 30, [14, 16, 12, 2, 11, 4], 2, 'spider', '#3a3226', 'Bite +5, 1d8+3 piercing plus 2d8 poison (DC 11 Constitution for half). Web (Recharge 5-6): restrains. Spider Climb.', 'A bloated lurker that spins webs across cave mouths and forest trails, then waits for something to blunder in.'),
  M('dire-wolf', 'Dire Wolf', 'Large beast', '1', 37, 14, 50, [17, 15, 15, 3, 12, 7], 2, 'paw', '#3a3a3a', 'Bite +5, 2d6+3 piercing; DC 13 Strength save or knocked prone. Pack Tactics.', 'A wolf grown to the size of a pony, fast enough to run down a horse and strong enough to drag a rider from the saddle.'),
  M('ghoul', 'Ghoul', 'Medium undead', '1', 22, 12, 30, [13, 15, 10, 7, 10, 6], 1, 'fangs', '#4a5d33', 'Claws +4, 2d4+2 slashing; DC 10 Constitution save or paralyzed. Bite +2, 2d6+2 piercing.', 'A ravenous corpse-eater that haunts graveyards and battlefields. Its touch can leave a hero frozen where they stand.'),
  M('bugbear', 'Bugbear', 'Medium humanoid', '1', 27, 16, 30, [15, 14, 13, 8, 11, 9], 1, 'fist', '#6b3a22', 'Morningstar +4, 2d8+2 piercing. Javelin +4, 2d6+2 piercing. Surprise Attack: +2d6 against a surprised target.', 'A hulking, hairy ambusher that moves more quietly than something its size has any right to.'),
  M('gelatinous-cube', 'Gelatinous Cube', 'Large ooze', '2', 84, 6, 15, [14, 3, 20, 1, 6, 1], 2, 'slime', '#3f7a6a', 'Pseudopod +4, 3d6 acid. Engulf: DC 12 Dexterity save or engulfed and taking 6d6 acid each turn.', 'A near-invisible block of jelly that scours dungeon corridors clean, dissolving everything it meets and carrying the bones along inside.'),
  M('ogre', 'Ogre', 'Large giant', '2', 59, 11, 40, [19, 8, 16, 5, 7, 7], 2, 'fist', '#6b5a3e', 'Greatclub +6, 2d8+4 bludgeoning. Javelin +6, 2d6+4 piercing.', 'A dim, hungry brute that swings a tree trunk for a club. It is easy to trick but very dangerous once it lands a hit.'),
  M('mimic', 'Mimic', 'Medium monstrosity', '2', 58, 12, 15, [17, 12, 15, 5, 13, 8], 1, 'chest', '#c98a3b', 'Pseudopod +5, 1d8+3 bludgeoning, sticks to the target. Bite +5, 1d8+3 piercing plus 1d8 acid. False Appearance.', 'A shapeshifter that poses as a chest, a door, or a heap of rubble, then glues itself to whoever reaches for the treasure.'),
  M('owlbear', 'Owlbear', 'Large monstrosity', '3', 59, 13, 40, [20, 12, 17, 3, 12, 7], 2, 'claw', '#6b5a3e', 'Multiattack: Beak +7, 1d10+5 piercing and Claws +7, 2d8+5 slashing. Keen Sight and Smell.', 'A bear with an owl\'s beak and a foul temper, fiercely territorial and more than willing to charge anything that wanders into its woods.'),
  M('troll', 'Troll', 'Large giant', '5', 84, 15, 30, [18, 13, 20, 7, 9, 7], 2, 'fist', '#4a5d33', 'Multiattack: Bite +7, 1d6+4 and two Claws +7, 2d6+4 slashing. Regeneration: regains 10 HP each turn unless it took fire or acid damage.', 'A tall, rubbery-skinned bruiser whose wounds close almost as fast as they open. Fire and acid are the only sure cure.'),
  M('young-green-dragon', 'Young Green Dragon', 'Large dragon', '8', 136, 18, 40, [19, 12, 17, 16, 13, 15], 2, 'wing', '#3f6a3a', 'Multiattack: Bite +7, 2d10+4 piercing plus 2d6 poison, and two Claws +7, 2d6+4. Poison Breath (Recharge 5-6): 40 ft cone, DC 14 Constitution, 12d6 poison.', 'A scheming forest dragon that lures adventurers deep into the woods with lies and flattery before it attacks.'),
  M('beholder', 'Beholder', 'Large aberration', '13', 180, 18, 20, [10, 14, 18, 17, 15, 17], 2, 'eye', '#5c3a6b', 'Bite +5, 4d6 piercing. Eye Rays: three random rays each turn (charm, paralyze, fear, slow, disintegrate, death and more). Antimagic Cone.', 'A floating sphere of teeth and eyestalks that hates every rival, its gaze deadly and its paranoia complete.'),
].map((m) => ({ ...m, imageUrl: makeIconDataUrl(m.icon, m.color) }));

// The draft addEntity (GameView.jsx) turns into a placed monster token: hit
// points, armor class, size and starting DM notes all come from the entry, and
// the ability scores and speed land on the monster's character sheet.
export function monsterToDraft(m) {
  return {
    kind: 'mob',
    name: m.name,
    imageUrl: m.imageUrl,
    color: m.color,
    maxHp: m.hp,
    armorClass: m.ac,
    size: m.size,
    mobKey: m.key,
    dmNotes: m.attack,
    mobSheet: { ...defaultCharacterSheet(), armorClass: m.ac, speed: m.speed, abilities: { ...m.abilities } },
  };
}

// A DM-authored monster from Asset Storage: the fields are looser (just a
// name, picture, color and hit points), so it gets the plain defaults.
export function customMonsterToDraft(m) {
  return { kind: 'mob', name: m.name, imageUrl: m.imageUrl, color: m.color, maxHp: m.maxHp || 15 };
}
