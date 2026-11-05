import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/+esm";
import {
  MAX_SUGAR, monthGrid, todayISO, sugarCount, isLocked, chancesLeft, canMark, formatDay,
} from "./calendar.js";
import { mountSudoku } from "./sudoku.js";

mountSudoku(document.getElementById("sudoku"));

const cfg = window.SUGAR_CONFIG || {};
const $ = (id) => document.getElementById(id);

if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) {
  document.querySelector("main").innerHTML =
    '<div class="card">Missing config.js â€” copy config.example.js to config.js and add your Supabase URL and anon key.</div>';
  throw new Error("Missing Supabase config");
}

const supabase = createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

const state = {
  user: null,
  marks: {},            // { "YYYY-MM-DD": had_sugar }
  view: new Date(),     // month being shown
  busy: false,
};

// ---------- UI helpers ----------
let toastTimer;
function toast(text, isError = false) {
  const el = $("toast");
  el.textContent = text;
  el.className = "toast" + (isError ? " error" : "");
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 3500);
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
  document.querySelectorAll("[data-screen]").forEach((el) => (el.hidden = el.dataset.screen !== name));
  document.querySelectorAll("[data-screen] .msg").forEach((el) => (el.textContent = ""));
  if (name !== "verify") stopPolling();
  const first = document.querySelector(`[data-screen="${name}"] input`);
  if (first) first.focus();
}

function setMsg(scope, text, isError = true) {
  const el = scope.querySelector(".msg");
  el.textContent = text;
  el.classList.toggle("error", isError);
}

async function busy(button, label, fn) {
  const old = button.textContent;
  button.disabled = true;
  button.textContent = label;
  try { return await fn(); } finally { button.disabled = false; button.textContent = old; }
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
  setMsg(form, error.message === "Invalid login credentials" ? "Wrong email or password." : error.message);
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
  if (error) return setMsg(form, error.message);
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
  }, 15000);
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
  setMsg(box, isUnconfirmed(error) ? "Not confirmed yet — click the link in the email first." : error.message);
}

async function resend(e) {
  if (!pending) return;
  const box = document.querySelector('[data-screen="verify"]');
  const { error } = await busy(e.currentTarget, "Sending…", () =>
    supabase.auth.resend({ type: "signup", email: pending.email, options: { emailRedirectTo: redirectTo } }));
  setMsg(box, error ? error.message : "Sent again. Check spam too.", !!error);
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

function showView() {
  const signedIn = !!state.user;
  $("auth-view").hidden = signedIn;
  $("app-view").hidden = !signedIn;
  $("signout").hidden = !signedIn;
  if (signedIn) {
    pending = null;
    stopPolling();
    if (location.hash.includes("access_token")) history.replaceState(null, "", location.pathname);
    loadMarks();
  } else if (!pending) {
    showScreen("landing");
  }
}

// ---------- Data ----------
async function loadMarks() {
  const { data, error } = await supabase.from("day_marks").select("day, had_sugar");
  if (error) return toast("Could not load your days: " + error.message, true);
  state.marks = Object.fromEntries(data.map((r) => [r.day, r.had_sugar]));
  render();
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
      ? "This is sugar day #" + (used + 1) + " â€” your tracker will be LOCKED."
      : `This uses chance ${used + 1} of ${MAX_SUGAR}.`;
  if ((await ask($("confirm-dialog"))) !== "confirm") return;

  state.busy = true;
  const { data, error } = await supabase.rpc("mark_day", { p_day: iso, p_had_sugar: hadSugar });
  state.busy = false;

  if (error) {
    toast(error.message, true);
    return loadMarks(); // resync with the server's truth
  }
  state.marks[iso] = hadSugar;
  render();
  if (data.locked) toast("Saved. You've had sugar more than 3 times â€” your tracker is now locked.", true);
  else if (hadSugar) toast(`Saved: sugar day. ${data.sugar_count} of ${data.max_sugar} chances used.`);
  else toast("Saved: no sugar. Nice work!");
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
    h.className = "heart" + (alive ? "" : " lost");
    h.textContent = alive ? "❤️" : "💔";
    if (!alive && shownLives !== null && i >= lives && i < shownLives) h.classList.add("breaking");
    hearts.append(h);
  }
  hearts.setAttribute("aria-label", `${lives} of ${MAX_SUGAR} lives left`);
  hearts.classList.toggle("dead", locked);
  if (locked && shownLives !== null && !hearts.dataset.over) {
    hearts.dataset.over = "1";
    hearts.classList.add("shake");
  }

  $("chances").textContent = locked
    ? `Game over — ${used} sugar days`
    : lives === 0
      ? "Last chance used — no more sugar!"
      : `${lives} of ${MAX_SUGAR} lives left`;
  shownLives = lives;
}

function render() {
  const today = todayISO();
  const locked = isLocked(state.marks);
  const used = sugarCount(state.marks);

  renderPlayer(used, locked);
  $("locked-banner").hidden = !locked;

  const y = state.view.getFullYear(), m = state.view.getMonth();
  $("month-label").textContent = state.view.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const now = new Date();
  $("next").disabled = y > now.getFullYear() || (y === now.getFullYear() && m >= now.getMonth());

  const body = $("cal-body");
  body.replaceChildren();
  for (const week of monthGrid(y, m)) {
    const tr = document.createElement("tr");
    for (const iso of week) {
      const td = document.createElement("td");
      if (iso) {
        const b = document.createElement("button");
        b.className = "day";
        b.textContent = Number(iso.slice(8));
        if (iso in state.marks) b.classList.add(state.marks[iso] ? "yes" : "no");
        if (iso === today) b.classList.add("today");
        if (iso > today) b.classList.add("future");
        b.disabled = !canMark(iso, state.marks, today);
        b.title = iso in state.marks ? (state.marks[iso] ? "Had sugar" : "No sugar")
          : iso > today ? "Future" : locked ? "Locked" : "Click to mark";
        b.addEventListener("click", () => onDayClick(iso));
        td.append(b);
      }
      tr.append(td);
    }
    body.append(tr);
  }
}

// ---------- Wire up ----------
$("signin-form").addEventListener("submit", signIn);
$("signup-form").addEventListener("submit", signUp);
$("verify-check").addEventListener("click", (e) => busy(e.currentTarget, "Checking…", () => checkConfirmed(true)));
$("verify-resend").addEventListener("click", resend);
document.querySelectorAll("[data-go]").forEach((b) =>
  b.addEventListener("click", () => { pending = null; showScreen(b.dataset.go); }));
$("signout").addEventListener("click", () => supabase.auth.signOut());
$("prev").addEventListener("click", () => { state.view = new Date(state.view.getFullYear(), state.view.getMonth() - 1, 1); render(); });
$("next").addEventListener("click", () => { state.view = new Date(state.view.getFullYear(), state.view.getMonth() + 1, 1); render(); });

const { data: { session } } = await supabase.auth.getSession();
state.user = session?.user ?? null;
showView();
