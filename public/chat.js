// Group chat room: one room for everyone signed in, live via Supabase Realtime.
// Works the same against the real client and the local mock.

const LIMIT = 100;
const COLS = "id, user_id, name, body, kind, created_at";

export function createChat({ supabase, $, replay }) {
  const panel = $("chat");
  const list = $("chat-list");
  const form = $("chat-form");
  const input = $("chat-input");
  const badge = $("chat-badge");
  const errEl = $("chat-error");

  let me = null;
  let channel = null;
  let messages = [];       // oldest -> newest
  let lastSeenId = 0;
  let open = false;

  const seenKey = () => `sugar_chat_seen_${me?.id}`;
  const loadSeen = () => { try { return Number(localStorage.getItem(seenKey())) || 0; } catch { return 0; } };
  const saveSeen = (id) => { try { localStorage.setItem(seenKey(), String(id)); } catch { /* ignore */ } };

  // ---------- rendering ----------
  const timeFmt = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
  const dayFmt = new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", month: "short" });

  function bubbleFor(m, prev) {
    const li = document.createElement("li");
    li.dataset.id = m.id;
    const at = new Date(m.created_at);

    if (m.kind === "system") {
      li.className = "msg system";
      li.textContent = m.body;
      return li;
    }

    const mine = m.user_id === me?.id;
    const grouped = prev && prev.kind === "user" && prev.user_id === m.user_id
      && at - new Date(prev.created_at) < 5 * 60 * 1000;
    li.className = "msg" + (mine ? " mine" : "") + (grouped ? " grouped" : "");

    if (!mine && !grouped) {
      const av = Object.assign(document.createElement("span"), {
        className: "avatar xs", textContent: (m.name || "?").charAt(0).toUpperCase(),
      });
      li.append(av);
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
    const text = Object.assign(document.createElement("p"), { className: "msg-text", textContent: m.body });
    box.append(text);
    if (mine) {
      const del = Object.assign(document.createElement("button"), {
        type: "button", className: "msg-del", textContent: "Delete", title: "Delete message",
      });
      del.addEventListener("click", () => remove(m.id));
      box.append(del);
    }
    li.append(box);
    return li;
  }

  function dayDivider(date) {
    return Object.assign(document.createElement("li"), { className: "msg-day", textContent: dayFmt.format(date) });
  }

  function renderAll() {
    list.replaceChildren();
    let prev = null;
    for (const m of messages) {
      if (!prev || new Date(prev.created_at).toDateString() !== new Date(m.created_at).toDateString()) {
        list.append(dayDivider(new Date(m.created_at)));
        prev = null;
      }
      list.append(bubbleFor(m, prev));
      prev = m;
    }
    if (!messages.length) {
      list.append(Object.assign(document.createElement("li"), {
        className: "msg-empty", textContent: "No messages yet. Say hi 👋",
      }));
    }
  }

  const nearBottom = () => list.scrollHeight - list.scrollTop - list.clientHeight < 80;
  const toBottom = () => { list.scrollTop = list.scrollHeight; };

  function updateBadge() {
    const unread = messages.filter((m) => m.id > lastSeenId && m.user_id !== me?.id).length;
    badge.textContent = unread > 9 ? "9+" : String(unread);
    badge.hidden = unread === 0 || open;
  }

  function markSeen() {
    const last = messages.at(-1);
    if (last) { lastSeenId = Math.max(lastSeenId, last.id); saveSeen(lastSeenId); }
    updateBadge();
  }

  // ---------- data ----------
  async function load() {
    const { data, error } = await supabase.from("messages").select(COLS)
      .order("created_at", { ascending: false }).limit(LIMIT);
    if (error) { showError("Chat isn't available right now."); return; }
    messages = data.slice().reverse();
    renderAll();
    toBottom();
    updateBadge();
  }

  function onInsert(m) {
    if (messages.some((x) => x.id === m.id)) return;
    const stick = nearBottom();
    const prev = messages.at(-1);
    messages.push(m);
    if (list.querySelector(".msg-empty")) renderAll();
    else {
      if (!prev || new Date(prev.created_at).toDateString() !== new Date(m.created_at).toDateString()) {
        list.append(dayDivider(new Date(m.created_at)));
      }
      const li = bubbleFor(m, prev);
      li.classList.add("new");
      list.append(li);
    }
    if (stick || m.user_id === me?.id) toBottom();
    if (open) markSeen(); else { updateBadge(); replay($("chat-toggle"), "ping"); }
  }

  function onDelete(id) {
    messages = messages.filter((m) => m.id !== id);
    renderAll();
    updateBadge();
  }

  async function send(e) {
    e.preventDefault();
    const body = input.value.trim();
    if (!body) return;
    input.disabled = true;
    const { error } = await supabase.from("messages").insert({ body });
    input.disabled = false;
    input.focus();
    if (error) return showError(/2 seconds|slow down/i.test(error.message) ? "Slow down a little — one message every 2 seconds." : error.message);
    input.value = "";
    errEl.hidden = true;
  }

  async function remove(id) {
    const { error } = await supabase.from("messages").delete().eq("id", id);
    if (error) return showError("Couldn't delete that message.");
    onDelete(id);
  }

  function showError(text) {
    errEl.textContent = text;
    errEl.hidden = false;
    replay(errEl, "nudge");
  }

  // ---------- open / close ----------
  function setOpen(v) {
    open = v;
    panel.hidden = !v;
    $("chat-toggle").setAttribute("aria-expanded", String(v));
    document.body.classList.toggle("chat-open", v);
    if (v) { replay(panel, "show"); toBottom(); markSeen(); input.focus({ preventScroll: true }); }
    updateBadge();
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

  $("chat-toggle").addEventListener("click", () => setOpen(!open));
  $("chat-close").addEventListener("click", () => setOpen(false));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && open) setOpen(false); });
  form.addEventListener("submit", send);

  // ---------- lifecycle ----------
  return {
    async start(user) {
      if (me?.id === user.id && channel) return;
      this.stop();
      me = user;
      lastSeenId = loadSeen();
      await load();
      channel = supabase.channel("room:everyone")
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (p) => onInsert(p.new))
        .on("postgres_changes", { event: "DELETE", schema: "public", table: "messages" }, (p) => onDelete(p.old?.id))
        .subscribe();
    },
    stop() {
      if (channel) supabase.removeChannel(channel);
      channel = null;
      me = null;
      messages = [];
      setOpen(false);
      badge.hidden = true;
    },
    /** Called after the user marks a day, so milestone posts show up even without Realtime. */
    refresh: () => (me ? load() : null),
  };
}
