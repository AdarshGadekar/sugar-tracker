// "No-sugar specials" board on the truck: tasty things with no added sugar.
// Some get their sweetness from fruit or milk; none of them need sugar, jaggery, honey or syrup.
export const SPECIALS = [
  { emoji: "🍌", name: "Banana nice-cream", why: "Frozen banana blends into soft-serve. Tastes like dessert, isn't one.",
    how: "Freeze ripe banana slices, blend with a spoon of cocoa and a splash of milk. Eat right away." },
  { emoji: "🍇", name: "Frozen grapes", why: "Little sorbet bites that crack when you bite them.",
    how: "Wash, dry and freeze grapes for 2 hours. Keep a box in the freezer for cravings." },
  { emoji: "🍿", name: "Masala makhana", why: "Crunchy, salty, and you can eat a big bowl.",
    how: "Roast makhana in a little ghee for 5 minutes, toss with salt, pepper and chaat masala." },
  { emoji: "🥛", name: "Masala chaas", why: "Cool, tangy and filling — kills the after-lunch sweet craving.",
    how: "Whisk curd with water, roasted jeera, black salt, mint and a pinch of hing." },
  { emoji: "🍠", name: "Shakarkandi chaat", why: "Roasted sweet potato is naturally sweet — no sugar needed.",
    how: "Roast or boil sweet potato, cube it, add lemon, chaat masala and a little green chutney." },
  { emoji: "🍎", name: "Apple + peanut butter", why: "Sweet, crunchy and creamy in one bite.",
    how: "Slice an apple, dip in unsweetened peanut butter, dust with cinnamon." },
  { emoji: "🥥", name: "Tender coconut malai", why: "Soft, cool and gently sweet all on its own.",
    how: "Ask the coconut wala to open it — drink the water, scoop the malai." },
  { emoji: "🍮", name: "Coconut chia pudding", why: "Thick, creamy, dessert-feeling breakfast.",
    how: "Stir 3 tbsp chia into a cup of coconut milk with vanilla, chill overnight, top with mango or berries." },
  { emoji: "🥜", name: "Masala peanuts", why: "Spicy, crunchy, perfect with chai (no sugar in the chai!).",
    how: "Dry-roast peanuts, toss with red chilli, salt and a squeeze of lemon." },
  { emoji: "🍐", name: "Guava with chilli salt", why: "Sweet, sour, spicy — the street-cart classic.",
    how: "Cut a ripe guava into wedges, sprinkle red chilli powder and rock salt." },
  { emoji: "🍉", name: "Watermelon, mint & feta", why: "Juicy and salty-sweet. Feels fancy, takes 2 minutes.",
    how: "Cube watermelon, crumble feta or paneer, tear in mint, add black pepper." },
  { emoji: "🥗", name: "Sprouts chaat", why: "Tangy, crunchy, keeps you full till dinner.",
    how: "Mix sprouts, onion, tomato, cucumber, lemon, green chilli and chaat masala." },
  { emoji: "🍋", name: "Salted nimbu soda", why: "Fizzy and sharp — scratches the cold-drink itch.",
    how: "Lemon juice, black salt, roasted jeera, mint, topped with soda water. Skip the sugar syrup." },
  { emoji: "🫘", name: "Roasted chana", why: "Crunchy and protein-packed. Great desk snack.",
    how: "Toss roasted chana with a few drops of oil, chilli powder, salt and lemon." },
  { emoji: "🍏", name: "Baked cinnamon apple", why: "Warm, soft and smells like dessert.",
    how: "Core an apple, fill with chopped walnuts and cinnamon, bake 20 min at 180°C." },
  { emoji: "🧀", name: "Paneer tikka bites", why: "Smoky, spicy, filling — a proper treat.",
    how: "Marinate paneer cubes in curd, ginger-garlic and tikka masala, grill or air-fry 10 min." },
  { emoji: "☕", name: "Elaichi coffee, no sugar", why: "Cardamom makes it taste sweeter than it is.",
    how: "Brew filter coffee with a crushed elaichi pod, add hot milk. Give it a week — you'll stop missing sugar." },
  { emoji: "🥕", name: "Carrots & hummus", why: "Sweet crunchy carrots, creamy garlicky dip.",
    how: "Blend chickpeas, tahini or sesame, lemon, garlic, salt. Dip carrot and cucumber sticks." },
  { emoji: "🫐", name: "Hung curd & berries", why: "Thick and creamy like cheesecake, without the cheesecake.",
    how: "Strain curd for an hour, top with berries or pomegranate and a pinch of cinnamon." },
  { emoji: "🥒", name: "Cucumber mint cooler", why: "Super fresh on a hot afternoon.",
    how: "Blend cucumber, mint, lemon, black salt and ice. Strain if you like it smooth." },
];

/** Same special for everyone on a given day. */
export function todaysIndex(date = new Date()) {
  const day = Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000);
  return day % SPECIALS.length;
}
