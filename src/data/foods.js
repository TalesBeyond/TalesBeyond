// The Food & Drink chapter of the compendium: what a market stall, a camp
// cook or a tavern has to offer. The everyday staples keep the D&D 5e PHB's
// food, drink and lodging prices (a loaf of bread, a mug of ale, a banquet);
// the rest is this app's own tavern fare. Same shape as items.js, less the
// weight.

export const FOOD_CATEGORIES = ['food', 'drink'];

// cost is in gold pieces (gp): 0.01 is one copper, 0.1 one silver.
const F = (category, name, cost, description) => ({ category, name, cost, description });

export const FOODS = [
  F('food', 'Apple', 0.01, 'Crisp, a little sour, and gone in four bites.'),
  F('food', 'Banquet (per person)', 10, 'Many courses, served at a long table with more forks than anyone needs.'),
  F('food', 'Berry tart', 0.2, 'A hand-sized tart of whatever berries were ripe this week.'),
  F('food', 'Boiled eggs (three)', 0.05, 'Hard-boiled and still in the shell, so they travel well.'),
  F('food', 'Bowl of stew', 0.1, 'Root vegetables and a little meat, kept simmering since morning.'),
  F('food', 'Bread, loaf', 0.02, 'A round brown loaf with a thick crust.'),
  F('food', 'Butter (crock)', 0.3, 'Salted butter in a stoneware crock sealed with wax.'),
  F('food', 'Cheese, hunk', 0.1, 'A wedge of hard yellow cheese wrapped in cloth.'),
  F('food', 'Cheese, wheel', 2, 'A whole waxed wheel, enough to feed a party for a week.'),
  F('food', 'Dried fruit (pouch)', 0.2, 'Apricots, figs and raisins. Sweet, light and slow to spoil.'),
  F('food', 'Dumplings', 0.1, 'Six steamed dumplings filled with cabbage and pork.'),
  F('food', 'Dwarven stone bread', 0.5, 'Dense as a brick and nearly as hard. It keeps for a year.'),
  F('food', 'Elven waybread', 5, 'Thin golden wafers. One is said to carry a walker through a whole day.'),
  F('food', 'Fish chowder', 0.15, 'Thick with cream, potatoes and whatever the boats brought in.'),
  F('food', 'Halfling seedcake', 0.3, 'A buttery cake studded with caraway, baked for second breakfast.'),
  F('food', 'Hard tack', 0.05, 'Ship’s biscuit. Soak it first if you value your teeth.'),
  F('food', 'Honey (jar)', 1, 'Dark wildflower honey with a piece of comb left in.'),
  F('food', 'Honey cake', 0.2, 'A sticky square of spiced cake glazed with honey.'),
  F('food', 'Jerky (strip)', 0.1, 'Smoked and salted beef, tough enough to mend a boot with.'),
  F('food', 'Meat, chunk', 0.3, 'A fist-sized cut of roast meat, sold hot off the spit.'),
  F('food', 'Meat pie', 0.2, 'A hand pie with a sturdy crust and plenty of gravy.'),
  F('food', 'Mushroom skewers', 0.1, 'Forest mushrooms grilled over coals with salt and thyme.'),
  F('food', 'Onion soup', 0.05, 'Thin, hot and mostly onion, with a crust of bread to sink in it.'),
  F('food', 'Pickled vegetables (jar)', 0.3, 'Cucumbers, beets and onions in sharp brine.'),
  F('food', 'Porridge', 0.03, 'Oats boiled in water. Milk and honey cost extra.'),
  F('food', 'Pot of beans', 0.05, 'Slow-cooked beans with a ham bone for flavour.'),
  F('food', 'Roast boar haunch', 2, 'A whole haunch, crackling and all, meant for a table of six.'),
  F('food', 'Roast chicken', 0.5, 'A whole bird rubbed with herbs and roasted until the skin snaps.'),
  F('food', 'Roasted nuts (pouch)', 0.1, 'Chestnuts and hazelnuts, still warm from the pan.'),
  F('food', 'Sack of apples', 0.2, 'Two dozen apples. Horses will follow you for them.'),
  F('food', 'Salted pork', 0.3, 'A slab of pork cured hard in salt, for long journeys.'),
  F('food', 'Sausage link', 0.1, 'A fat smoked sausage, good cold or fried.'),
  F('food', 'Smoked fish', 0.15, 'A split river trout smoked over alder wood.'),
  F('food', 'Spiced lamb skewer', 0.3, 'Charred lamb with a rub of pepper and cumin from the southern markets.'),
  F('food', 'Sweet roll', 0.05, 'A soft roll with a swirl of cinnamon and a sugar crust.'),
  F('food', 'Venison steak', 1, 'A thick steak with juniper sauce. The innkeeper does not say whose deer it was.'),

  F('drink', 'Ale, gallon', 0.2, 'A full gallon of the house ale in a stoppered jug.'),
  F('drink', 'Ale, mug', 0.04, 'A mug of brown ale. Serviceable.'),
  F('drink', 'Black tea', 0.1, 'Strong leaf tea from across the sea, served scalding.'),
  F('drink', 'Buttermilk', 0.02, 'Cool, tart and thick, straight from the churn.'),
  F('drink', 'Cider, mug', 0.05, 'Cloudy apple cider with a sharp finish.'),
  F('drink', 'Coffee, cup', 0.2, 'Bitter black coffee. A luxury this far from the spice ports.'),
  F('drink', 'Dwarven firebrew', 1, 'A small cup of clear spirit that burns the whole way down.'),
  F('drink', 'Elven moonwine (bottle)', 15, 'Pale wine pressed from night-blooming grapes. It glows faintly in the dark.'),
  F('drink', 'Fruit cordial', 0.2, 'Sweet berry syrup stirred into cold water.'),
  F('drink', 'Goblin grog', 0.05, 'Nobody asks what it is made of. It is cheap, and it works.'),
  F('drink', 'Halfling pear brandy (bottle)', 3, 'Smooth golden brandy with a whole pear grown inside the bottle.'),
  F('drink', 'Herbal tea', 0.03, 'Mint and chamomile, said to settle the stomach after goblin grog.'),
  F('drink', 'Honeyed milk', 0.05, 'Warm milk with a spoon of honey, the tavern’s cure for a long day.'),
  F('drink', 'Hot spiced cider', 0.06, 'Cider heated with cloves and a poker from the fire.'),
  F('drink', 'Mead, mug', 0.1, 'Sweet honey wine, stronger than it tastes.'),
  F('drink', 'Milk', 0.02, 'A cup of fresh milk, still warm from the cow.'),
  F('drink', 'Rum (bottle)', 2, 'Dark sailor’s rum that smells of molasses and tar.'),
  F('drink', 'Sailor’s grog', 0.05, 'Rum cut with water and a squeeze of lime to keep the scurvy off.'),
  F('drink', 'Small beer', 0.02, 'Weak beer, safer than the well water and drunk at every meal.'),
  F('drink', 'Stout, mug', 0.06, 'Black, bitter and thick enough to count as supper.'),
  F('drink', 'Water (clean, one skin)', 0.01, 'Boiled and strained. Worth the copper in a town with a bad well.'),
  F('drink', 'Whiskey (bottle)', 3, 'Peat-smoked whiskey aged ten years in oak.'),
  F('drink', 'Wine, common (pitcher)', 0.2, 'A pitcher of rough red table wine.'),
  F('drink', 'Wine, fine (bottle)', 10, 'A good vintage from a named vineyard, sealed with the grower’s mark.'),
];
