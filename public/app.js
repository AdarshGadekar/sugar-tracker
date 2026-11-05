import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/+esm";
import {
  MAX_SUGAR, monthGrid, todayISO, sugarCount, isLocked, chancesLeft, canMark, formatDay, currentStreak,
} from "./calendar.js";
import { mountSudoku } from "./sudoku.js";
import { CLEAN, SLIP, LAST_LIFE, GAME_OVER, TODAY_LINES, FUTURE_LINES, pick } from "./messages.js";
import { createChat } from "./chat.js";

mountSudoku(document.getElementById("sudoku"));

const cfg = window.SUGAR_CONFIG || {};
const $ = (id) => document.getElementById(id);
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

// Local mock backend: only on localhost, only with ?mock in the URL.
const isLocal = ["localhost", "127.0.0.1"].includes(location.hostname);
const useMock = isLocal && new URLSearchParams(location.search).has("mock");

if (!useMock && (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY)) {
  document.querySelector("main").innerHTML =
    '<div class="card">Missing config.js — copy config.example.js to config.js and add your Supabase URL and anon key.</div>';
  throw new Error("Missing Supabase config");
}

let supabase;
if (useMock) {
  const mock = await import("./mock-supabase.js");
  supabase = mock.createMockClient();
  const badge = document.createElement("div");
  badge.className = "mock-badge";
  badge.innerHTML = 'Mock mode <button class="link" type="button" data-act="friend">friend message</button>'
    + '<button class="link" type="button" data-act="dm">friend DM</button>'
    + '<button class="link" type="button" data-act="reset">reset data</button>';
  badge.querySelector('[data-act="dm"]').addEventListener("click", () => supabase.simulateFriendDm());
  badge.querySelector('[data-act="reset"]').addEventListener("click", () => { mock.resetMock(); location.reload(); });
  badge.querySelector('[data-act="friend"]').addEventListener("click", () => supabase.simulateFriendMessage());
  document.body.append(badge);
} else {
  supabase = createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
}

const chat = createChat({ supabase, $, replay });

const state = {
  user: null,
  marks: {},            // { "YYYY-MM-DD": had_sugar }
  view: new Date(),     // month being shown
  busy: false,
};

// ---------- Motion helpers ----------
/** Re-run a CSS entrance animation by toggling a class. */
function replay(el, cls = "enter") {
  if (!el) return;
  el.classList.remove(cls);
  void el.offsetWidth; // restart animation
  el.classList.add(cls);
}

/** Small particle burst from an element (used for "no sugar" wins). */
function burst(el) {
  if (reduceMotion || !el) return;
  const r = el.getBoundingClientRect();
  const layer = document.createElement("div");
  layer.className = "burst";
  layer.style.left = `${r.left + r.width / 2}px`;
  layer.style.top = `${r.top + r.height / 2}px`;
  for (let i = 0; i < 14; i++) {
    const p = document.createElement("i");
    const angle = (i / 14) * Math.PI * 2;
    const dist = 38 + Math.random() * 26;
    p.style.setProperty("--x", `${Math.cos(angle) * dist}px`);
    p.style.setProperty("--y", `${Math.sin(angle) * dist}px`);
    p.style.setProperty("--h", `${120 + Math.random() * 40}`);
    layer.append(p);
  }
  document.body.append(layer);
  setTimeout(() => layer.remove(), 900);
}

// ---------- UI helpers ----------
let toastTimer;
function toast(text, isError = false) {
  const el = $("toast");
  el.textContent = text;
  el.className = "toast" + (isError ? " error" : "");
  el.hidden = false;
  replay(el, "show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.add("hide");
    setTimeout(() => (el.hidden = true), 350);
  }, 3500);
}

/** Pop-up card with a fun fact / motivation that fades away on its own. */
let factTimer;
function showFact(title, message, tone) {
  const el = $("fact");
  $("fact-icon").textContent = message.icon;
  $("fact-title").textContent = title;
  $("fact-text").textContent = message.text;
  el.className = `fact ${tone}`;
  el.hidden = false;
  replay(el, "show");
  replay(el.querySelector(".fact-timer i"), "run");
  clearTimeout(factTimer);
  factTimer = setTimeout(hideFact, 7000);
}
function hideFact() {
  const el = $("fact");
  if (el.hidden) return;
  clearTimeout(factTimer);
  el.classList.add("hide");
  setTimeout(() => (el.hidden = true), 450);
}

function ask(dialog) {
  return new Promise((resolve) => {
    dialog.addEventListener("close", () => resolve(dialog.returnValue), { once: true });
    dialog.returnValue = "cancel";
    dialog.showModal();
  });
}

// ---------- Auth ----------
const redirectTo = location.origin + location.pathname;
let pending = null;   // { email, password } while waiting for email confirmation
let pollTimer = null;

function showScreen(name) {
  document.querySelectorAll("[data-screen]").forEach((el) => {
    el.hidden = el.dataset.screen !== name;
    if (!el.hidden) replay(el);
  });
  document.querySelectorAll("[data-screen] .msg").forEach((el) => (el.textContent = ""));
  if (name !== "verify") stopPolling();
  const first = document.querySelector(`[data-screen="${name}"] input`);
  if (first) first.focus({ preventScroll: true });
}

function setMsg(scope, text, isError = true) {
  const el = scope.querySelector(".msg");
  el.textContent = text;
  el.classList.toggle("error", isError);
  if (isError) replay(scope, "nudge");
}

async function busy(button, label, fn) {
  const old = button.textContent;
  button.disabled = true;
  button.classList.add("loading");
  button.textContent = label;
  try { return await fn(); } finally {
    button.disabled = false;
    button.classList.remove("loading");
    button.textContent = old;
  }
}

function friendly(error) {
  if (error?.code === "over_email_send_rate_limit" || /rate limit/i.test(error?.message || "")) {
    return "Too many sign-up emails were sent in the last hour. Please try again in a little while.";
  }
  return error?.message || "Something went wrong. Please try again.";
}

const isUnconfirmed = (error) =>
  error?.code === "email_not_confirmed" || /not confirmed/i.test(error?.message || "");

async function signIn(e) {
  e.preventDefault();
  const form = e.currentTarget;
  const email = form.email.value.trim(), password = form.password.value;
  const { error } = await busy(form.querySelector("[type=submit]"), "Signing in…",
    () => supabase.auth.signInWithPassword({ email, password }));
  if (!error) return; // onAuthStateChange takes over
  if (isUnconfirmed(error)) return startVerify(email, password);
  setMsg(form, error.message === "Invalid login credentials" ? "Wrong email or password." : friendly(error));
}

async function signUp(e) {
  e.preventDefault();
  const form = e.currentTarget;
  const email = form.email.value.trim(), password = form.password.value;
  const { data, error } = await busy(form.querySelector("[type=submit]"), "Creating account…",
    () => supabase.auth.signUp({
      email, password,
      options: { emailRedirectTo: redirectTo, data: { name: form.name.value.trim() } },
    }));
  if (error) return setMsg(form, friendly(error));
  if (data.session) return; // email confirmation is off: already signed in
  if (data.user && data.user.identities?.length === 0) {
    return setMsg(form, "An account with this email already exists. Sign in instead.");
  }
  startVerify(email, password);
}

// ----- Waiting for the confirmation link -----
function startVerify(email, password) {
  pending = { email, password };
  $("verify-email").textContent = email;
  showScreen("verify");
  stopPolling();
  const started = Date.now();
  pollTimer = setInterval(() => {
    if (Date.now() - started > 15 * 60 * 1000) return stopPolling();
    checkConfirmed(false);
  }, useMock ? 3000 : 15000);
}

function stopPolling() {
  clearInterval(pollTimer);
  pollTimer = null;
}

async function checkConfirmed(manual) {
  if (!pending) return;
  const { error } = await supabase.auth.signInWithPassword(pending);
  if (!error) { pending = null; stopPolling(); return; }
  if (!manual) return;
  const box = document.querySelector('[data-screen="verify"]');
  setMsg(box, isUnconfirmed(error) ? "Not confirmed yet — click the link in the email first." : friendly(error));
}

async function resend(e) {
  if (!pending) return;
  const box = document.querySelector('[data-screen="verify"]');
  const { error } = await busy(e.currentTarget, "Sending…", () =>
    supabase.auth.resend({ type: "signup", email: pending.email, options: { emailRedirectTo: redirectTo } }));
  setMsg(box, error ? friendly(error) : "Sent again. Check spam too.", !!error);
}

// Coming back to this tab after clicking the link elsewhere: check right away.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && pollTimer) checkConfirmed(false);
});

supabase.auth.onAuthStateChange((_event, session) => {
  const user = session?.user ?? null;
  if (user?.id === state.user?.id) return;
  state.user = user;
  state.marks = {};
  shownLives = null;
  delete $("hearts").dataset.over;
  showView();
});

let viewShown = false;
function showView() {
  viewShown = true;
  const signedIn = !!state.user;
  $("auth-view").hidden = signedIn;
  $("app-view").hidden = !signedIn;
  $("account").hidden = !signedIn;
  if (signedIn) $("avatar").textContent = displayName(state.user).charAt(0).toUpperCase();
  if (signedIn) {
    pending = null;
    stopPolling();
    if (location.hash.includes("access_token")) history.replaceState(null, "", location.pathname + location.search);
    replay($("app-view"));
    loadMarks({ animate: true });
    chat.start(state.user);
  } else {
    chat.stop();
    if (!pending) showScreen("landing");
  }
}

// ---------- Data ----------
async function loadMarks(opts = {}) {
  const { data, error } = await supabase.from("day_marks").select("day, had_sugar");
  if (error) return toast("Could not load your days: " + error.message, true);
  state.marks = Object.fromEntries(data.map((r) => [r.day, r.had_sugar]));
  render(opts);
  loadBoard();
}

async function onDayClick(iso) {
  if (state.busy || !canMark(iso, state.marks, todayISO())) return;

  $("choose-title").textContent = formatDay(iso);
  const choice = await ask($("choose-dialog"));
  if (choice !== "yes" && choice !== "no") return;
  const hadSugar = choice === "yes";

  const used = sugarCount(state.marks);
  $("confirm-text").textContent =
    `Mark ${formatDay(iso)} as "${hadSugar ? "Had sugar" : "No sugar"}"? This can't be changed later.`;
  $("confirm-warn").textContent = !hadSugar ? ""
    : used >= MAX_SUGAR
      ? `This is sugar day #${used + 1} — your tracker will be LOCKED.`
      : `This uses chance ${used + 1} of ${MAX_SUGAR}.`;
  if ((await ask($("confirm-dialog"))) !== "confirm") return;

  state.busy = true;
  const { data, error } = await supabase.rpc("mark_day", { p_day: iso, p_had_sugar: hadSugar, p_tz: timeZone });
  state.busy = false;

  if (error) {
    toast(error.message, true);
    return loadMarks(); // resync with the server's truth
  }
  state.marks[iso] = hadSugar;
  render({ justMarked: iso });
  loadBoard();
  chat.refresh(); // pick up any milestone post

  if (data.locked) {
    showFact("Game over — tracker locked", pick(GAME_OVER), "bad");
  } else if (hadSugar) {
    const left = data.max_sugar - data.sugar_count;
    showFact(`Sugar day saved · ${left} ${left === 1 ? "life" : "lives"} left`,
      pick(left === 0 ? LAST_LIFE : SLIP), "bad");
  } else {
    const streak = currentStreak(state.marks, todayISO());
    showFact(streak >= 2 ? `No sugar · ${streak}-day streak!` : "No sugar — saved!", pick(CLEAN), "good");
  }
}

// ---------- Leaderboard ----------
async function loadBoard() {
  const { data, error } = await supabase.rpc("leaderboard");
  const card = document.querySelector(".board");
  if (error || !Array.isArray(data)) { card.hidden = true; return; } // function not deployed yet
  card.hidden = false;
  renderBoard(data);
}

function renderBoard(rows) {
  const list = $("board-list");
  list.replaceChildren();
  rows.forEach((r, i) => {
    const li = document.createElement("li");
    li.className = "board-row" + (r.is_me ? " me" : "") + (r.locked ? " out" : "");
    li.style.setProperty("--i", i);
    const lives = Math.max(0, MAX_SUGAR - r.sugar_days);
    const medal = r.locked ? "–" : ["🥇", "🥈", "🥉"][i] ?? String(i + 1);

    const rank = Object.assign(document.createElement("span"), { className: "rank", textContent: medal });
    const av = Object.assign(document.createElement("span"), { className: "avatar sm", textContent: (r.name || "?").charAt(0).toUpperCase() });
    const who = document.createElement("span");
    who.className = "who";
    const nm = Object.assign(document.createElement("span"), { className: "nm", textContent: r.name });
    const sub = Object.assign(document.createElement("span"), {
      className: "sub",
      textContent: r.locked ? "Game over" : "❤️".repeat(lives) + "🖤".repeat(MAX_SUGAR - lives),
    });
    who.append(nm, sub);
    if (r.is_me) nm.append(Object.assign(document.createElement("em"), { textContent: " you" }));

    const stats = document.createElement("span");
    stats.className = "stats";
    stats.innerHTML = `<b title="Current no-sugar streak">🔥 ${r.streak}</b><b title="No-sugar days">✅ ${r.clean_days}</b>`;

    let dm = document.createElement("span"); // keeps the grid aligned on your own row
    if (!r.is_me && r.user_id) {
      dm = Object.assign(document.createElement("button"), {
        type: "button", className: "secondary board-dm", textContent: "💬", title: `Message ${r.name}`,
      });
      dm.setAttribute("aria-label", `Message ${r.name}`);
      dm.addEventListener("click", () => chat.openDM({ id: r.user_id, name: r.name }));
    }

    li.append(rank, av, who, stats, dm);
    list.append(li);
  });
  $("board-empty").hidden = rows.length > 1;
  replay(list);
}

// ---------- Render ----------
function displayName(user) {
  return user?.user_metadata?.name || user?.email?.split("@")[0] || "Player";
}

let shownLives = null; // lives on screen last render, to animate the heart that just broke
function renderPlayer(used, locked) {
  const lives = chancesLeft(state.marks);
  $("player-name").textContent = displayName(state.user);

  const hearts = $("hearts");
  hearts.replaceChildren();
  for (let i = 0; i < MAX_SUGAR; i++) {
    const h = document.createElement("span");
    const alive = i < lives;
    h.className = "heart" + (alive ? " alive" : " lost");
    h.style.setProperty("--i", i);
    h.textContent = alive ? "❤️" : "💔";
    if (!alive && shownLives !== null && i >= lives && i < shownLives) h.classList.add("breaking");
    hearts.append(h);
  }
  hearts.setAttribute("aria-label", `${lives} of ${MAX_SUGAR} lives left`);
  hearts.classList.toggle("dead", locked);
  if (locked && shownLives !== null && !hearts.dataset.over) {
    hearts.dataset.over = "1";
    replay(hearts, "shake");
  }

  const text = locked
    ? `Game over — ${used} sugar days`
    : lives === 0
      ? "Last chance used — no more sugar!"
      : `${lives} of ${MAX_SUGAR} lives left`;
  if ($("chances").textContent !== text) {
    $("chances").textContent = text;
    replay($("chances"), "swap");
  }
  shownLives = lives;

  const streak = currentStreak(state.marks, todayISO());
  const s = $("streak");
  const streakText = streak >= 1 ? `🔥 ${streak}-day no-sugar streak` : "";
  if (s.textContent !== streakText) { s.textContent = streakText; if (streakText) replay(s, "swap"); }
  s.hidden = !streakText || locked;
}

/**
 * opts.animate    – stagger the day cells in (first load)
 * opts.dir        – -1 / 1 slide direction for month changes
 * opts.justMarked – ISO day that was just saved (pop + burst)
 */
function render(opts = {}) {
  const today = todayISO();
  const locked = isLocked(state.marks);
  const used = sugarCount(state.marks);

  renderPlayer(used, locked);
  const banner = $("locked-banner");
  if (banner.hidden && locked) replay(banner);
  banner.hidden = !locked;

  const y = state.view.getFullYear(), m = state.view.getMonth();
  $("month-label").textContent = state.view.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const now = new Date();
  $("next").disabled = y > now.getFullYear() || (y === now.getFullYear() && m >= now.getMonth());

  const body = $("cal-body");
  body.replaceChildren();
  let n = 0, marked = null;
  for (const week of monthGrid(y, m)) {
    const tr = document.createElement("tr");
    for (const iso of week) {
      const td = document.createElement("td");
      if (iso) {
        const b = document.createElement("button");
        const isToday = iso === today, isFuture = iso > today;
        b.className = "day";
        b.style.setProperty("--i", n++);
        const num = Object.assign(document.createElement("span"), { className: "num", textContent: Number(iso.slice(8)) });
        b.append(num);
        if (iso in state.marks) {
          b.classList.add(state.marks[iso] ? "yes" : "no");
          b.append(Object.assign(document.createElement("span"), { className: "tick", textContent: state.marks[iso] ? "✕" : "✓" }));
        }
        if (isToday) {
          b.classList.add("today");
          if (!(iso in state.marks)) b.append(Object.assign(document.createElement("span"), { className: "tag", textContent: "today ⏳" }));
        }
        if (isFuture) b.classList.add("future");
        if (iso === opts.justMarked) { b.classList.add("just-marked"); marked = b; }

        if ((isToday || isFuture) && !(iso in state.marks)) {
          // Not markable yet: answer pokes with a playful bubble instead.
          b.classList.add("nope");
          b.setAttribute("aria-disabled", "true");
          b.setAttribute("aria-label", `${formatDay(iso)} — not over yet`);
          b.addEventListener("click", () => poke(b, isToday));
          b.addEventListener("mouseenter", () => poke(b, isToday, true));
          b.addEventListener("mouseleave", hideBubble);
        } else {
          b.disabled = !canMark(iso, state.marks, today);
          b.title = iso in state.marks ? (state.marks[iso] ? "Had sugar" : "No sugar")
            : locked ? "Locked" : "Click to mark";
          b.addEventListener("click", () => onDayClick(iso));
        }
        td.append(b);
      }
      tr.append(td);
    }
    body.append(tr);
  }

  body.classList.remove("enter", "from-left", "from-right");
  if (opts.animate || opts.dir) {
    if (opts.dir) body.classList.add(opts.dir > 0 ? "from-right" : "from-left");
    replay(body);
    replay($("month-label"), "swap");
  }
  if (marked && state.marks[opts.justMarked] === false) burst(marked);
}

// ---------- "Not yet" speech bubble ----------
const bubble = Object.assign(document.createElement("div"), { className: "bubble", role: "status", hidden: true });
document.body.append(bubble);
let bubbleTimer, bubbleFor = null;

function poke(cell, isToday, fromHover = false) {
  if (fromHover && bubbleFor === cell && !bubble.hidden) return; // keep the same line while hovering
  bubbleFor = cell;
  bubble.textContent = pick(isToday ? TODAY_LINES : FUTURE_LINES);
  bubble.hidden = false;
  const r = cell.getBoundingClientRect();
  const w = Math.min(260, innerWidth - 24);
  bubble.style.width = `${w}px`;
  bubble.style.left = `${Math.max(12, Math.min(innerWidth - w - 12, r.left + r.width / 2 - w / 2))}px`;
  bubble.style.setProperty("--arrow", `${r.left + r.width / 2 - parseFloat(bubble.style.left)}px`);
  bubble.style.top = `${r.top - 10}px`;
  replay(bubble, "show");
  if (!fromHover) replay(cell, "wiggle");
  clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(hideBubble, fromHover ? 4000 : 3000);
}
function hideBubble() {
  clearTimeout(bubbleTimer);
  bubble.hidden = true;
  bubbleFor = null;
}
addEventListener("scroll", hideBubble, { passive: true });

function changeMonth(dir) {
  state.view = new Date(state.view.getFullYear(), state.view.getMonth() + dir, 1);
  render({ dir });
}

// ---------- Wire up ----------
$("signin-form").addEventListener("submit", signIn);
$("signup-form").addEventListener("submit", signUp);
$("verify-check").addEventListener("click", (e) => busy(e.currentTarget, "Checking…", () => checkConfirmed(true)));
$("verify-resend").addEventListener("click", resend);
document.querySelectorAll("[data-go]").forEach((b) =>
  b.addEventListener("click", () => { pending = null; showScreen(b.dataset.go); }));
$("signout").addEventListener("click", () => { hideFact(); supabase.auth.signOut(); });
$("fact").addEventListener("click", hideFact);
$("prev").addEventListener("click", () => changeMonth(-1));
$("next").addEventListener("click", () => changeMonth(1));

const { data: { session } } = await supabase.auth.getSession();
if (!viewShown) { // the auth listener may already have rendered
  state.user = session?.user ?? null;
  showView();
}
