// The Food & Drink chapter of the compendium: what a market stall, a camp
// cook or a tavern has to offer. The everyday staples keep the D&D 5e PHB's
// food, drink and lodging prices (a loaf of bread, a mug of ale, a banquet);
// the rest is this app's own tavern fare. Same shape as items.js, less the
// weight, with one more field on a dish:
//   recipe: [{ name, qty }]
// Every name in a recipe is an entry of FOOD_INGREDIENTS below or another
// dish of this chapter (hot spiced cider starts from a mug of cider), so a
// hero who carries them all can have it made by a Food Salesman
// (merchants.js's sheetAfterMaking). A few things are sold as they grow and
// have no recipe: an apple, a cup of milk, a jar of honey.

import { INGREDIENT_CATEGORY } from './potions.js';

export const FOOD_CATEGORIES = ['food', 'drink'];

// cost is in gold pieces (gp): 0.01 is one copper, 0.1 one silver.
// `parts` is the recipe, written [qty, 'Ingredient name'].
const F = (category, name, cost, description, parts = []) => ({
  category,
  name,
  cost,
  description,
  recipe: parts.map(([qty, ingredient]) => ({ name: ingredient, qty })),
});
const I = (name, cost, description) => ({ category: INGREDIENT_CATEGORY, name, cost, description });

export const FOODS = [
  F('food', 'Apple', 0.01, 'Crisp, a little sour, and gone in four bites.'),
  F('food', 'Banquet (per person)', 10, 'Many courses, served at a long table with more forks than anyone needs.', [[1, 'Venison'], [1, 'Plucked chicken'], [2, 'Root vegetables'], [1, 'Wild berries'], [1, 'Southern spices']]),
  F('food', 'Berry tart', 0.2, 'A hand-sized tart of whatever berries were ripe this week.', [[1, 'Flour'], [1, 'Lard'], [2, 'Wild berries'], [1, 'Sugar']]),
  F('food', 'Boiled eggs (three)', 0.05, 'Hard-boiled and still in the shell, so they travel well.', [[3, 'Egg'], [1, 'Well water']]),
  F('food', 'Bowl of stew', 0.1, 'Root vegetables and a little meat, kept simmering since morning.', [[1, 'Raw beef'], [2, 'Root vegetables'], [1, 'Onion']]),
  F('food', 'Bread, loaf', 0.02, 'A round brown loaf with a thick crust.', [[1, 'Flour'], [1, 'Yeast']]),
  F('food', 'Butter (crock)', 0.3, 'Salted butter in a stoneware crock sealed with wax.', [[3, 'Cream'], [1, 'Salt']]),
  F('food', 'Cheese, hunk', 0.1, 'A wedge of hard yellow cheese wrapped in cloth.', [[2, 'Cream'], [1, 'Rennet'], [1, 'Salt']]),
  F('food', 'Cheese, wheel', 2, 'A whole waxed wheel, enough to feed a party for a week.', [[12, 'Cream'], [2, 'Rennet'], [2, 'Salt']]),
  F('food', 'Dried fruit (pouch)', 0.2, 'Apricots, figs and raisins. Sweet, light and slow to spoil.', [[3, 'Orchard fruit']]),
  F('food', 'Dumplings', 0.1, 'Six steamed dumplings filled with cabbage and pork.', [[1, 'Flour'], [1, 'Cabbage'], [1, 'Raw pork']]),
  F('food', 'Dwarven stone bread', 0.5, 'Dense as a brick and nearly as hard. It keeps for a year.', [[3, 'Flour'], [1, 'Oats'], [1, 'Salt']]),
  F('food', 'Elven waybread', 5, 'Thin golden wafers. One is said to carry a walker through a whole day.', [[2, 'Sunmeal'], [1, 'Spoon of honey'], [1, 'Cream']]),
  F('food', 'Fish chowder', 0.15, 'Thick with cream, potatoes and whatever the boats brought in.', [[1, 'River fish'], [1, 'Cream'], [1, 'Potato']]),
  F('food', 'Halfling seedcake', 0.3, 'A buttery cake studded with caraway, baked for second breakfast.', [[1, 'Flour'], [1, 'Egg'], [1, 'Lard'], [1, 'Caraway seed']]),
  F('food', 'Hard tack', 0.05, 'Ship’s biscuit. Soak it first if you value your teeth.', [[2, 'Flour'], [1, 'Salt']]),
  F('food', 'Honey (jar)', 1, 'Dark wildflower honey with a piece of comb left in.'),
  F('food', 'Honey cake', 0.2, 'A sticky square of spiced cake glazed with honey.', [[1, 'Flour'], [1, 'Egg'], [2, 'Spoon of honey'], [1, 'Cinnamon']]),
  F('food', 'Jerky (strip)', 0.1, 'Smoked and salted beef, tough enough to mend a boot with.', [[1, 'Raw beef'], [1, 'Salt'], [1, 'Alder wood chips']]),
  F('food', 'Meat, chunk', 0.3, 'A fist-sized cut of roast meat, sold hot off the spit.', [[2, 'Raw beef'], [1, 'Salt']]),
  F('food', 'Meat pie', 0.2, 'A hand pie with a sturdy crust and plenty of gravy.', [[1, 'Flour'], [1, 'Lard'], [1, 'Raw beef'], [1, 'Onion']]),
  F('food', 'Mushroom skewers', 0.1, 'Forest mushrooms grilled over coals with salt and thyme.', [[2, 'Forest mushrooms'], [1, 'Garden herbs'], [1, 'Salt']]),
  F('food', 'Onion soup', 0.05, 'Thin, hot and mostly onion, with a crust of bread to sink in it.', [[2, 'Onion'], [1, 'Well water']]),
  F('food', 'Pickled vegetables (jar)', 0.3, 'Cucumbers, beets and onions in sharp brine.', [[2, 'Garden vegetables'], [1, 'Vinegar'], [1, 'Salt']]),
  F('food', 'Porridge', 0.03, 'Oats boiled in water. Milk and honey cost extra.', [[1, 'Oats'], [1, 'Well water']]),
  F('food', 'Pot of beans', 0.05, 'Slow-cooked beans with a ham bone for flavour.', [[2, 'Dried beans'], [1, 'Ham bone']]),
  F('food', 'Roast boar haunch', 2, 'A whole haunch, crackling and all, meant for a table of six.', [[1, 'Boar haunch'], [1, 'Garden herbs'], [1, 'Salt']]),
  F('food', 'Roast chicken', 0.5, 'A whole bird rubbed with herbs and roasted until the skin snaps.', [[1, 'Plucked chicken'], [1, 'Garden herbs']]),
  F('food', 'Roasted nuts (pouch)', 0.1, 'Chestnuts and hazelnuts, still warm from the pan.', [[2, 'Nuts in the shell'], [1, 'Salt']]),
  F('food', 'Sack of apples', 0.2, 'Two dozen apples. Horses will follow you for them.'),
  F('food', 'Salted pork', 0.3, 'A slab of pork cured hard in salt, for long journeys.', [[2, 'Raw pork'], [2, 'Salt']]),
  F('food', 'Sausage link', 0.1, 'A fat smoked sausage, good cold or fried.', [[1, 'Raw pork'], [1, 'Garden herbs'], [1, 'Salt']]),
  F('food', 'Smoked fish', 0.15, 'A split river trout smoked over alder wood.', [[1, 'River fish'], [1, 'Alder wood chips'], [1, 'Salt']]),
  F('food', 'Spiced lamb skewer', 0.3, 'Charred lamb with a rub of pepper and cumin from the southern markets.', [[1, 'Raw lamb'], [1, 'Pepper'], [1, 'Southern spices']]),
  F('food', 'Sweet roll', 0.05, 'A soft roll with a swirl of cinnamon and a sugar crust.', [[1, 'Flour'], [1, 'Sugar'], [1, 'Cinnamon']]),
  F('food', 'Venison steak', 1, 'A thick steak with juniper sauce. The innkeeper does not say whose deer it was.', [[1, 'Venison'], [1, 'Juniper berries']]),

  F('drink', 'Ale, gallon', 0.2, 'A full gallon of the house ale in a stoppered jug.', [[4, 'Malted barley'], [1, 'Hops'], [1, 'Yeast'], [4, 'Well water']]),
  F('drink', 'Ale, mug', 0.04, 'A mug of brown ale. Serviceable.', [[1, 'Malted barley'], [1, 'Hops'], [1, 'Well water']]),
  F('drink', 'Black tea', 0.1, 'Strong leaf tea from across the sea, served scalding.', [[1, 'Tea leaves'], [1, 'Well water']]),
  F('drink', 'Buttermilk', 0.02, 'Cool, tart and thick, straight from the churn.', [[1, 'Cream']]),
  F('drink', 'Cider, mug', 0.05, 'Cloudy apple cider with a sharp finish.', [[3, 'Apple'], [1, 'Yeast']]),
  F('drink', 'Coffee, cup', 0.2, 'Bitter black coffee. A luxury this far from the spice ports.', [[1, 'Coffee beans'], [1, 'Well water']]),
  F('drink', 'Dwarven firebrew', 1, 'A small cup of clear spirit that burns the whole way down.', [[2, 'Malted barley'], [1, 'Pepper'], [1, 'Well water']]),
  F('drink', 'Elven moonwine (bottle)', 15, 'Pale wine pressed from night-blooming grapes. It glows faintly in the dark.', [[3, 'Moonlit grapes'], [1, 'Spoon of honey']]),
  F('drink', 'Fruit cordial', 0.2, 'Sweet berry syrup stirred into cold water.', [[2, 'Wild berries'], [1, 'Sugar'], [1, 'Well water']]),
  F('drink', 'Goblin grog', 0.05, 'Nobody asks what it is made of. It is cheap, and it works.', [[2, 'Kitchen scraps'], [1, 'Well water']]),
  F('drink', 'Halfling pear brandy (bottle)', 3, 'Smooth golden brandy with a whole pear grown inside the bottle.', [[6, 'Pear'], [1, 'Sugar'], [1, 'Yeast']]),
  F('drink', 'Herbal tea', 0.03, 'Mint and chamomile, said to settle the stomach after goblin grog.', [[1, 'Mint leaves'], [1, 'Chamomile'], [1, 'Well water']]),
  F('drink', 'Honeyed milk', 0.05, 'Warm milk with a spoon of honey, the tavern’s cure for a long day.', [[1, 'Milk'], [1, 'Spoon of honey']]),
  F('drink', 'Hot spiced cider', 0.06, 'Cider heated with cloves and a poker from the fire.', [[1, 'Cider, mug'], [1, 'Cloves']]),
  F('drink', 'Mead, mug', 0.1, 'Sweet honey wine, stronger than it tastes.', [[3, 'Spoon of honey'], [1, 'Yeast'], [1, 'Well water']]),
  F('drink', 'Milk', 0.02, 'A cup of fresh milk, still warm from the cow.'),
  F('drink', 'Rum (bottle)', 2, 'Dark sailor’s rum that smells of molasses and tar.', [[4, 'Molasses'], [1, 'Yeast'], [2, 'Well water']]),
  F('drink', 'Sailor’s grog', 0.05, 'Rum cut with water and a squeeze of lime to keep the scurvy off.', [[1, 'Molasses'], [1, 'Lime'], [1, 'Well water']]),
  F('drink', 'Small beer', 0.02, 'Weak beer, safer than the well water and drunk at every meal.', [[1, 'Malted barley'], [1, 'Well water']]),
  F('drink', 'Stout, mug', 0.06, 'Black, bitter and thick enough to count as supper.', [[2, 'Malted barley'], [1, 'Hops'], [1, 'Well water']]),
  F('drink', 'Water (clean, one skin)', 0.01, 'Boiled and strained. Worth the copper in a town with a bad well.', [[1, 'Well water']]),
  F('drink', 'Whiskey (bottle)', 3, 'Peat-smoked whiskey aged ten years in oak.', [[5, 'Malted barley'], [1, 'Peat'], [2, 'Well water']]),
  F('drink', 'Wine, common (pitcher)', 0.2, 'A pitcher of rough red table wine.', [[4, 'Grapes'], [1, 'Yeast']]),
  F('drink', 'Wine, fine (bottle)', 10, 'A good vintage from a named vineyard, sealed with the grower’s mark.', [[8, 'Grapes'], [1, 'Sugar'], [1, 'Yeast']]),
];

// What the dishes above are made from: the larder. Found in a chest, handed
// out by the DM or sold by a Wandering Salesman; a Food Salesman sells none
// of it.
export const FOOD_INGREDIENTS = [
  // The pantry.
  I('Flour', 0.01, 'A scoop of coarse brown flour.'),
  I('Oats', 0.01, 'Rolled oats, by the handful.'),
  I('Sunmeal', 1, 'Fine golden meal the elves grind from a grain that ripens in a single day.'),
  I('Malted barley', 0.01, 'Barley sprouted and dried, the start of every beer.'),
  I('Hops', 0.02, 'Papery green cones that make ale bitter and keep it from turning.'),
  I('Yeast', 0.01, 'A spoon of grey froth from the last batch.'),
  I('Salt', 0.01, 'A pinch of grey sea salt.'),
  I('Sugar', 0.02, 'A lump of brown sugar.'),
  I('Molasses', 0.02, 'Black syrup, thick as tar.'),
  I('Spoon of honey', 0.02, 'One spoonful, scraped from the jar.'),
  I('Vinegar', 0.02, 'Sharp enough to make the eyes water.'),
  I('Lard', 0.02, 'Rendered pork fat for pastry and frying.'),
  I('Dried beans', 0.01, 'Hard brown beans that want a night of soaking.'),
  I('Tea leaves', 0.05, 'Black leaf from across the sea, rolled tight.'),
  I('Coffee beans', 0.1, 'Roasted dark and ground between two stones.'),
  I('Well water', 0.01, 'A bucket from the well. Boil it first.'),

  // The dairy and the henhouse.
  I('Egg', 0.01, 'Brown, and still warm.'),
  I('Cream', 0.02, 'Skimmed from the top of the morning’s milk.'),
  I('Rennet', 0.02, 'What turns milk into curd. Best not to ask where it comes from.'),

  // The garden, the orchard and the hedgerow.
  I('Onion', 0.01, 'A yellow onion with its skin on.'),
  I('Potato', 0.01, 'Knobbly, with earth still on it.'),
  I('Cabbage', 0.01, 'A tight green head.'),
  I('Root vegetables', 0.02, 'Carrots, turnips and parsnips, by the bunch.'),
  I('Garden vegetables', 0.02, 'Cucumbers, beets and small onions.'),
  I('Garden herbs', 0.01, 'Thyme, sage and parsley tied with string.'),
  I('Mint leaves', 0.01, 'A sprig of fresh mint.'),
  I('Chamomile', 0.01, 'Small dried flowers that smell of apples.'),
  I('Forest mushrooms', 0.03, 'Brown caps picked by someone who knows which ones are safe.'),
  I('Wild berries', 0.03, 'A cupful of whatever the hedgerow had.'),
  I('Orchard fruit', 0.03, 'Apricots, figs and plums, a little bruised.'),
  I('Pear', 0.02, 'A hard green pear.'),
  I('Grapes', 0.03, 'A bunch of small dark grapes.'),
  I('Moonlit grapes', 3, 'Pale grapes from a vine that flowers at night. They glow a little.'),
  I('Lime', 0.02, 'Small, green and sour.'),
  I('Nuts in the shell', 0.03, 'Chestnuts and hazelnuts, by the handful.'),
  I('Juniper berries', 0.05, 'Blue-black berries with the smell of pine.'),

  // The spice box.
  I('Pepper', 0.02, 'A few black peppercorns.'),
  I('Cinnamon', 0.02, 'A curl of bark from the southern markets.'),
  I('Cloves', 0.01, 'Two dried buds, sharp and sweet.'),
  I('Caraway seed', 0.02, 'A pinch of small curved seeds.'),
  I('Southern spices', 0.05, 'Cumin, coriander and something red, in a twist of paper.'),

  // The butcher, the river and the fire.
  I('Raw beef', 0.05, 'A cut of beef, not the best one.'),
  I('Raw pork', 0.05, 'A cut of pork with the fat left on.'),
  I('Raw lamb', 0.08, 'Shoulder of lamb, cut small.'),
  I('Plucked chicken', 0.2, 'A whole bird, ready for the spit.'),
  I('Venison', 0.5, 'A dark red cut from the haunch.'),
  I('Boar haunch', 1, 'A whole hind leg, bristles singed off.'),
  I('Ham bone', 0.01, 'Picked nearly clean, with plenty of flavour left.'),
  I('River fish', 0.05, 'A trout, gutted this morning.'),
  I('Kitchen scraps', 0.01, 'Peelings, crusts and things best left unnamed.'),
  I('Alder wood chips', 0.01, 'A handful, for smoking meat and fish.'),
  I('Peat', 0.01, 'A dried brick of bog earth that burns slow and smoky.'),
];
