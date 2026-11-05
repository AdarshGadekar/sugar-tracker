// Chat: one group room + private 1-to-1 direct messages, live via Supabase Realtime.
// Works the same against the real client and the local mock.

const LIMIT = 100;
const COLS = "id, user_id, name, body, kind, created_at";
const DM_COLS = "id, sender_id, recipient_id, body, created_at, read_at";

/**
 * Parse timestamps from both REST ("2026-11-05T08:50:30.565778+00:00") and
 * Realtime ("2026-11-05 08:50:30.565778", sometimes without a zone). Never throws.
 */
export function toDate(value) {
  if (value instanceof Date) return value;
  let s = String(value ?? "").trim().replace(" ", "T").replace(/(\.\d{3})\d+/, "$1");
  s = s.replace(/([+-]\d\d)$/, "$1:00");              // "+00" -> "+00:00"
  if (s && !/(Z|[+-]\d\d:?\d\d)$/i.test(s)) s += "Z"; // no zone -> UTC
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

/** Normalise a row so every created_at is a proper ISO string. */
const normalise = (m) => ({ ...m, created_at: toDate(m.created_at).toISOString() });

export function createChat({ supabase, $, replay }) {
  const panel = $("chat"), list = $("chat-list"), threadsEl = $("dm-threads");
  const form = $("chat-form"), input = $("chat-input"), errEl = $("chat-error");
  const badge = $("chat-badge"), backBtn = $("chat-back");

  let me = null, channel = null, open = false;
  let view = "group";          // "group" | "threads" | "thread"
  let other = null;            // { id, name } when view === "thread"
  let group = [];              // group messages, oldest -> newest
  let thread = [];             // current DM thread, in the same shape as group messages
  let threads = [];            // conversation list from dm_threads()
  let lastSeenId = 0;          // last group message seen

  const seenKey = () => `sugar_chat_seen_${me?.id}`;
  const loadSeen = () => { try { return Number(localStorage.getItem(seenKey())) || 0; } catch { return 0; } };
  const saveSeen = (id) => { try { localStorage.setItem(seenKey(), String(id)); } catch { /* ignore */ } };

  // DM rows -> the same shape the bubble renderer uses
  const fromDm = (d) => normalise({
    id: d.id, user_id: d.sender_id, kind: "user", body: d.body, created_at: d.created_at,
    name: d.sender_id === me?.id ? "You" : other?.name || "Player",
    _dm: true, _other: d.sender_id === me?.id ? d.recipient_id : d.sender_id,
  });

  // ---------- rendering ----------
  const timeFmt = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
  const dayFmt = new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", month: "short" });
  const initial = (name) => (name || "?").charAt(0).toUpperCase();

  function bubbleFor(m, prev) {
    const li = document.createElement("li");
    li.dataset.id = m.id;
    const at = toDate(m.created_at);

    if (m.kind === "system") {
      li.className = "msg system";
      li.textContent = m.body;
      return li;
    }

    const mine = m.user_id === me?.id;
    const grouped = prev && prev.kind === "user" && prev.user_id === m.user_id
      && at - toDate(prev.created_at) < 5 * 60 * 1000;
    li.className = "msg" + (mine ? " mine" : "") + (grouped ? " grouped" : "");

    if (!mine && !grouped) {
      li.append(Object.assign(document.createElement("span"), { className: "avatar xs", textContent: initial(m.name) }));
    }
    const box = document.createElement("div");
    box.className = "msg-box";
    if (!grouped) {
      const head = document.createElement("div");
      head.className = "msg-head";
      head.append(
        Object.assign(document.createElement("strong"), { textContent: mine ? "You" : m.name }),
        Object.assign(document.createElement("time"), { textContent: timeFmt.format(at), dateTime: m.created_at }),
      );
      box.append(head);
    }
    box.append(Object.assign(document.createElement("p"), { className: "msg-text", textContent: m.body }));
    if (mine) {
      const del = Object.assign(document.createElement("button"), {
        type: "button", className: "msg-del", textContent: "Delete", title: "Delete message",
      });
      del.addEventListener("click", () => remove(m));
      box.append(del);
    }
    li.append(box);
    return li;
  }

  const dayDivider = (d) => Object.assign(document.createElement("li"), { className: "msg-day", textContent: dayFmt.format(d) });
  const current = () => (view === "thread" ? thread : group);

  function renderMessages() {
    const msgs = current();
    list.replaceChildren();
    let prev = null;
    for (const m of msgs) {
      if (!prev || toDate(prev.created_at).toDateString() !== toDate(m.created_at).toDateString()) {
        list.append(dayDivider(toDate(m.created_at)));
        prev = null;
      }
      list.append(bubbleFor(m, prev));
      prev = m;
    }
    if (!msgs.length) {
      list.append(Object.assign(document.createElement("li"), {
        className: "msg-empty",
        textContent: view === "thread" ? `Say hi to ${other?.name} 👋` : "No messages yet. Say hi 👋",
      }));
    }
    toBottom();
  }

  function appendMessage(m) {
    const msgs = current();
    const prev = msgs.at(-1);
    const stick = nearBottom();
    msgs.push(m);
    if (list.querySelector(".msg-empty")) return renderMessages();
    if (!prev || toDate(prev.created_at).toDateString() !== toDate(m.created_at).toDateString()) {
      list.append(dayDivider(toDate(m.created_at)));
    }
    const li = bubbleFor(m, prev);
    li.classList.add("new");
    list.append(li);
    if (stick || m.user_id === me?.id) toBottom();
  }

  function renderThreads() {
    threadsEl.replaceChildren();
    if (!threads.length) {
      threadsEl.append(Object.assign(document.createElement("li"), {
        className: "msg-empty", textContent: "No one else here yet — invite a friend!",
      }));
      return;
    }
    for (const t of threads) {
      const li = document.createElement("li");
      const b = document.createElement("button");
      b.type = "button";
      b.className = "dm-row" + (t.unread ? " unread" : "");
      const preview = t.last_body ? (t.last_from_me ? "You: " : "") + t.last_body : "Start a conversation";
      b.innerHTML = `<span class="avatar sm"></span><span class="dm-who"><strong></strong><span class="dm-prev"></span></span>`
        + `<span class="dm-meta"><time></time>${t.unread ? `<span class="tab-badge">${t.unread > 9 ? "9+" : t.unread}</span>` : ""}</span>`;
      b.querySelector(".avatar").textContent = initial(t.name);
      b.querySelector("strong").textContent = t.name;
      b.querySelector(".dm-prev").textContent = preview;
      b.querySelector("time").textContent = t.last_at ? timeFmt.format(toDate(t.last_at)) : "";
      b.addEventListener("click", () => openThread({ id: t.user_id, name: t.name }));
      li.append(b);
      threadsEl.append(li);
    }
  }

  const nearBottom = () => list.scrollHeight - list.scrollTop - list.clientHeight < 80;
  const toBottom = () => { list.scrollTop = list.scrollHeight; };

  // ---------- unread badges ----------
  const groupUnread = () => group.filter((m) => m.id > lastSeenId && m.user_id !== me?.id).length;
  const dmUnread = () => threads.reduce((n, t) => n + (t.unread || 0), 0);
  const setBadge = (el, n) => { el.textContent = n > 9 ? "9+" : String(n); el.hidden = n === 0; };

  function updateBadges() {
    const g = view === "group" && open ? 0 : groupUnread();
    setBadge($("tab-badge-group"), g);
    setBadge($("tab-badge-direct"), dmUnread());
    setBadge(badge, open ? 0 : g + dmUnread());
  }

  function markGroupSeen() {
    const last = group.at(-1);
    if (last) { lastSeenId = Math.max(lastSeenId, last.id); saveSeen(lastSeenId); }
    updateBadges();
  }

  // ---------- views ----------
  function setView(v) {
    view = v;
    const isThread = v === "thread";
    list.hidden = v === "threads";
    threadsEl.hidden = v !== "threads";
    form.hidden = v === "threads";
    backBtn.hidden = !isThread;
    errEl.hidden = true;
    document.querySelectorAll("#chat [data-tab]").forEach((b) => {
      const on = b.dataset.tab === (v === "group" ? "group" : "direct");
      b.classList.toggle("on", on);
      b.setAttribute("aria-selected", String(on));
    });
    $("chat-title").textContent = isThread ? other.name : v === "group" ? "Group chat" : "Direct messages";
    $("chat-sub").textContent = isThread ? "Private — only you two can see this"
      : v === "group" ? "Everyone on Desserted" : "Private 1-to-1 chats";
    input.placeholder = isThread ? `Message ${other.name}…` : "Say something nice…";
    updateBadges();
  }

  async function showGroup() {
    setView("group");
    renderMessages();
    markGroupSeen();
  }

  async function showThreads() {
    other = null;
    setView("threads");
    await loadThreads();
  }

  async function openThread(person) {
    other = person;
    thread = [];
    setView("thread");
    renderMessages();
    const { data, error } = await supabase.rpc("dm_thread", { p_other: person.id });
    if (error) return showError("Couldn't load this conversation.");
    if (other?.id !== person.id) return; // switched away meanwhile
    thread = data.map(fromDm);
    renderMessages();
    input.focus({ preventScroll: true });
    await supabase.rpc("mark_dm_read", { p_other: person.id });
    const t = threads.find((x) => x.user_id === person.id);
    if (t) t.unread = 0;
    updateBadges();
  }

  // ---------- data ----------
  async function loadGroup() {
    const { data, error } = await supabase.from("messages").select(COLS)
      .order("created_at", { ascending: false }).limit(LIMIT);
    if (error) { showError("Chat isn't available right now."); return; }
    group = data.slice().reverse().map(normalise);
    if (view === "group") renderMessages();
    updateBadges();
  }

  async function loadThreads() {
    const { data, error } = await supabase.rpc("dm_threads");
    if (error) { threads = []; if (view === "threads") showError("Direct messages aren't available yet."); return; }
    threads = data;
    if (view === "threads") renderThreads();
    updateBadges();
  }

  // ---------- catch-up sync (safety net for Realtime) ----------
  // Free-tier Realtime sleeps when idle and can take minutes to resume; sockets also drop when a
  // laptop sleeps. So we also poll: every 3 s while the chat is open, every 15 s while it's closed.
  let syncing = false;
  async function sync() {
    if (!me || syncing) return;
    syncing = true;
    try {
      const { data } = await supabase.from("messages").select(COLS)
        .order("created_at", { ascending: false }).limit(LIMIT);
      if (Array.isArray(data)) {
        const fresh = data.slice().reverse().map(normalise);
        const ids = new Set(fresh.map((m) => m.id));
        const oldest = fresh[0]?.id ?? Infinity;
        const gone = group.filter((m) => m.id >= oldest && !ids.has(m.id));
        gone.forEach((m) => onGroupDelete(m.id));
        fresh.filter((m) => !group.some((x) => x.id === m.id)).forEach(onGroupInsert);
      }
      if (view === "thread" && other) {
        const who = other.id;
        const { data: dms } = await supabase.rpc("dm_thread", { p_other: who });
        if (Array.isArray(dms) && other?.id === who) {
          const ids = new Set(dms.map((d) => d.id));
          if (thread.some((m) => !ids.has(m.id))) { thread = thread.filter((m) => ids.has(m.id)); renderMessages(); }
          const added = dms.filter((d) => !thread.some((m) => m.id === d.id));
          added.forEach((d) => appendMessage(fromDm(d)));
          if (added.some((d) => d.sender_id !== me.id) && open) await supabase.rpc("mark_dm_read", { p_other: who });
        }
      }
      await loadThreads();
    } finally {
      syncing = false;
    }
  }

  let pollTimer = null;
  function schedulePoll() {
    clearTimeout(pollTimer);
    if (!me) return;
    const every = document.visibilityState === "hidden" ? 60000 : open ? 3000 : 15000;
    pollTimer = setTimeout(async () => { await sync(); schedulePoll(); }, every);
  }
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && me) { sync(); schedulePoll(); }
  });
  addEventListener("online", () => { if (me) { sync(); resubscribe(); } });

  // ---------- Realtime channel with auto-reconnect ----------
  let retryTimer = null;
  async function subscribe() {
    if (!me) return;
    try {
      const { data } = await supabase.auth.getSession();
      if (data?.session?.access_token) supabase.realtime?.setAuth?.(data.session.access_token);
    } catch { /* mock or offline: fine */ }
    if (!me || channel) return;
    const ch = supabase.channel("chat:" + me.id + ":" + Date.now())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (p) => onGroupInsert(p.new))
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "messages" }, (p) => onGroupDelete(p.old?.id))
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "direct_messages" }, (p) => onDmInsert(p.new))
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "direct_messages" }, (p) => onDmDelete(p.old?.id));
    channel = ch;
    ch.subscribe((status) => {
      if (ch !== channel) return; // an old channel we already replaced — ignore its events
      if (status === "SUBSCRIBED") sync(); // catch anything missed while (re)connecting
      if (["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(status)) {
        clearTimeout(retryTimer);
        retryTimer = setTimeout(resubscribe, 4000);
      }
    });
  }
  function resubscribe() {
    if (!me) return;
    const old = channel;
    channel = null;
    if (old) supabase.removeChannel(old);
    subscribe();
  }

  function onGroupInsert(raw) {
    if (!raw || raw.id == null) return;
    const m = normalise(raw);
    if (group.some((x) => x.id === m.id)) return;
    if (view === "group") appendMessage(m); else group.push(m);
    if (open && view === "group") markGroupSeen();
    else { updateBadges(); if (m.user_id !== me?.id) replay($("chat-toggle"), "ping"); }
  }

  function onGroupDelete(id) {
    group = group.filter((m) => m.id !== id);
    if (view === "group") renderMessages();
    updateBadges();
  }

  function onDmInsert(raw) {
    if (!raw || raw.id == null || !me) return;
    const otherId = raw.sender_id === me.id ? raw.recipient_id : raw.sender_id;
    if (view === "thread" && other?.id === otherId) {
      if (thread.some((x) => x.id === raw.id)) return;
      appendMessage(fromDm(raw));
      if (raw.sender_id !== me.id && open) supabase.rpc("mark_dm_read", { p_other: otherId });
    } else if (raw.sender_id !== me.id) {
      const t = threads.find((x) => x.user_id === otherId);
      if (t) t.unread = (t.unread || 0) + 1;
      replay($("chat-toggle"), "ping");
    }
    loadThreads(); // refresh previews/order (and unread counts from the server)
  }

  function onDmDelete(id) {
    if (view === "thread" && thread.some((m) => m.id === id)) {
      thread = thread.filter((m) => m.id !== id);
      renderMessages();
    }
    loadThreads();
  }

  async function send(e) {
    e.preventDefault();
    const body = input.value.trim();
    if (!body) return;
    input.disabled = true;
    const res = view === "thread"
      ? await supabase.from("direct_messages").insert({ recipient_id: other.id, body }).select(DM_COLS).single()
      : await supabase.from("messages").insert({ body }).select(COLS).single();
    input.disabled = false;
    input.focus();
    if (res.error) {
      return showError(/slow down/i.test(res.error.message) ? res.error.message : "Couldn't send. Please try again.");
    }
    input.value = "";
    errEl.hidden = true;
    // show it right away; the Realtime copy is ignored as a duplicate
    if (view === "thread") { if (!thread.some((x) => x.id === res.data.id)) appendMessage(fromDm(res.data)); loadThreads(); }
    else onGroupInsert(res.data);
  }

  async function remove(m) {
    const table = m._dm ? "direct_messages" : "messages";
    const { error } = await supabase.from(table).delete().eq("id", m.id);
    if (error) return showError("Couldn't delete that message.");
    if (m._dm) onDmDelete(m.id); else onGroupDelete(m.id);
  }

  function showError(text) {
    errEl.textContent = text;
    errEl.hidden = false;
    replay(errEl, "nudge");
  }

  // ---------- emoji picker ----------
  const EMOJIS = ["😀", "😂", "🥹", "😍", "😎", "🤔", "😅", "😭", "😤", "🥳", "👍", "👏", "🙌", "💪", "🙏", "🤝",
    "❤️", "💔", "🔥", "✨", "🎉", "🏆", "✅", "❌", "🍫", "🍩", "🍰", "🍭", "🥗", "🍎", "💧", "🚶"];
  const pop = $("emoji-pop"), emojiBtn = $("emoji-btn");
  pop.append(...EMOJIS.map((e) => {
    const b = Object.assign(document.createElement("button"), { type: "button", textContent: e, role: "option" });
    b.addEventListener("click", () => {
      const s = input.selectionStart ?? input.value.length, t = input.selectionEnd ?? s;
      input.value = (input.value.slice(0, s) + e + input.value.slice(t)).slice(0, 500);
      input.focus();
      input.setSelectionRange(s + e.length, s + e.length);
    });
    return b;
  }));
  const setPop = (v) => { pop.hidden = !v; emojiBtn.setAttribute("aria-expanded", String(v)); if (v) replay(pop, "show"); };
  emojiBtn.addEventListener("click", () => setPop(pop.hidden));
  document.addEventListener("click", (e) => { if (!pop.hidden && !pop.contains(e.target) && e.target !== emojiBtn) setPop(false); });
  form.addEventListener("submit", () => setPop(false));

  // ---------- open / close ----------
  function setOpen(v) {
    open = v;
    panel.hidden = !v;
    $("chat-toggle").setAttribute("aria-expanded", String(v));
    if (v) {
      replay(panel, "show");
      if (view === "group") { toBottom(); markGroupSeen(); }
      if (view !== "threads") input.focus({ preventScroll: true });
      sync(); // catch up immediately on open
    } else setPop(false);
    updateBadges();
    schedulePoll(); // faster while open, slower while closed
  }

  $("chat-toggle").addEventListener("click", () => setOpen(!open));
  $("chat-close").addEventListener("click", () => setOpen(false));
  backBtn.addEventListener("click", showThreads);
  document.querySelectorAll("#chat [data-tab]").forEach((b) =>
    b.addEventListener("click", () => (b.dataset.tab === "group" ? showGroup() : showThreads())));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && open) setOpen(false); });
  form.addEventListener("submit", send);

  // ---------- lifecycle ----------
  return {
    async start(user) {
      if (me?.id === user.id && channel) return;
      this.stop();
      me = user;
      lastSeenId = loadSeen();
      setView("group");
      await Promise.all([loadGroup(), loadThreads()]);
      await subscribe();
      schedulePoll();
    },
    stop() {
      clearTimeout(pollTimer);
      clearTimeout(retryTimer);
      const old = channel;
      channel = null;
      if (old) supabase.removeChannel(old);
      me = null;
      group = []; thread = []; threads = []; other = null;
      setOpen(false);
      badge.hidden = true;
    },
    /** Open a private conversation (e.g. from the leaderboard). */
    openDM(person) {
      if (!me || !person?.id || person.id === me.id) return;
      setOpen(true);
      openThread(person);
    },
    /** Called after the user marks a day, so milestone posts show up even without Realtime. */
    refresh: () => (me ? loadGroup() : null),
  };
}
