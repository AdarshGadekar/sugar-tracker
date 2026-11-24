// Day planner: a 24-hour timetable of custom-length blocks (to-dos with notes), one page per day.
// Lives on the truck as the order-ticket clipboard on the cab door. Data: supabase table time_blocks
// (supabase/timetable.sql), private to each user. Pure logic is in planner-core.js.
import { DAY_MIN, TAGS, fmt, parse, parseEnd, dur, snap, validate, layout, gaps, summary, nowAndNext, suggest } from "./planner-core.js";
import { todayISO } from "./calendar.js";

const PX = 1.1;                                       // timeline pixels per minute (24 h ≈ 1580 px, scrolls)
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

function shiftDay(iso, n) {
  const [y, m, d] = iso.split("-").map(Number);
  return todayISO(new Date(y, m - 1, d + n));
}
function dayLabel(iso) {
  const today = todayISO();
  if (iso === today) return "Today";
  if (iso === shiftDay(today, 1)) return "Tomorrow";
  if (iso === shiftDay(today, -1)) return "Yesterday";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}
const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };

/** A plain-words reason for a failed request (instead of a generic "couldn't save"). */
function why(error) {
  const code = error?.code || "", msg = String(error?.message || "");
  if (code === "42P01" || code === "PGRST205" || /time_blocks/.test(msg) && /exist|schema cache/i.test(msg)) {
    return "The planner isn't set up on the server yet (its database table is missing).";
  }
  if (code === "42501" || code === "28000" || /JWT|not signed in|permission/i.test(msg)) return "You're signed out. Sign in again and retry.";
  if (code === "23514") return "One of the values isn't allowed (check the times, name and notes length).";
  if (/fetch|network|Failed to fetch/i.test(msg)) return "No connection. Check your internet and try again.";
  return `Couldn't save that${msg ? `: ${msg}` : "."}`;
}

export function mountPlanner({ supabase, toast }) {
  const root = $("planner");
  if (!root) return { start() {}, stop() {} };
  const item = root.closest(".closeup-item");
  const tl = $("pl-timeline"), scroller = $("pl-scroll"), form = $("pl-form");
  const st = { user: null, day: todayISO(), blocks: [], cache: new Map(), editing: null, busy: false };

  // ---------- data ----------
  async function load(day, { force = false } = {}) {
    if (!st.user) return;
    if (!force && st.cache.has(day)) { if (day === st.day) { st.blocks = st.cache.get(day); render(); } }
    const { data, error } = await supabase.from("time_blocks").select("*").eq("day", day).order("start_min");
    if (error) { if (day === st.day) showError(why(error).replace("Couldn't save that", "Couldn't load your plan")); return; }
    st.cache.set(day, data);
    if (day === st.day) { st.blocks = data; render(); }
    if (day === todayISO()) renderMini();
  }
  const setBlocks = (blocks) => { st.blocks = blocks; st.cache.set(st.day, blocks); render(); if (st.day === todayISO()) renderMini(); };

  async function save(fields) {
    const err = validate(fields);
    if (err) return formMsg(err);
    st.busy = true; form.classList.add("busy");
    const row = { title: fields.title.trim(), notes: fields.notes.trim(), tag: fields.tag, done: fields.done,
      start_min: fields.start_min, end_min: fields.end_min };
    const q = st.editing?.id
      ? supabase.from("time_blocks").update(row).eq("id", st.editing.id).select().single()
      : supabase.from("time_blocks").insert({ ...row, day: st.day }).select().single();
    const { data, error } = await q;
    st.busy = false; form.classList.remove("busy");
    if (error) return formMsg(why(error));
    setBlocks([...st.blocks.filter((b) => b.id !== data.id), data].sort((a, b) => a.start_min - b.start_min));
    closeForm();
    flash(data.id);
  }

  async function remove(id) {
    const keep = st.blocks;
    setBlocks(st.blocks.filter((b) => b.id !== id));             // feels instant; put it back if it fails
    closeForm();
    const { error } = await supabase.from("time_blocks").delete().eq("id", id);
    if (error) { setBlocks(keep); toast?.(why(error).replace("Couldn't save that", "Couldn't delete that"), true); }
  }

  async function toggleDone(b) {
    const done = !b.done;
    setBlocks(st.blocks.map((x) => (x.id === b.id ? { ...x, done } : x)));
    const { error } = await supabase.from("time_blocks").update({ done }).eq("id", b.id).select().single();
    if (error) { setBlocks(st.blocks.map((x) => (x.id === b.id ? { ...x, done: !done } : x))); toast?.(why(error), true); }
  }

  // ---------- timeline ----------
  function render() {
    $("pl-day").textContent = dayLabel(st.day);
    $("pl-date").textContent = (() => { const [y, m, d] = st.day.split("-").map(Number);
      return new Date(y, m - 1, d).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" }); })();
    $("pl-today").hidden = st.day === todayISO();
    $("pl-error").hidden = true;

    // 24 h bar + totals
    const s = summary(st.blocks);
    const segs = st.blocks.map((b) => `<i class="tag-${b.tag}${b.done ? " done" : ""}" style="left:${(b.start_min / DAY_MIN) * 100}%;width:${((b.end_min - b.start_min) / DAY_MIN) * 100}%"></i>`).join("");
    const nowMark = st.day === todayISO() ? `<b class="pl-bar-now" style="left:${(nowMin() / DAY_MIN) * 100}%"></b>` : "";
    $("pl-bar").innerHTML = segs + nowMark;
    $("pl-totals").innerHTML = `<span><b>${dur(s.planned)}</b> planned</span><span><b>${dur(s.done)}</b> done</span>`
      + `<span><b>${dur(s.free)}</b> free</span>`;

    // hour lines
    let html = "";
    for (let h = 0; h <= 24; h++) html += `<div class="pl-hour" style="top:${h * 60 * PX}px"><span>${fmt(h * 60)}</span></div>`;
    // free gaps: a quiet "+ add" hint in each one that's long enough
    for (const g of gaps(st.blocks)) {
      if (g.end - g.start < 30) continue;
      html += `<button type="button" class="pl-gap" data-s="${g.start}" data-e="${g.end}" style="top:${g.start * PX}px;height:${(g.end - g.start) * PX}px">`
        + `<span>+ ${dur(g.end - g.start)} free</span></button>`;
    }
    // blocks
    const MIN_H = 24;                                    // a 5-minute block still needs room to read and tick
    for (const { block: b, col, cols, span } of layout(st.blocks)) {
      const h = Math.max((b.end_min - b.start_min) * PX, MIN_H);
      const t = TAGS[b.tag] || TAGS.other;
      html += `<div class="pl-block tag-${b.tag}${b.done ? " done" : ""}${h < 40 ? " tiny" : ""}" data-id="${b.id}" tabindex="0" role="button"
          aria-label="${esc(b.title)}, ${fmt(b.start_min)} to ${fmt(b.end_min)}${b.done ? ", done" : ""}"
          style="top:${b.start_min * PX}px;height:${h}px;left:calc(var(--gutter) + (100% - var(--gutter)) * ${col / cols});width:calc((100% - var(--gutter)) * ${span / cols} - 4px)">
        <button type="button" class="pl-tick" aria-label="${b.done ? "Mark not done" : "Mark done"}" aria-pressed="${b.done}">${b.done ? "✓" : ""}</button>
        <div class="pl-block-text">
          <strong>${t.emoji} ${esc(b.title)}</strong>
          <small>${fmt(b.start_min)}–${fmt(b.end_min)} · ${dur(b.end_min - b.start_min)}</small>
          ${b.notes ? `<p>${esc(b.notes)}</p>` : ""}
        </div>
      </div>`;
    }
    if (st.day === todayISO()) html += `<div class="pl-now" style="top:${nowMin() * PX}px"><span>${fmt(nowMin())}</span></div>`;
    tl.innerHTML = html;
    tl.style.height = `${DAY_MIN * PX}px`;
    $("pl-empty").hidden = st.blocks.length > 0;
  }

  function flash(id) {
    const el = tl.querySelector(`[data-id="${CSS.escape(id)}"]`);
    if (el && !reduceMotion) { el.classList.remove("pop"); void el.offsetWidth; el.classList.add("pop"); }
  }

  function scrollToStart() {
    const target = st.day === todayISO() ? nowMin() - 90 : (st.blocks[0]?.start_min ?? 8 * 60) - 30;
    scroller.scrollTop = Math.max(0, target * PX);
  }

  // draw a block by dragging on the timeline (mouse / pen); a tap opens the editor for that free stretch
  let draw = null;
  const minAt = (e) => snap((e.clientY - tl.getBoundingClientRect().top) / PX);
  tl.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || e.target.closest(".pl-block")) return;
    draw = { y0: e.clientY, start: minAt(e), end: null, touch: e.pointerType === "touch", el: null };
    if (!draw.touch) tl.setPointerCapture(e.pointerId);
  });
  tl.addEventListener("pointermove", (e) => {
    if (!draw || draw.touch || Math.abs(e.clientY - draw.y0) < 8) return;
    draw.end = minAt(e);
    const a = Math.min(draw.start, draw.end), b = Math.max(draw.start, draw.end);
    if (!draw.el) { draw.el = document.createElement("div"); draw.el.className = "pl-draft"; tl.append(draw.el); }
    draw.el.style.top = `${a * PX}px`; draw.el.style.height = `${Math.max(b - a, 5) * PX}px`;
    draw.el.textContent = `${fmt(a)}–${fmt(b)}`;
  });
  tl.addEventListener("pointerup", (e) => {
    if (!draw) return;
    const d = draw; draw = null;
    d.el?.remove();
    if (d.touch && Math.abs(e.clientY - d.y0) > 10) return;      // that was a scroll
    if (d.end != null && Math.abs(d.end - d.start) >= 10) {
      return openForm(null, { start_min: Math.min(d.start, d.end), end_min: Math.max(d.start, d.end) });
    }
    const at = d.start;
    const gap = gaps(st.blocks).find((g) => g.start <= at && at < g.end);
    if (gap) openForm(null, suggest({ start: Math.max(gap.start, Math.floor(at / 30) * 30), end: gap.end }));
  });
  tl.addEventListener("pointercancel", () => { draw?.el?.remove(); draw = null; });

  tl.addEventListener("click", (e) => {
    const tick = e.target.closest(".pl-tick");
    const blockEl = e.target.closest(".pl-block");
    if (tick && blockEl) { e.stopPropagation(); return toggleDone(st.blocks.find((b) => b.id === blockEl.dataset.id)); }
    if (blockEl) return openForm(st.blocks.find((b) => b.id === blockEl.dataset.id));
    // keyboard (Enter/Space on a free slot): mouse and touch are handled by pointerup above
    const gapEl = e.target.closest(".pl-gap");
    if (gapEl && e.detail === 0) {
      openForm(null, suggest({ start: +gapEl.dataset.s, end: +gapEl.dataset.e }, st.day === todayISO() ? nowMin() : null));
    }
  });
  tl.addEventListener("keydown", (e) => {
    const blockEl = e.target.closest(".pl-block");
    if (e.target.closest(".pl-tick")) return;                 // the tick is its own button: Enter ticks it
    if (blockEl && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); openForm(st.blocks.find((b) => b.id === blockEl.dataset.id)); }
  });

  // ---------- editor ----------
  const f = form.elements;
  function openForm(block, range) {
    st.editing = block || null;
    const b = block || { title: "", notes: "", tag: "work", done: false, ...range };
    f.title.value = b.title;
    f.start.value = fmt(b.start_min);
    f.end.value = b.end_min === DAY_MIN ? "00:00" : fmt(b.end_min);
    f.notes.value = b.notes || "";
    f.done.checked = !!b.done;
    form.querySelectorAll("[name=tag]").forEach((r) => (r.checked = r.value === b.tag));
    $("pl-form-title").textContent = block ? "Edit block" : "New block";
    $("pl-delete").hidden = !block;
    formMsg("");
    root.classList.add("editing");
    form.hidden = false;
    requestAnimationFrame(() => f.title.focus());
  }
  function closeForm() { form.hidden = true; root.classList.remove("editing"); st.editing = null; }
  function formMsg(text) { $("pl-msg").textContent = text; }
  const fields = () => {
    const start_min = parse(f.start.value);
    return { title: f.title.value, notes: f.notes.value, done: f.done.checked,
      tag: form.querySelector("[name=tag]:checked")?.value || "other",
      start_min, end_min: parseEnd(f.end.value, start_min ?? 0) };
  };
  form.addEventListener("submit", (e) => { e.preventDefault(); if (!st.busy) save(fields()); });
  $("pl-cancel").addEventListener("click", closeForm);
  $("pl-delete").addEventListener("click", () => st.editing && remove(st.editing.id));
  form.querySelectorAll("[data-len]").forEach((btn) => btn.addEventListener("click", () => {
    const s = parse(f.start.value);
    if (s == null) return;
    const end = Math.min(DAY_MIN, s + Number(btn.dataset.len));
    f.end.value = end === DAY_MIN ? "00:00" : fmt(end);
  }));
  form.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.stopPropagation(); closeForm(); } });

  // ---------- header ----------
  const go = (day) => { st.day = day; closeForm(); st.blocks = st.cache.get(day) || []; render(); scrollToStart(); load(day); };
  $("pl-prev").addEventListener("click", () => go(shiftDay(st.day, -1)));
  $("pl-next").addEventListener("click", () => go(shiftDay(st.day, 1)));
  $("pl-today").addEventListener("click", () => go(todayISO()));
  $("pl-add").addEventListener("click", () => {
    const free = gaps(st.blocks);
    const at = st.day === todayISO() ? nowMin() : 9 * 60;
    const gap = free.find((g) => g.end > at) || free.at(-1) || { start: at, end: Math.min(DAY_MIN, at + 60) };
    openForm(null, suggest(gap, at));
  });
  function showError(text) { $("pl-error").textContent = text; $("pl-error").hidden = false; }

  // opened as a close-up: refresh and jump to "now"
  new MutationObserver(() => {
    if (item && !item.hidden) { if (st.day !== todayISO() && !st.blocks.length) st.day = todayISO(); render(); scrollToStart(); load(st.day, { force: true }); }
    else closeForm();
  }).observe(item, { attributes: true, attributeFilter: ["hidden"] });

  // ---------- the clipboard on the truck: what's on now, what's next ----------
  function renderMini() {
    const el = $("mini-plan");
    if (!el) return;
    const today = st.cache.get(todayISO()) || [];
    const { now, next } = nowAndNext(today, nowMin());
    const line = (label, b) => b
      ? `<span class="tk-row"><em>${label}</em><b>${esc(b.title)}</b><small>${fmt(b.start_min)}–${fmt(b.end_min)}</small></span>` : "";
    const s = summary(today);
    el.innerHTML = today.length
      ? line("NOW", now) + line("NEXT", next) + (now || next ? "" : `<span class="tk-row"><b>All done for today 🎉</b></span>`)
        + `<span class="tk-foot">${s.ticked}/${s.count} done</span>`
      : `<span class="tk-row"><b>Plan your day</b><small>tap to add</small></span>`;
  }

  let timer = null;
  return {
    start(user) {
      st.user = user; st.cache.clear(); st.day = todayISO();
      load(st.day, { force: true });
      clearInterval(timer);
      timer = setInterval(() => { renderMini(); if (!item.hidden && st.day === todayISO() && form.hidden) render(); }, 60_000);
    },
    stop() { st.user = null; st.cache.clear(); st.blocks = []; clearInterval(timer); renderMini(); },
  };
}
