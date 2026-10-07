// The Tomes chapter of the compendium: one hundred books a party might find
// on a shelf, ten to a category. Every title, author and line of description
// is made up for this app. Mirrors items.js: a category list plus a flat
// array of plain objects. A DM's own tomes (Toolbar.jsx's Asset Storage) use
// the same shape, with `description` holding as much story or lore as they
// care to write (TOME_TEXT_MAX).

export const TOME_CATEGORIES = ['history', 'arcana', 'bestiary', 'religion', 'tales', 'travel', 'craft', 'nature', 'law', 'songs'];

// The longest a DM's own tome may run.
export const TOME_TEXT_MAX = 4000;

// cost is in gold pieces (gp), like every other compendium entry.
const T = (category, name, author, cost, description) => ({ category, name, author, cost, description });

export const TOMES = [
  T('history', 'The Fall of the Nine Crowns', 'Ansel Corbray', 25, 'How nine quarrelling kingdoms lost a war that none of them remembers starting.'),
  T('history', 'A Short Reckoning of the Long Winter', 'Brother Odo of Farrowmere', 15, 'A monk’s year-by-year tally of the forty-year frost and the villages that outlasted it.'),
  T('history', 'Chronicle of the Salt Road', 'Mirelle Ashdown', 20, 'The rise of the caravan towns, told through the ledgers of the families who taxed them.'),
  T('history', 'The Siege of Hollowgate', 'Captain Jory Fenn', 30, 'An eyewitness account of two hundred days behind a wall that was never breached and never relieved.'),
  T('history', 'Kings Who Were Not', 'Tobiah Wend', 18, 'The lives of twelve pretenders, most of whom came closer to the throne than the court likes to admit.'),
  T('history', 'The Ledger of Lost Cities', 'Ysolde Marrin', 40, 'Thirty cities that no longer stand, with what is known of where they stood and why they fell.'),
  T('history', 'Before the Lanterns', 'Unknown', 35, 'A fragmentary history of the age before written records, pieced together from tomb walls.'),
  T('history', 'The Stonewright Dynasties', 'Durgan Brasshelm', 28, 'Seven generations of dwarven builders and the halls, bridges and feuds they left behind.'),
  T('history', 'Treaties and Their Breaking', 'Lady Perrin Vale', 22, 'Every great peace of the last three centuries, and the small clause that undid each one.'),
  T('history', 'Annals of the River Lords', 'Old Hask the Ferryman', 12, 'Gossip, mostly, but gossip about every family that ever held a toll bridge.'),

  T('arcana', 'Principles of the Unseen Thread', 'Magister Elowen Tarn', 75, 'The standard first-year text on how magic binds one thing to another.'),
  T('arcana', 'On the Folding of Distance', 'Corvin Halloway', 120, 'A dense treatise on stepping from here to there without crossing the ground between.'),
  T('arcana', 'A Beginner’s Grammar of Sigils', 'Pella Quist', 30, 'Forty common marks, how to draw them, and what happens when a line is left open.'),
  T('arcana', 'The Candle and the Void', 'Archmage Sered Nox', 150, 'Lectures on the cost of power. The last chapter was torn out before the book was copied.'),
  T('arcana', 'Seventeen Stable Circles', 'Ibram Kell', 60, 'Working diagrams for summoning circles that have been tested, with notes on the ones that failed.'),
  T('arcana', 'Errors of the Apprentice', 'Mistress Hobb', 20, 'A cheerful catalog of the ways students have set themselves on fire, with advice.'),
  T('arcana', 'The Weight of Names', 'Thessaly Dunmore', 90, 'Why a true name gives a hold over its owner, and how the careful keep theirs hidden.'),
  T('arcana', 'Wards for the Practical Household', 'Goodwife Anneke Brill', 25, 'Simple protections for doors, cellars and cradles, written for people with no training at all.'),
  T('arcana', 'Notes Toward a Theory of Echoes', 'Fenwick Arlo', 80, 'An unfinished argument that every spell leaves a trace that can be read later.'),
  T('arcana', 'The Quiet Schools', 'Unknown', 110, 'A survey of the magical traditions that never founded an academy, and why they preferred it so.'),

  T('bestiary', 'Things That Live Under Bridges', 'Rook Aldermoor', 22, 'Trolls, toll-goblins and worse, sorted by how much each one charges.'),
  T('bestiary', 'A Field Guide to Fanged Beasts', 'Hunter Maud Kessler', 28, 'Tracks, lairs and bite marks, drawn from life by a woman with most of her fingers.'),
  T('bestiary', 'The Dragon’s Year', 'Sir Edric Vantongue', 65, 'The habits of a dragon season by season: when it hunts, when it sleeps, and when to be elsewhere.'),
  T('bestiary', 'Slimes, Oozes and Other Regrets', 'Dol Pettigrew', 18, 'What dissolves in which jelly, learned one pair of boots at a time.'),
  T('bestiary', 'On the Restless Dead', 'Sister Calla Wren', 45, 'How to tell a ghoul from a wight in poor light, and what each one fears.'),
  T('bestiary', 'Spiders of Unusual Ambition', 'Nim Larkspur', 20, 'A study of web-spinners larger than a horse and the forests they have taken over.'),
  T('bestiary', 'The Goblin Tribes of the Low Hills', 'Aldous Finch', 24, 'Customs, banners and grudges of eleven goblin tribes, by a man who traded with all of them.'),
  T('bestiary', 'What the Wolf Knows', 'Ranger Teague Morrow', 16, 'A season spent following one pack through the snow, written with real affection.'),
  T('bestiary', 'Giants: A Measured Account', 'Ottoline Graves', 38, 'Heights, appetites and tempers of the giant kinds, measured from a sensible distance.'),
  T('bestiary', 'Mimics and How I Lost My Hand', 'One-Handed Bram', 12, 'Part warning, part memoir. The advice comes down to this: poke the chest with a stick first.'),

  T('religion', 'The Hearth Litany', 'The Order of the Kept Flame', 10, 'Evening prayers for a household, meant to be read aloud while the fire is banked.'),
  T('religion', 'Sayings of the Wandering Saint', 'Collected by Brother Lume', 14, 'Three hundred short sayings, some wise, some plainly said at the end of a long day.'),
  T('religion', 'The Book of Small Mercies', 'Abbess Greta Hollin', 12, 'A guide to the quiet duties of a healer: clean water, warm blankets, an honest word.'),
  T('religion', 'Rites for the Road and the Grave', 'Father Oswin Pike', 20, 'Blessings for travellers and burials for strangers, sized to fit a coat pocket.'),
  T('religion', 'The Nine Vigils', 'Unknown', 30, 'Nine nights of watching, each with its own prayer. Few readers report finishing the ninth.'),
  T('religion', 'Heresies Worth Knowing', 'Deacon Marrow', 55, 'An even-handed account of the beliefs the temples would rather forget. Banned in three cities.'),
  T('religion', 'A Pilgrim’s Calendar', 'Sister Avis Thorn', 8, 'Feast days, fast days and the shrines that keep them, laid out month by month.'),
  T('religion', 'Dialogues with a Doubting Knight', 'Prior Alaric Senn', 22, 'A paladin loses his faith on campaign and argues his way back to it over twelve evenings.'),
  T('religion', 'The Drowned God’s Psalter', 'Unknown', 70, 'Hymns copied from a chapel found below the tide line. The ink runs when the weather turns.'),
  T('religion', 'On Oaths', 'Justicar Helene Dray', 26, 'What a sworn word binds, what breaks it, and what is owed afterward.'),

  T('tales', 'The Fox Who Sold the Moon', 'Traditional', 5, 'A trickster fox sells the same moon to three kings and is caught by a fourth.'),
  T('tales', 'Ballad of the Brass Knight', 'Lorrie Quickfinger', 8, 'A hollow suit of armour keeps a promise its maker has long forgotten.'),
  T('tales', 'The Lantern-Maker’s Daughter', 'Imogen Sable', 9, 'A girl builds a lantern bright enough to light the road to the land of the dead.'),
  T('tales', 'Three Wishes and a Mule', 'Old Mother Tansy', 4, 'A farmer wastes two wishes, and the mule makes better use of the third.'),
  T('tales', 'The Thief of Seven Bells', 'Jasper Nightwell', 10, 'One night, seven towers and a burglar who steals only the sound from each bell.'),
  T('tales', 'Tales Told at the Crooked Mug', 'Various', 6, 'Twenty tavern stories, written down exactly as told, contradictions and all.'),
  T('tales', 'The Princess in the Iron Orchard', 'Wilhelmina Frost', 12, 'A princess tends an orchard of metal trees and waits for one of them to bear fruit.'),
  T('tales', 'A Giant’s Supper', 'Barnaby Tuck', 5, 'A cook talks his way out of the pot, one course at a time.'),
  T('tales', 'The Last Ferry to Gloam', 'Enna Varrow', 11, 'A ferryman takes on a passenger who pays in coins nobody has minted for a century.'),
  T('tales', 'The Knight Who Could Not Lie', 'Attributed to Sir Pell', 9, 'A curse of honesty ruins a tournament, a wedding and, in the end, a war.'),

  T('travel', 'Roads I Would Not Take Again', 'Hobart Lyle', 15, 'A pedlar’s frank opinions on forty highways, their bandits and their mud.'),
  T('travel', 'The Coast in Forty Harbours', 'Captain Sunniva Reed', 32, 'Soundings, tides and harbourmasters from the northern ice to the spice ports.'),
  T('travel', 'A Walker’s Guide to the High Passes', 'Gerta Stonefoot', 20, 'Which passes open in which month, and where to shelter when the weather closes them.'),
  T('travel', 'Inns of the Middle Road, Rated', 'Pip Underbough', 7, 'Sixty inns scored out of five pies. Only two inns earn all five.'),
  T('travel', 'Among the Marsh Folk', 'Lucan Drey', 18, 'A year spent in the stilt villages, learning to pole a boat and mind one’s manners.'),
  T('travel', 'The Desert Keeps Its Own Time', 'Zahra Elmesh', 28, 'Wells, winds and caravan law, by a guide who has crossed the sands thirty times.'),
  T('travel', 'Maps That Lie', 'Cartographer Odell Finn', 45, 'A collection of famous wrong maps and the expeditions that trusted them.'),
  T('travel', 'Under the Mountain and Back', 'Borin Deepdelve', 35, 'Nine days through an abandoned dwarf road, with a careful list of what still lives there.'),
  T('travel', 'Forty Days Downriver', 'Tamsin Oar', 14, 'A barge journey from the hill springs to the sea, with every lock-keeper’s name.'),
  T('travel', 'The Island That Moves', 'Navigator Quill Harrow', 50, 'Sightings, bearings and theories about an island that is never where it was last charted.'),

  T('craft', 'The Honest Smith', 'Hilde Emberhand', 24, 'Forge work from nails to sword blades, with no secrets held back.'),
  T('craft', 'Brewing for the Impatient', 'Tolly Barrelman', 10, 'Ale in a week, cider in a fortnight, and the mistakes that turn either to vinegar.'),
  T('craft', 'On Locks and Those Who Love Them', 'A Friend', 40, 'How locks are made. Readers tend to buy it to learn how they are unmade.'),
  T('craft', 'The Herbwife’s Almanac', 'Marta Greenlow', 16, 'What to gather, when to gather it, and how to keep it through the winter.'),
  T('craft', 'Knots, Hitches and Bad Ideas', 'Bosun Kerrigan', 8, 'Fifty knots with drawings, and a short chapter on the three a sailor must never trust.'),
  T('craft', 'A Mason’s Hundred Rules', 'Guildmaster Orrin Slate', 22, 'One hundred rules for building in stone. The first one is to check the ground.'),
  T('craft', 'Poisons, Politely', 'Dame Vesper Lin', 85, 'A courtier’s reference to toxins, their signs and their antidotes, written as etiquette.'),
  T('craft', 'The Fletcher’s Eye', 'Aric Trueflight', 18, 'Choosing shafts, cutting feathers and tuning a bow to the archer who draws it.'),
  T('craft', 'Stitches That Hold', 'Seamstress Nan Ollery', 9, 'Mending for cloth, leather and, in one frank chapter, people.'),
  T('craft', 'Cooking over Open Flame', 'Dunstan Potts', 6, 'Camp recipes for whatever the party managed to catch, however badly it was butchered.'),

  T('nature', 'Mushrooms: The Ones That Won’t Kill You', 'Fenna Mosscap', 14, 'A short book. The companion volume on the other kind is much longer.'),
  T('nature', 'Weather Signs of the Northern Sky', 'Shepherd Alder Voss', 9, 'Clouds, winds and the behaviour of sheep as a guide to tomorrow’s weather.'),
  T('nature', 'The Deepwood Trees', 'Druid Rowan Ashby', 30, 'Forty trees of the old forest, including three that should not be slept beneath.'),
  T('nature', 'Tides, Moons and Other Certainties', 'Marla Seaborne', 20, 'Tide tables for the whole western coast, with the reasoning shown.'),
  T('nature', 'Birds of Omen', 'Corwin Jay', 17, 'Which birds the old folk read for signs, and what the birds are really doing.'),
  T('nature', 'Stars for Travellers', 'Astronomer Lysa Venn', 26, 'Finding north, the hour and the season from the night sky, with fold-out charts.'),
  T('nature', 'The Secret Lives of Bees', 'Brother Humble', 8, 'An abbey beekeeper’s loving notes on hives, swarms and the uses of honey.'),
  T('nature', 'Stone and Vein', 'Prospector Dag Hurley', 21, 'How to read a hillside for ore, and how to tell silver from the things that only shine.'),
  T('nature', 'A Year in the Fen', 'Wilmot Reedy', 12, 'Month by month through a marsh: its birds, its lights and its bad air.'),
  T('nature', 'What Grows in the Dark', 'Irsa Kohl', 33, 'Fungi, pale fish and blind crawling things from caves a mile below daylight.'),

  T('law', 'The Laws of the Free Cities', 'Magistrate Corin Ashe', 35, 'The common code of the trading cities, with the fines listed in a handy table.'),
  T('law', 'A Merchant’s Guide to Tolls and Tariffs', 'Bettina Coyle', 12, 'What is owed at every gate and bridge on the main roads, and which collectors can be reasoned with.'),
  T('law', 'Duels: Rules and Remedies', 'Master-at-Arms Roland Varr', 20, 'The accepted forms of a challenge, a refusal and an apology that keeps everyone alive.'),
  T('law', 'The Guild Charters, Annotated', 'Clerk Simeon Fold', 28, 'Founding documents of nine guilds, with notes on the loopholes each has since closed.'),
  T('law', 'Crimes of the Nobility', 'Anonymous', 60, 'Court records the courts would rather have burned. No printer will admit to it.'),
  T('law', 'On Salvage and Treasure', 'Advocate Mina Shore', 25, 'Who owns what you pull out of a ruin. The answer is rarely you.'),
  T('law', 'The Thieves’ Cant Primer', 'Nobody', 45, 'Marks, signs and phrases of the underworld. Owning a copy is itself a small crime.'),
  T('law', 'Borders, Marches and Disputed Ground', 'Surveyor Hale Brandt', 22, 'Where each realm says its edge lies, and the villages caught between two answers.'),
  T('law', 'Contracts with Unusual Parties', 'Notary Ezra Crane', 75, 'Drafting agreements with fey, fiends and the dead. Read every footnote.'),
  T('law', 'A Soldier’s Rights', 'Sergeant Bryn Calloway', 6, 'Pay, plunder and discharge, set out plainly for the rank and file.'),

  T('songs', 'The Drover’s Songbook', 'Collected by Kit Marlow', 6, 'Walking songs for long roads, with the verses the cattle are said to prefer.'),
  T('songs', 'Laments of the Grey Coast', 'Sorrel Dunmere', 11, 'Thirty songs for the drowned, sung by the families who wait on shore.'),
  T('songs', 'Marching Songs of the Ninth', 'Soldiers of the Ninth', 5, 'Cadences for the road. The cleaner half made it into print.'),
  T('songs', 'Verses for a Sleeping Dragon', 'Elian Starling', 40, 'Lullabies composed for a patron who slept on a hoard and paid in rubies.'),
  T('songs', 'Tavern Rounds, Clean and Otherwise', 'Bess Rattle', 4, 'Songs for a full room, graded by how late in the evening each may be sung.'),
  T('songs', 'The Weaver’s Hymnal', 'The Guild of Weavers', 8, 'Work songs timed to the loom, one beat for every pass of the shuttle.'),
  T('songs', 'Odes to an Empty Throne', 'Court Poet Ansa Vell', 30, 'Elegant praise for a ruler who is never named. The poet was exiled for it.'),
  T('songs', 'Sea Shanties of the Outer Isles', 'Old Tom Bight', 7, 'Hauling songs and capstan songs, with the island words spelled as they sound.'),
  T('songs', 'Riddles in Rhyme', 'Quillon Fey', 9, 'One hundred rhyming riddles. The answers are printed upside down at the back.'),
  T('songs', 'The Long Song of Ember and Ash', 'Unknown', 55, 'An epic that takes three nights to sing. Bards say nobody alive knows the last verse.'),
];
