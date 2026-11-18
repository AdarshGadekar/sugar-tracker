// Food truck at night. Purely presentational: it drives the app through its existing
// controls (#chat-toggle, #prev/#next) and mirrors existing elements (#cal-body,
// #board-list, #chat-badge) onto the painted truck. chat.js and the data logic
// don't need to know the truck exists.

import { SPECIALS, todaysIndex } from "./specials.js";
import { buildStreet } from "./street.js";

const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const $ = (id) => document.getElementById(id);

function replay(el, cls) {
  if (!el) return;
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

export function mountTruck() {
  if (!$("truck")) return;
  mountCloseups();
  mountVendor();
  mirrorCalendar();
  mirrorBoard();
  mountSpecials();
  mountTouch();
  startPanned();
}

// ---------- Close-ups: lift a truck part off the picture ----------
let openItem = null, opener = null;

function mountCloseups() {
  const layer = $("closeup");
  document.querySelectorAll("[data-open]").forEach((b) => b.addEventListener("click", () => {
    if (b.dataset.open === "chat") return $("chat-toggle")?.click();
    openCloseup(b.dataset.open, document.querySelector(`.spot[data-open="${b.dataset.open}"]`) || b);
  }));
  layer.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", closeCloseup));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && openItem && !document.querySelector("dialog[open]") && $("chat").hidden) closeCloseup();
  });
}

// Entrance animations (calendar "hang", day/row stagger…) restart whenever a hidden element is
// shown again, which made the close-up jump about. Clear them so only the lift plays.
const ENTRANCES = ["hang", "enter", "swing", "thunk", "flip", "from-left", "from-right"];

function openCloseup(name, from) {
  const layer = $("closeup");
  const item = layer.querySelector(`[data-item="${name}"]`);
  if (!item || openItem === item) return;
  if (openItem) { closing = { item: openItem, back: opener }; openItem = null; } // swap straight to the new one
  finishClose();                         // a previous close-up still on its way back: finish it now
  item.querySelectorAll(ENTRANCES.map((c) => "." + c).join(",")).forEach((el) => el.classList.remove(...ENTRANCES));
  item.getAnimations({ subtree: false }).forEach((a) => a.cancel());
  layer.classList.remove("closing");
  layer.hidden = false;
  layer.querySelectorAll(".closeup-item").forEach((i) => (i.hidden = i !== item));
  openItem = item; opener = from;
  if (name === "special") showSpecial(todaysIndex(), true);
  lift(item, from?.getBoundingClientRect(), false);
  layer.querySelector(".closeup-close").focus({ preventScroll: true });
}

let closing = null;
function finishClose() {
  if (!closing) return;
  const { item, back } = closing;
  closing = null;
  item.getAnimations({ subtree: false }).forEach((a) => a.cancel());
  item.hidden = true;
  $("closeup").hidden = true;
  $("closeup").classList.remove("closing");
}

function closeCloseup() {
  if (!openItem) return;
  const item = openItem, back = opener;
  openItem = null;
  closing = { item, back };
  $("closeup").classList.add("closing");
  const anim = lift(item, back?.getBoundingClientRect(), true);
  const done = () => { if (closing?.item === item) { finishClose(); back?.focus?.({ preventScroll: true }); } };
  anim?.finished.then(done, done);
  setTimeout(done, reduceMotion ? 0 : 340);   // never leave the layer up if the animation is held back
}

/** Lift a part off the truck: grow it from where it sits on the picture, keeping its shape (no stretching). */
function lift(el, a, reverse) {
  if (reduceMotion || !a || !a.width) return null;
  const b = el.getBoundingClientRect();
  const s = Math.max(0.08, Math.min(a.width / b.width, a.height / b.height));
  const dx = a.left + a.width / 2 - (b.left + b.width / 2);
  const dy = a.top + a.height / 2 - (b.top + b.height / 2);
  const small = { transform: `translate(${dx}px, ${dy}px) scale(${s})`, opacity: 0 };
  const mid = { opacity: 1, offset: 0.35 };
  const big = { transform: "none", opacity: 1 };
  return el.animate(reverse ? [big, { opacity: 1, offset: 0.65 }, small] : [small, mid, big], {
    duration: reverse ? 300 : 480,
    easing: reverse ? "cubic-bezier(.55,0,.8,.3)" : "cubic-bezier(.2,1.15,.4,1)",
    fill: reverse ? "forwards" : "none",
  });
}

// ---------- The vendor = chat. Talk to him (tap him) and the chat opens ----------
const VENDOR_LINES = {
  night: ["Kya haal? Tap to chat 💬", "Gossip's hot tonight 🔥", "Psst… your friends are talking 👀"],
  day: ["Shop's shut. Gossip's open 💬", "Reading the paper… or chat? 📰", "Tap me, I'm bored ☀️"],
};
function mountVendor() {
  const panel = $("chat"), toggle = $("chat-toggle"), bell = $("bell");
  if (!panel || !toggle) return;
  panel.classList.add("hud");
  const st = buildStreet($("truck"));
  const isDay = () => document.documentElement.dataset.mode === "day";
  const current = () => st.vendors.find((v) => v.classList.contains(isDay() ? "vendor-day" : "vendor-night"));
  let unread = 0, line = 0, hovering = false;

  const say = () => {
    const text = unread ? `${unread} new message${unread === 1 ? "" : "s"}! 👀` : VENDOR_LINES[isDay() ? "day" : "night"][line];
    st.bubble.textContent = text;
    st.bubble.classList.toggle("show", hovering || unread > 0);
    st.vendors.forEach((v) => v.classList.toggle("has-news", unread > 0));
  };
  st.vendors.forEach((v) => {
    v.addEventListener("click", () => toggle.click());
    v.addEventListener("mouseenter", () => { hovering = true; line = (line + 1) % 3; say(); });
    v.addEventListener("mouseleave", () => { hovering = false; say(); });
    v.addEventListener("focus", () => { hovering = true; say(); });
    v.addEventListener("blur", () => { hovering = false; say(); });
  });
  new MutationObserver(say).observe(document.documentElement, { attributes: true, attributeFilter: ["data-mode"] });

  const sync = () => {
    const open = !panel.hidden;
    st.vendors.forEach((v) => v.setAttribute("aria-expanded", String(open)));
    if (open) { closeCloseup(); placeBubble(panel, current()); popFrom(current(), panel); }
  };
  addEventListener("resize", () => { if (!panel.hidden) placeBubble(panel, current()); });
  new MutationObserver(sync).observe(panel, { attributes: true, attributeFilter: ["hidden"] });

  // the bell rings for new messages (chat.js pings #chat-toggle); tap it to open the chat too
  bell?.addEventListener("click", () => toggle.click());
  new MutationObserver(() => {
    if (toggle.classList.contains("ping")) { replay(bell, "ring"); st.vendors.forEach((v) => replay(v, "wave")); }
  }).observe(toggle, { attributes: true, attributeFilter: ["class"] });

  const badge = $("chat-badge"), bellCount = $("bell-count");
  const mirror = () => {
    if (!badge) return;
    unread = badge.hidden ? 0 : parseInt(badge.textContent, 10) || 9;
    bellCount.textContent = badge.textContent;
    bellCount.hidden = badge.hidden;
    bell?.classList.toggle("has-news", !badge.hidden);
    say();
  };
  if (badge) new MutationObserver(mirror).observe(badge, { attributes: true, childList: true, characterData: true, subtree: true });
  mirror();

  // street life: the dog barks, the crow caws and flies off
  const pop = (el, text) => {
    const r = el.getBoundingClientRect(), s = $("truck").getBoundingClientRect();
    st.critterBubble.textContent = text;
    st.critterBubble.style.left = `${((r.left + r.width / 2 - s.left) / s.width) * 100}%`;
    st.critterBubble.style.top = `${((r.top - s.top) / s.height) * 100}%`;
    replay(st.critterBubble, "show");
  };
  const barks = ["Woof! 🐶", "Woof woof! (sugar-free since birth)", "Arf! Got a biscuit? No? Fine."];
  let bark = 0;
  st.dog.addEventListener("click", () => { pop(st.dog, barks[bark++ % barks.length]); replay(st.dog, "yap"); });
  st.crow.addEventListener("click", () => {
    if (st.crow.classList.contains("gone")) return;
    pop(st.crow, "Caw! 🍬? Nope.");
    st.crow.classList.add("gone");
    setTimeout(() => st.crow.classList.remove("gone"), 25000);   // it comes back
  });
}

/** Put the chat bubble right beside the vendor, tail pointing at his head. */
function placeBubble(panel, who) {
  panel.classList.remove("tail-left", "tail-right");
  if (!who || innerWidth <= 600) { panel.style.left = panel.style.top = ""; return; }
  const v = who.getBoundingClientRect();
  const w = panel.offsetWidth, h = panel.offsetHeight, gap = 26, pad = 12;
  const headY = v.top + v.height * 0.28;
  const right = v.right + gap + w <= innerWidth - pad;          // room on his right? (else open on his left)
  const left = right ? v.right + gap : Math.max(pad, v.left - gap - w);
  const top = Math.min(Math.max(76, headY - h * 0.35), innerHeight - h - pad);
  panel.style.left = `${Math.round(left)}px`;
  panel.style.top = `${Math.round(top)}px`;
  panel.style.setProperty("--tail-y", `${Math.round(Math.min(Math.max(headY - top, 30), h - 30))}px`);
  panel.classList.add(right ? "tail-left" : "tail-right");
}

/** The chat panel grows out of whatever opened it (the vendor). */
function popFrom(from, panel) {
  const a = from?.getBoundingClientRect();
  if (!a || !a.width || a.bottom < 0 || a.top > innerHeight || a.right < 0 || a.left > innerWidth) return; // off-screen: plain open
  lift(panel, a, false);
}

// ---------- Roof sign: a no-added-sugar treat idea ----------
let specialAt = 0;
function showSpecial(i, isToday = false) {
  specialAt = (i + SPECIALS.length) % SPECIALS.length;
  const sp = SPECIALS[specialAt];
  $("special-kicker").textContent = isToday ? "Today's no-sugar special" : "Also on the menu";
  $("special-emoji").textContent = sp.emoji;
  $("special-name").textContent = sp.name;
  $("special-why").textContent = sp.why;
  $("special-how").textContent = sp.how;
}
function mountSpecials() {
  $("special-next")?.addEventListener("click", () => {
    showSpecial(specialAt + 1);
    if (!reduceMotion) replay($("menu-card"), "swap");
  });
}

// ---------- Touch the truck: a tiny suspension wobble + a haptic tick ----------
// Only the truck reacts (not the sky or the street): img/truck-mask.png is white where the truck is.
function mountTouch() {
  const scene = $("truck");
  if (!scene) return;
  let mask = null;
  const img = new Image();
  img.onload = () => {
    const c = document.createElement("canvas");
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    mask = { w: c.width, h: c.height, d: ctx.getImageData(0, 0, c.width, c.height).data };
  };
  img.src = "img/truck-mask.png";

  const onTruck = (e) => {
    if (e.target.closest(".spot, .vendor, .dog, .crow, .sticker, .day-shutter")) return true;
    if (!mask) return false;
    const r = scene.getBoundingClientRect();
    const x = Math.floor(((e.clientX - r.left) / r.width) * mask.w);
    const y = Math.floor(((e.clientY - r.top) / r.height) * mask.h);
    if (x < 0 || y < 0 || x >= mask.w || y >= mask.h) return false;
    return mask.d[(y * mask.w + x) * 4] > 127;
  };

  // Phones only allow vibration from a finished tap (finger lifted), so the buzz goes on "click";
  // the wobble starts right away on touch-down.
  let touchedTruck = false;
  scene.addEventListener("click", () => { if (touchedTruck) { touchedTruck = false; haptic(); } });
  scene.addEventListener("pointerdown", (e) => {
    touchedTruck = onTruck(e);
    if (!touchedTruck || reduceMotion) return;
    const r = scene.getBoundingClientRect();
    const side = (e.clientX - r.left) / r.width - 0.5;          // touched left or right of centre
    const layer = $("truck-layer") || scene;
    layer.style.setProperty("--tilt", `${(side * 0.7).toFixed(3)}deg`);
    replay(layer, "jolt");
  });
}

// A short buzz. Android: the vibration API. iPhone Safari has no vibration API, but flipping a
// native on/off switch gives a light tap (iOS 18+), so we keep a hidden one and flip it.
let hapticSwitch = null;
function haptic() {
  if (typeof navigator.vibrate === "function" && /Android/i.test(navigator.userAgent)) { navigator.vibrate(12); return; }
  if (!/iPhone|iPad|iPod/i.test(navigator.userAgent)) return;
  if (!hapticSwitch) {
    hapticSwitch = document.createElement("label");
    hapticSwitch.setAttribute("aria-hidden", "true");
    hapticSwitch.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0;pointer-events:none";
    const input = Object.assign(document.createElement("input"), { type: "checkbox", tabIndex: -1 });
    input.setAttribute("switch", "");
    hapticSwitch.append(input);
    document.body.append(hapticSwitch);
  }
  hapticSwitch.click();
}

// ---------- Paper calendar on the truck mirrors the real one ----------
function mirrorCalendar() {
  const body = $("cal-body"), label = $("month-label"), days = $("mini-days"), month = $("mini-month");
  if (!body || !days) return;
  const draw = () => {
    month.textContent = label.textContent;
    const cells = ["M", "T", "W", "T", "F", "S", "S"].map((d) => `<b class="wd">${d}</b>`);
    body.querySelectorAll("td").forEach((td) => {
      const b = td.querySelector(".day");
      if (!b) return cells.push('<b class="blank"></b>');
      const cls = ["no", "yes", "gift", "today", "future"].filter((c) => b.classList.contains(c)).join(" ");
      cells.push(`<b class="${cls}">${b.querySelector(".num")?.textContent ?? ""}</b>`);
    });
    days.innerHTML = cells.join("");
  };
  new MutationObserver(draw).observe(body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
  new MutationObserver(draw).observe(label, { childList: true, characterData: true, subtree: true });
  draw();
}

// ---------- Chalkboard on the truck mirrors the leaderboard ----------
function mirrorBoard() {
  const list = $("board-list"), rows = $("mini-board");
  if (!list || !rows) return;
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const draw = () => {
    const html = [...list.querySelectorAll(".board-row")].slice(0, 6).map((li) => {
      const rank = li.querySelector(".rank")?.textContent ?? "";
      const name = li.querySelector(".nm")?.firstChild?.textContent ?? "";
      const streak = li.querySelector(".stats b")?.textContent?.replace("🔥", "").trim() ?? "0";
      const cls = (li.classList.contains("me") ? "me " : "") + (li.classList.contains("out") ? "out" : "");
      const flames = "🔥".repeat(Math.min(3, Number(streak) || 0)) || "·";
      return `<span class="${cls}">${esc(rank)}<i>${esc(name.charAt(0).toUpperCase())}</i><em>${esc(name)}</em><small>${flames}</small></span>`;
    });
    rows.innerHTML = '<span class="chalk-cols"><em>Name</em><small>streak</small></span>'
      + (html.join("") || "<span><em>No one yet — invite a friend!</em></span>");
  };
  new MutationObserver(draw).observe(list, { childList: true, subtree: true });
  draw();
}

// Phones: the picture is wider than the screen — start on the calendar + serving window.
function startPanned() {
  const wrap = $("scene-wrap"), scene = $("truck");
  if (!wrap || !scene) return;
  const pan = () => { if (wrap.scrollWidth > wrap.clientWidth + 4 && !wrap.dataset.panned) {
    wrap.dataset.panned = "1"; wrap.scrollLeft = scene.offsetWidth * 0.02; } };
  new ResizeObserver(pan).observe(wrap);
}

/**
 * Bring a rubber stamp down on a day cell. Resolves at the moment of impact
 * (so the caller can paint the mark right then), the stamp lifts away by itself.
 */
export function stampDay(cell, hadSugar) {
  const board = $("cal-board");
  if (reduceMotion || !cell || !cell.offsetParent) return Promise.resolve();
  const r = cell.getBoundingClientRect();
  const s = document.createElement("div");
  s.className = "stamp " + (hadSugar ? "yes" : "no");
  s.innerHTML = '<span class="stamp-knob"></span><span class="stamp-neck"></span>'
    + `<span class="stamp-base">${hadSugar ? "SUGAR!" : "NO SUGAR"}</span>`;
  s.style.left = `${r.left + r.width / 2}px`;
  s.style.top = `${r.top + r.height / 2}px`;
  document.body.append(s);
  setTimeout(() => s.remove(), 1000);
  return new Promise((resolve) => setTimeout(() => {
    replay(board, "thunk");
    resolve();
  }, 330));
}

/** Month change: swing the calendar (big and small) and flip the page over the rings. */
export function flipBoard(firstLoad = false) {
  const board = $("cal-board");
  if (firstLoad) return replay(board, "hang");
  replay(board, "swing");
  replay($("cal-page"), "flip");
  const paper = $("spot-cal");
  replay(paper, "swing");
  clearTimeout(flipBoard.t);
  flipBoard.t = setTimeout(() => paper?.classList.remove("swing"), 950);   // back to the idle sway
}
