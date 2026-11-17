// Food truck at night. Purely presentational: it drives the app through its existing
// controls (#chat-toggle, #prev/#next, .sdk-toggle) and mirrors existing elements (#cal-body,
// #board-list, #chat-list, #chat-badge) onto the painted truck. chat.js and the data logic
// don't need to know the truck exists.

import { SPECIALS, todaysIndex } from "./specials.js";

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
  mountChatGlass();
  mirrorCalendar();
  mirrorBoard();
  mountSpecials();
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

// ---------- Driver's door window = chat. It's closed: tap it, or pull the glass down ----------
function mountChatGlass() {
  const spot = $("spot-chat"), panel = $("chat"), toggle = $("chat-toggle"), bell = $("bell");
  const glass = spot?.querySelector(".pane");
  if (!spot || !panel || !toggle) return;
  panel.classList.add("hud");
  const isOpen = () => !panel.hidden;

  let suppress = false;
  spot.addEventListener("click", () => { if (suppress) { suppress = false; return; } toggle.click(); });

  let startY = null, dy = 0;
  spot.addEventListener("pointerdown", (e) => {
    if (isOpen()) return;
    startY = e.clientY; dy = 0;
    spot.setPointerCapture(e.pointerId);
    spot.classList.add("dragging");
  });
  spot.addEventListener("pointermove", (e) => {
    if (startY === null) return;
    dy = Math.max(0, e.clientY - startY);
    glass.style.transform = `translateY(${Math.min(dy, spot.clientHeight * 0.94)}px)`;
  });
  const end = () => {
    if (startY === null) return;
    startY = null;
    spot.classList.remove("dragging");
    glass.style.transform = "";
    if (dy > 6) {                       // it was a pull, not a tap
      suppress = true;                  // swallow the click that follows this pointerup
      setTimeout(() => (suppress = false), 350);
      if (dy > spot.clientHeight * 0.2) toggle.click();
    }
  };
  spot.addEventListener("pointerup", end);
  spot.addEventListener("pointercancel", end);

  const sync = () => {
    const open = isOpen();
    if (open === spot.classList.contains("down")) return;
    spot.classList.toggle("down", open);
    spot.setAttribute("aria-expanded", String(open));
    if (open) { closeCloseup(); popFrom(spot, panel); }
  };
  new MutationObserver(sync).observe(panel, { attributes: true, attributeFilter: ["hidden"] });
  sync();

  // the bell over the counter rings for new messages (chat.js pings #chat-toggle); tap it to open the chat
  bell?.addEventListener("click", () => toggle.click());
  new MutationObserver(() => {
    if (toggle.classList.contains("ping")) replay(bell, "ring");
  }).observe(toggle, { attributes: true, attributeFilter: ["class"] });

  // unread count + newest message, shown on the window and the bell
  const badge = $("chat-badge"), count = $("glass-count"), msg = $("glass-msg"), list = $("chat-list"), bellCount = $("bell-count");
  const mirror = () => {
    if (badge) {
      count.textContent = bellCount.textContent = badge.textContent;
      count.hidden = bellCount.hidden = badge.hidden;
      bell?.classList.toggle("has-news", !badge.hidden);
    }
    const last = [...(list?.querySelectorAll(".msg:not(.system)") ?? [])].pop();
    const who = last?.querySelector(".msg-head strong, .msg-head b, .msg-head span")?.textContent?.trim();
    const text = last?.querySelector(".msg-text")?.textContent?.trim();
    msg.textContent = text ? (who ? `${who}: ${text}` : text) : "Pull the window down";
  };
  if (badge) new MutationObserver(mirror).observe(badge, { attributes: true, childList: true, characterData: true, subtree: true });
  if (list) new MutationObserver(mirror).observe(list, { childList: true });
  mirror();
}

/** The chat panel grows out of the door window. */
function popFrom(from, panel) {
  const a = from.getBoundingClientRect();
  if (a.bottom < 0 || a.top > innerHeight || a.right < 0 || a.left > innerWidth) return; // window off-screen: plain open
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
