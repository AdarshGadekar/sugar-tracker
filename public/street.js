// Life around the truck: the vendor (talk to him = chat), a street dog, a crow at night,
// lit windows in the city. Our own drawings, inline SVG, placed in % of the truck picture.

const INK = "#2a1d06";
const SKIN = "#c68650";

// The vendor's head: paper food-truck hat, big moustache, blinking eyes. (cx, cy) = face centre.
function head(cx, cy, { peek = false } = {}) {
  return `
  <g class="v-head">
    <ellipse cx="${cx - 41}" cy="${cy + 2}" rx="9" ry="11" fill="${SKIN}" stroke="${INK}" stroke-width="3"/>
    <ellipse cx="${cx + 41}" cy="${cy + 2}" rx="9" ry="11" fill="${SKIN}" stroke="${INK}" stroke-width="3"/>
    <ellipse cx="${cx}" cy="${cy}" rx="40" ry="44" fill="${SKIN}" stroke="${INK}" stroke-width="3.5"/>
    <path d="M${cx - 38} ${cy - 14} q4 -18 16 -22 M${cx + 38} ${cy - 14} q-4 -18 -16 -22" fill="none" stroke="#2b1a10" stroke-width="7" stroke-linecap="round"/>
    <path d="M${cx - 42} ${cy - 22} L${cx - 32} ${cy - 66} L${cx + 32} ${cy - 66} L${cx + 42} ${cy - 22} Z" fill="#fbf7ee" stroke="${INK}" stroke-width="3.5" stroke-linejoin="round"/>
    <path d="M${cx - 40} ${cy - 30} L${cx + 40} ${cy - 30} L${cx + 42} ${cy - 22} L${cx - 42} ${cy - 22} Z" fill="#d8342c" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M${cx - 18} ${cy - 18} q8 -6 16 0 M${cx + 2} ${cy - 18} q8 -6 16 0" fill="none" stroke="#2b1a10" stroke-width="4" stroke-linecap="round"/>
    <g class="v-eyes">
      <ellipse class="v-eye" cx="${cx - 13}" cy="${cy - 4}" rx="5.5" ry="7.5" fill="${INK}"/>
      <ellipse class="v-eye" cx="${cx + 13}" cy="${cy - 4}" rx="5.5" ry="7.5" fill="${INK}"/>
      <circle cx="${cx - 11}" cy="${cy - 7}" r="1.8" fill="#fff"/><circle cx="${cx + 15}" cy="${cy - 7}" r="1.8" fill="#fff"/>
    </g>
    ${peek ? "" : `
    <path d="M${cx - 4} ${cy - 2} q-6 14 2 16" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>
    <circle cx="${cx - 24}" cy="${cy + 12}" r="6" fill="#e0715a" opacity=".5"/><circle cx="${cx + 24}" cy="${cy + 12}" r="6" fill="#e0715a" opacity=".5"/>
    <path d="M${cx - 25} ${cy + 22} q12 -12 25 -4 q13 -8 25 4 q8 5 13 -4 q-3 16 -17 12 q-12 -4 -21 -3 q-9 -1 -21 3 q-14 4 -17 -12 q5 9 13 4z" fill="#2b1a10" stroke="${INK}" stroke-width="2"/>
    <path class="v-mouth" d="M${cx - 11} ${cy + 30} q11 10 22 0" fill="#7a2418" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>`}
  </g>`;
}

/** Night: behind the counter in the serving window, upper body only. 210×245 = picture pixels. */
function vendorNight() {
  return `<svg viewBox="0 0 210 245" aria-hidden="true">
    <path d="M22 245 C24 196 52 172 105 172 C158 172 186 196 188 245 Z" fill="#1f8f84" stroke="${INK}" stroke-width="3.5"/>
    <path d="M70 182 L140 182 L144 245 L66 245 Z" fill="#fff3d6" stroke="${INK}" stroke-width="3"/>
    <path d="M78 182 L92 172 M132 182 L118 172" stroke="${INK}" stroke-width="3"/>
    <text x="105" y="226" text-anchor="middle" font-family="Yatra One, serif" font-size="30" fill="#d8342c">D</text>
    <rect x="93" y="150" width="24" height="26" fill="${SKIN}" stroke="${INK}" stroke-width="3"/>
    <g class="v-ladle"><path d="M40 245 L44 200" stroke="${INK}" stroke-width="13" stroke-linecap="round"/>
      <path d="M40 245 L44 200" stroke="#1f8f84" stroke-width="8" stroke-linecap="round"/></g>
    ${head(105, 112)}
    <g class="v-arm">
      <path d="M176 196 C198 176 204 150 200 124" fill="none" stroke="${INK}" stroke-width="19" stroke-linecap="round"/>
      <path d="M176 196 C198 176 204 150 200 124" fill="none" stroke="#1f8f84" stroke-width="13" stroke-linecap="round"/>
      <circle cx="200" cy="114" r="13" fill="${SKIN}" stroke="${INK}" stroke-width="3"/>
      <path d="M192 104 l-3 -9 M199 101 l0 -10 M206 103 l3 -9" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>
    </g>
  </svg>`;
}

/** Day: shutter's down, he's standing by the truck reading the paper. 230×510. */
function vendorDay() {
  return `<svg viewBox="0 0 230 510" aria-hidden="true">
    <path d="M86 330 L80 470 L108 470 L114 340 Z M144 330 L150 470 L122 470 L116 340 Z" fill="#2f3b63" stroke="${INK}" stroke-width="3.5" stroke-linejoin="round"/>
    <ellipse cx="88" cy="482" rx="26" ry="12" fill="#6b3f1f" stroke="${INK}" stroke-width="3"/>
    <ellipse cx="144" cy="482" rx="26" ry="12" fill="#6b3f1f" stroke="${INK}" stroke-width="3"/>
    <path d="M58 340 C56 250 74 214 115 214 C156 214 174 250 172 340 Z" fill="#1f8f84" stroke="${INK}" stroke-width="3.5"/>
    <rect x="103" y="170" width="24" height="30" fill="${SKIN}" stroke="${INK}" stroke-width="3"/>
    ${head(115, 140)}
    <g class="v-paper">
      <g transform="rotate(-4 115 250)">
        <rect x="12" y="160" width="206" height="176" rx="3" fill="#f4f0e4" stroke="${INK}" stroke-width="3.5"/>
        <path d="M115 162 V334" stroke="#cfc8b6" stroke-width="2"/>
        <text x="64" y="190" text-anchor="middle" font-family="Yatra One, serif" font-size="17" fill="${INK}">THE DAILY</text>
        <text x="64" y="210" text-anchor="middle" font-family="Yatra One, serif" font-size="17" fill="#d8342c">DESSERT</text>
        <rect x="26" y="220" width="76" height="4" fill="#9a927f"/><rect x="26" y="230" width="70" height="4" fill="#9a927f"/>
        <rect x="26" y="240" width="76" height="4" fill="#9a927f"/><rect x="26" y="250" width="58" height="4" fill="#9a927f"/>
        <rect x="26" y="266" width="76" height="52" fill="#e5dfcf" stroke="${INK}" stroke-width="2"/>
        <text x="64" y="300" text-anchor="middle" font-size="26">🍩</text>
        <path d="M30 270 L98 314" stroke="#d8342c" stroke-width="4"/>
        <g stroke="${INK}" stroke-width="1.5" fill="none"><rect x="128" y="176" width="78" height="78"/>
          <path d="M154 176 V254 M180 176 V254 M128 202 H206 M128 228 H206"/></g>
        <text x="141" y="196" font-size="15" font-family="Baloo 2, sans-serif" fill="${INK}">7</text>
        <text x="190" y="222" font-size="15" font-family="Baloo 2, sans-serif" fill="${INK}">3</text>
        <text x="164" y="248" font-size="15" font-family="Baloo 2, sans-serif" fill="${INK}">9</text>
        <rect x="128" y="266" width="78" height="4" fill="#9a927f"/><rect x="128" y="276" width="70" height="4" fill="#9a927f"/>
        <rect x="128" y="286" width="78" height="4" fill="#9a927f"/><rect x="128" y="296" width="62" height="4" fill="#9a927f"/>
      </g>
      <circle cx="16" cy="244" r="13" fill="${SKIN}" stroke="${INK}" stroke-width="3"/>
      <circle cx="214" cy="232" r="13" fill="${SKIN}" stroke="${INK}" stroke-width="3"/>
    </g>
  </svg>`;
}

/** A street dog (side view, walking right). 120×80. */
function dog() {
  return `<svg viewBox="0 0 120 80" aria-hidden="true">
    <g class="d-legs" stroke="${INK}" stroke-width="7" stroke-linecap="round">
      <path class="d-leg a" d="M34 50 L30 74"/><path class="d-leg b" d="M44 50 L48 74"/>
      <path class="d-leg b" d="M78 50 L74 74"/><path class="d-leg a" d="M88 50 L92 74"/>
    </g>
    <g class="d-legs" stroke="#b9773a" stroke-width="3.5" stroke-linecap="round">
      <path class="d-leg a" d="M34 50 L30 73"/><path class="d-leg b" d="M44 50 L48 73"/>
      <path class="d-leg b" d="M78 50 L74 73"/><path class="d-leg a" d="M88 50 L92 73"/>
    </g>
    <path class="d-tail" d="M24 36 q-14 -10 -10 -24" fill="none" stroke="${INK}" stroke-width="7" stroke-linecap="round"/>
    <path class="d-tail" d="M24 36 q-14 -10 -10 -24" fill="none" stroke="#b9773a" stroke-width="3.5" stroke-linecap="round"/>
    <ellipse cx="60" cy="42" rx="38" ry="15" fill="#b9773a" stroke="${INK}" stroke-width="3"/>
    <ellipse cx="80" cy="48" rx="12" ry="7" fill="#f3e3c3"/>
    <g class="d-head">
      <path d="M92 36 q6 -20 22 -14 q8 4 4 14 q-4 8 -18 8 z" fill="#b9773a" stroke="${INK}" stroke-width="3"/>
      <path d="M96 22 l-2 -14 l10 10 z" fill="#8a5426" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>
      <circle cx="108" cy="27" r="2.6" fill="${INK}"/><circle cx="118" cy="34" r="3" fill="${INK}"/>
    </g>
  </svg>`;
}

/** A crow sitting on the roof sign (night). 70×60. */
function crow() {
  return `<svg viewBox="0 0 70 60" aria-hidden="true">
    <path d="M28 46 l-3 12 M38 46 l3 12" stroke="#5a5a5a" stroke-width="3" stroke-linecap="round"/>
    <path class="c-wing" d="M10 30 q20 -14 42 2 q-6 18 -26 16 q-14 -2 -16 -18z" fill="#15151c" stroke="#000" stroke-width="2"/>
    <path d="M2 34 l12 -4 l-2 10z" fill="#15151c"/>
    <g class="c-head"><circle cx="52" cy="22" r="11" fill="#15151c"/>
      <path d="M61 20 l10 4 l-10 3z" fill="#6b6b6b"/><circle cx="55" cy="19" r="2.4" fill="#fff"/></g>
  </svg>`;
}

/** Put the street life on the scene. Returns the elements the truck code wires up. */
export function buildStreet(scene) {
  const html = `
    <img class="city-lights" src="img/city-lights.png" alt="" aria-hidden="true" />
    <button class="spot vendor vendor-night" type="button" aria-label="Talk to the vendor — open the chat">${vendorNight()}</button>
    <button class="spot vendor vendor-day" type="button" aria-label="Talk to the vendor — open the chat">${vendorDay()}</button>
    <span class="vendor-bubble" aria-hidden="true"></span>
    <span class="walker" aria-hidden="true"><button class="dog" type="button" tabindex="-1">${dog()}</button></span>
    <button class="crow" type="button" tabindex="-1" aria-hidden="true">${crow()}</button>
    <span class="critter-bubble" aria-hidden="true"></span>`;
  scene.insertAdjacentHTML("beforeend", html);
  return {
    vendors: [...scene.querySelectorAll(".vendor")],
    bubble: scene.querySelector(".vendor-bubble"),
    dog: scene.querySelector(".dog"),
    crow: scene.querySelector(".crow"),
    critterBubble: scene.querySelector(".critter-bubble"),
  };
}
