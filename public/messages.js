// Messages shown in the pop-up card after marking a day.

export const CLEAN = [
  { icon: "🎉", text: "Another clean day! Your future self says thanks." },
  { icon: "💪", text: "You're stronger than the cookie jar." },
  { icon: "🌱", text: "Small wins, every day. That's how habits actually change." },
  { icon: "🔥", text: "Streaks are built one day at a time — and you just added one." },
  { icon: "✨", text: "Sweet life, zero sugar. Nice work!" },
  { icon: "🏆", text: "Discipline today, energy tomorrow." },
  { icon: "😋", text: "Fun fact: taste buds renew every couple of weeks — the longer you skip sugar, the less you crave it." },
  { icon: "🥤", text: "Fun fact: a 330 ml can of cola has about 35 g of sugar — roughly 8–9 teaspoons. You skipped that today." },
  { icon: "📏", text: "Fun fact: the WHO suggests keeping free sugars under 10% of daily calories — ideally around 6 teaspoons a day." },
  { icon: "🍅", text: "Fun fact: sugar hides in savoury foods too — ketchup, bread and pasta sauces often have plenty. Check the label!" },
  { icon: "🍎", text: "Fun fact: the sugar in whole fruit comes with fibre, which slows how fast it reaches your blood." },
  { icon: "🦷", text: "Fun fact: mouth bacteria feed on sugar and make the acid that causes cavities. Your teeth thank you." },
  { icon: "🌾", text: "Fun fact: sugarcane is a giant grass that can grow more than 4 metres tall." },
  { icon: "🍯", text: "Fun fact: honey basically never spoils — edible honey has been found in ancient Egyptian tombs." },
  { icon: "🌊", text: "Tip: cravings come in waves. Wait a few minutes, drink some water, and they often pass." },
];

export const SLIP = [
  { icon: "🫶", text: "One sugar day doesn't undo your progress. Tomorrow is a fresh square." },
  { icon: "🌅", text: "Progress, not perfection. Shake it off and go again tomorrow." },
  { icon: "🧭", text: "Noted, not judged. What triggered it? Knowing helps next time." },
  { icon: "🚶", text: "Tip: a short walk after something sweet helps your body use the sugar." },
  { icon: "🥜", text: "Tip: pairing sweets with protein or fibre softens the blood-sugar spike." },
  { icon: "💧", text: "Tip: thirst often feels like a craving. Try a glass of water first next time." },
  { icon: "😴", text: "Tip: poor sleep makes sugar cravings stronger. An early night helps tomorrow's you." },
];

export const LAST_LIFE = [
  { icon: "⚠️", text: "That was your last life. From here on, no more sugar — you've got this!" },
];

export const GAME_OVER = [
  { icon: "💔", text: "Game over this round. You still tracked every day honestly — that's a real win." },
];

export const pick = (list) => list[Math.floor(Math.random() * list.length)];
