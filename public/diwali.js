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

/** All rangoli shapes as [svg tag, attributes, draw delay in seconds]. Coordinates in a -300..300 box. */
function shapes() {
  const out = [];
  const rot = (deg) => `rotate(${deg})`;
  // inner rings around the diya
  out.push(["circle", { r: 112 }, 0]);
  out.push(["circle", { r: 96 }, 0.15]);
  // 12 big petals
  for (let i = 0; i < 12; i++) {
    out.push(["path", {
      d: "M0 -122 C 44 -150 50 -222 0 -256 C -50 -222 -44 -150 0 -122 Z",
      transform: rot(i * 30),
    }, 0.35 + i * 0.07]);
    // a curl inside each petal
    out.push(["path", {
      d: "M0 -150 C 16 -165 16 -196 0 -214 C -16 -196 -16 -165 0 -150 Z",
      transform: rot(i * 30),
    }, 0.9 + i * 0.05]);
  }
  // small loops between the petals
  for (let i = 0; i < 12; i++) {
    out.push(["circle", { r: 20, cx: 0, cy: -150, transform: rot(i * 30 + 15) }, 1.2 + i * 0.04]);
  }
  // outer scallops
  for (let i = 0; i < 24; i++) {
    out.push(["path", {
      d: "M-35 -262 Q 0 -300 35 -262",
      transform: rot(i * 15 + 7.5),
    }, 1.5 + i * 0.03]);
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

  for (const [tag, attrs, delay] of shapes()) {
    // solid white copy in the mask "draws" the shape in…
    const reveal = el(tag, { ...attrs, class: "diwali-draw", pathLength: 1 });
    reveal.style.animationDelay = `${delay}s`;
    mask.append(reveal);
    // …and the dotted gold copies are the strings of lights that show through it
    lights.append(el(tag, attrs));
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

export function mountDiwali() {
  if (document.documentElement.dataset.theme !== "diwali") return;
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
