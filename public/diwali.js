// Diwali celebration: a diya in the middle while a rangoli of golden lights draws itself around it.
// mountDiwali() adds the little diya button (bottom centre) that replays it; celebrate() plays it.
// Only active while <html data-theme="diwali">.

const NS = "http://www.w3.org/2000/svg";
const AUTO_KEY = "desserted_diwali_seen";   // auto-play at most once a day per browser
const SHOW_MS = 7000;

const el = (tag, attrs = {}) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
};

/** All rangoli shapes as [svg tag, attributes, draw delay (s), angle on the circle (deg)]. Coordinates in a -300..300 box. */
function shapes() {
  const out = [];
  const rot = (deg) => `rotate(${deg})`;
  // inner rings around the diya
  out.push(["circle", { r: 112 }, 0, 0]);
  out.push(["circle", { r: 96 }, 0.15, 180]);
  // 12 big petals
  for (let i = 0; i < 12; i++) {
    out.push(["path", {
      d: "M0 -122 C 44 -150 50 -222 0 -256 C -50 -222 -44 -150 0 -122 Z",
      transform: rot(i * 30),
    }, 0.35 + i * 0.07, i * 30]);
    // a curl inside each petal
    out.push(["path", {
      d: "M0 -150 C 16 -165 16 -196 0 -214 C -16 -196 -16 -165 0 -150 Z",
      transform: rot(i * 30),
    }, 0.9 + i * 0.05, i * 30]);
  }
  // small loops between the petals
  for (let i = 0; i < 12; i++) {
    out.push(["circle", { r: 20, cx: 0, cy: -150, transform: rot(i * 30 + 15) }, 1.2 + i * 0.04, i * 30 + 15]);
  }
  // outer scallops
  for (let i = 0; i < 24; i++) {
    out.push(["path", {
      d: "M-35 -262 Q 0 -300 35 -262",
      transform: rot(i * 15 + 7.5),
    }, 1.5 + i * 0.03, i * 15 + 7.5]);
  }
  return out;
}

function build() {
  const wrap = document.createElement("div");
  wrap.className = "diwali-show";
  wrap.setAttribute("role", "img");
  wrap.setAttribute("aria-label", "Happy Diwali — a diya surrounded by a rangoli of lights");

  const svg = el("svg", { viewBox: "-300 -300 600 600", class: "diwali-rangoli" });
  const defs = el("defs");
  const mask = el("mask", { id: "diwali-reveal", maskUnits: "userSpaceOnUse", x: -300, y: -300, width: 600, height: 600 });
  const lights = el("g", { class: "diwali-lights", mask: "url(#diwali-reveal)" });
  const lights2 = el("g", { class: "diwali-lights alt", mask: "url(#diwali-reveal)" });

  const WAVE_S = 1.6; // one sweep of light round the rangoli (matches diwali-wave in styles.css)
  for (const [tag, attrs, delay, angle] of shapes()) {
    // solid white copy in the mask "draws" the shape in…
    const reveal = el(tag, { ...attrs, class: "diwali-draw", pathLength: 1 });
    reveal.style.animationDelay = `${delay}s`;
    mask.append(reveal);
    // …and the dotted gold copies are the strings of lights that show through it
    const lit = el(tag, attrs);
    lit.style.setProperty("--w", `${-(1 - angle / 360) * WAVE_S}s`); // negative delay: already mid-sweep, no pause at start
    lights.append(lit);
    lights2.append(el(tag, attrs));
  }
  defs.append(mask);
  svg.append(defs, lights2, lights);

  const diya = document.createElement("div");
  diya.className = "diwali-diya";
  diya.innerHTML = '<span class="diwali-glow"></span><span class="diwali-lamp">🪔</span>';

  const sparks = document.createElement("div");
  sparks.className = "diwali-sparks";
  for (let i = 0; i < 26; i++) {
    const s = document.createElement("i");
    const a = (i / 26) * Math.PI * 2;
    const d = 120 + Math.random() * 160;
    s.style.setProperty("--x", `${Math.cos(a) * d}px`);
    s.style.setProperty("--y", `${Math.sin(a) * d}px`);
    s.style.setProperty("--t", `${1.6 + Math.random() * 1.4}s`);
    s.style.animationDelay = `${0.4 + Math.random() * 1.2}s`;
    sparks.append(s);
  }

  const greet = document.createElement("p");
  greet.className = "diwali-greet";
  greet.textContent = "Happy Diwali ✨";

  const close = document.createElement("button");
  close.type = "button";
  close.className = "diwali-close";
  close.setAttribute("aria-label", "Close");
  close.textContent = "✕";

  wrap.append(svg, sparks, diya, greet, close);
  return { wrap, close };
}

let current = null;

export function celebrate() {
  if (document.documentElement.dataset.theme !== "diwali" || current) return;
  const { wrap, close } = build();
  current = wrap;
  let timer;
  const end = () => {
    clearTimeout(timer);
    wrap.classList.add("out");
    setTimeout(() => { wrap.remove(); current = null; }, 600);
  };
  close.addEventListener("click", end);
  wrap.addEventListener("click", (e) => { if (e.target === wrap) end(); });
  document.addEventListener("keydown", function esc(e) {
    if (e.key === "Escape") { end(); document.removeEventListener("keydown", esc); }
  });
  document.body.append(wrap);
  timer = setTimeout(end, SHOW_MS);
}

/** A hanging paper lantern (akash kandil): pleated body with paper panels, glowing rim, paper fans and tassels. */
function lantern(side, body, panel, tassel) {
  const wrap = document.createElement("div");
  wrap.className = `lantern ${side}`;
  wrap.setAttribute("aria-hidden", "true");
  const id = `pleats-${side}`;
  const fan = (x, y) => `
    <line x1="${x}" y1="132" x2="${x}" y2="${y}" class="l-cord"/>
    <path d="M${x} ${y} L${x - 13} ${y + 15} Q${x} ${y + 21} ${x + 13} ${y + 15} Z" style="fill:${panel}"/>
    <path d="M${x} ${y} L${x - 6} ${y + 18} M${x} ${y} L${x} ${y + 19} M${x} ${y} L${x + 6} ${y + 18}" class="l-fold"/>
    <rect x="${x - 3}" y="${y + 18}" width="6" height="26" rx="2" style="fill:${tassel}"/>
    <path d="M${x - 3} ${y + 30} v14 M${x} ${y + 30} v16 M${x + 3} ${y + 30} v14" style="stroke:${tassel}" class="l-thread"/>`;
  wrap.innerHTML = `
  <svg viewBox="0 0 100 260" width="130" height="338">
    <defs>
      <pattern id="${id}" width="5" height="10" patternUnits="userSpaceOnUse">
        <rect width="5" height="10" style="fill:${body}"/><rect width="1.4" height="10" fill="rgb(0 0 0 / .14)"/>
      </pattern>
      <radialGradient id="${id}-glow" cx="50%" cy="0%" r="80%">
        <stop offset="0" stop-color="#fff3c4" stop-opacity=".95"/><stop offset="1" stop-color="#ffb347" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <line x1="50" y1="0" x2="50" y2="40" class="l-cord"/>
    <rect x="13" y="38" width="74" height="9" rx="3" style="fill:${body}" class="l-cap"/>
    <rect x="15" y="46" width="70" height="82" fill="url(#${id})"/>
    <polygon points="32,49 15,128 49,128" style="fill:${panel}" class="l-panel"/>
    <polygon points="68,49 51,128 85,128" style="fill:${panel}" class="l-panel"/>
    <rect x="15" y="46" width="70" height="82" class="l-light"/>
    <ellipse cx="50" cy="130" rx="37" ry="5" class="l-rim"/>
    <ellipse cx="50" cy="150" rx="44" ry="26" fill="url(#${id}-glow)" class="l-glow"/>
    ${fan(26, 162)}${fan(50, 176)}${fan(74, 162)}
  </svg>`;
  return wrap;
}

export function mountDiwali() {
  if (document.documentElement.dataset.theme !== "diwali") return;
  document.body.append(
    lantern("left", "#e0218a", "#ffc53d", "#c81d3a"),   // pink with marigold panels
    lantern("right", "#2f5fe0", "#ff7ac4", "#7c3aed"),  // blue with pink panels
  );
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "diwali-btn";
  btn.title = "Light a diya";
  btn.setAttribute("aria-label", "Light a diya — play the Diwali animation");
  btn.textContent = "🪔";
  btn.addEventListener("click", celebrate);
  document.body.append(btn);

  // Play once a day on its own.
  const today = new Date().toDateString();
  let seen = null;
  try { seen = localStorage.getItem(AUTO_KEY); } catch { /* storage blocked */ }
  if (seen !== today) {
    try { localStorage.setItem(AUTO_KEY, today); } catch { /* ignore */ }
    setTimeout(celebrate, 700);
  }
}
