// LOCAL MOCK BACKEND — only used on localhost with ?mock in the URL.
// Mimics the parts of supabase-js the app uses, with the same rules as supabase/schema.sql.
// Everything lives in this browser's localStorage; nothing is sent anywhere.
//
// Seeded test user (mock only — not a real account), starts with an empty calendar:
//   test@sugar.test / test1234
// Sign up with any new email: it "confirms" itself 6 seconds later.
// Sign up with an email containing "ratelimit" to see the rate-limit error.

import { currentStreak } from "./calendar.js";

const KEY = "sugar_mock_v3";
const MAX_SUGAR = 3;
const CONFIRM_AFTER_MS = 6000;

const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return iso(d); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function seed() {
  return {
    users: {
      "test@sugar.test": { id: "u-test", password: "test1234", name: "Test User", confirmAt: 0 },
    },
    marks: {},
    session: null,
  };
}

function load() {
  try { ["sugar_mock_v1", "sugar_mock_v2"].forEach((k) => localStorage.removeItem(k)); } catch { /* ignore */ }
  try { return JSON.parse(localStorage.getItem(KEY)) || seed(); } catch { return seed(); }
}
function save(db) {
  try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* private mode: in-memory only */ }
}

export function resetMock() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}

export function createMockClient() {
  let db = load();
  const listeners = new Set();

  const userObj = (email) => {
    const u = db.users[email];
    return { id: u.id, email, user_metadata: { name: u.name }, identities: [{}] };
  };
  const session = () => (db.session ? { user: userObj(db.session) } : null);
  const emit = (event) => listeners.forEach((cb) => cb(event, session()));
  const err = (code, message) => ({ code, message });
  const currentId = () => (db.session ? db.users[db.session].id : null);

  const auth = {
    async getSession() { return { data: { session: session() } }; },

    onAuthStateChange(cb) {
      listeners.add(cb);
      queueMicrotask(() => cb("INITIAL_SESSION", session()));
      return { data: { subscription: { unsubscribe: () => listeners.delete(cb) } } };
    },

    async signInWithPassword({ email, password }) {
      await wait(450);
      const u = db.users[email];
      if (!u || u.password !== password) return { data: {}, error: err("invalid_credentials", "Invalid login credentials") };
      if (Date.now() < u.confirmAt) return { data: {}, error: err("email_not_confirmed", "Email not confirmed") };
      db.session = email; save(db); emit("SIGNED_IN");
      return { data: { session: session() }, error: null };
    },

    async signUp({ email, password, options }) {
      await wait(600);
      if (/ratelimit/i.test(email)) return { data: {}, error: err("over_email_send_rate_limit", "email rate limit exceeded") };
      if (db.users[email]) return { data: { user: { ...userObj(email), identities: [] }, session: null }, error: null };
      db.users[email] = {
        id: "u-" + Math.random().toString(36).slice(2, 10),
        password, name: options?.data?.name || "", confirmAt: Date.now() + CONFIRM_AFTER_MS,
      };
      save(db);
      return { data: { user: userObj(email), session: null }, error: null };
    },

    async resend() { await wait(400); return { data: {}, error: null }; },

    async signOut() { db.session = null; save(db); emit("SIGNED_OUT"); return { error: null }; },
  };

  // ---------- chat (messages table + fake Realtime) ----------
  const channels = new Set();
  // Fake Realtime. For direct_messages it only delivers rows the signed-in user may see (like RLS).
  let realtimeOn = true; // can be switched off to simulate a sleeping/dropped Realtime connection
  const broadcast = (event, row, table = "messages") => {
    if (!realtimeOn) return;
    if (table === "direct_messages" && ![row.sender_id, row.recipient_id].includes(currentId())) return;
    channels.forEach((ch) => ch.handlers
      .filter((h) => h.event === event && h.table === table)
      .forEach((h) => h.cb(event === "INSERT" ? { new: row } : { old: { id: row.id } })));
  };
  const pg = (r) => ({ ...r, created_at: r.created_at.replace("T", " ").replace("Z", "000") });
  const nameOf = (uid) => Object.values(db.users).find((u) => u.id === uid)?.name || "Player";

  function postMessage(row) {
    db.messages ||= [];
    db.nextMsgId ||= 1;
    const m = { id: db.nextMsgId++, created_at: new Date().toISOString(), kind: "user", ...row };
    db.messages.push(m);
    db.messages = db.messages.slice(-300);
    save(db);
    // Realtime arrives a moment later, with Postgres-style timestamps ("2026-11-05 08:50:30.565000"),
    // exactly like the real thing — the app must cope with both formats.
    setTimeout(() => broadcast("INSERT", pg(m)), 120);
    return m;
  }

  // ---------- direct messages ----------
  function postDm(row) {
    db.dms ||= [];
    db.nextDmId ||= 1;
    const d = { id: db.nextDmId++, created_at: new Date().toISOString(), read_at: null, ...row };
    db.dms.push(d);
    db.dms = db.dms.slice(-500);
    save(db);
    setTimeout(() => broadcast("INSERT", pg(d), "direct_messages"), 120);
    return d;
  }

  // thenable query builder: select().order().limit()
  function query(run) {
    const q = { order: () => q, limit: (n) => { q.n = n; return q; },
      then: (ok, bad) => wait(200).then(() => run(q)).then(ok, bad) };
    return q;
  }

  function from(table) {
    if (table === "messages") {
      return {
        select: () => query((q) => {
          if (!currentId()) return { data: null, error: err("42501", "permission denied") };
          const all = (db.messages || []).slice().reverse();
          return { data: q.n ? all.slice(0, q.n) : all, error: null };
        }),
        // insert(...) / insert(...).select().single() — both supported, like supabase-js
        insert({ body }) {
          const run = (async () => {
            await wait(200);
            const uid = currentId();
            if (!uid) return { data: null, error: err("42501", "permission denied") };
            const text = String(body || "").trim();
            if (!text || text.length > 500) return { data: null, error: err("23514", "Message must be 1–500 characters.") };
            const last = (db.messages || []).filter((m) => m.user_id === uid && m.kind === "user").at(-1);
            if (last && Date.now() - new Date(last.created_at) < 2000) {
              return { data: null, error: err("P0001", "Slow down a little — one message every 2 seconds.") };
            }
            return { data: postMessage({ user_id: uid, name: nameOf(uid), body: text }), error: null };
          })();
          const chain = { select: () => chain, single: () => run, then: (a, b) => run.then(a, b) };
          return chain;
        },
        delete: () => ({
          async eq(_col, id) {
            await wait(150);
            const m = (db.messages || []).find((x) => x.id === id);
            if (!m || m.user_id !== currentId() || m.kind !== "user") return { error: err("42501", "permission denied") };
            db.messages = db.messages.filter((x) => x.id !== id);
            save(db);
            broadcast("DELETE", m);
            return { error: null };
          },
        }),
      };
    }
    if (table === "direct_messages") {
      return {
        insert({ recipient_id, body }) {
          const run = (async () => {
            await wait(200);
            const uid = currentId();
            if (!uid) return { data: null, error: err("28000", "Not signed in") };
            const text = String(body || "").trim();
            if (!text || text.length > 500) return { data: null, error: err("23514", "Message must be 1–500 characters.") };
            if (recipient_id === uid) return { data: null, error: err("P0001", "You can't message yourself.") };
            if (!people().some((p) => p.id === recipient_id)) return { data: null, error: err("P0001", "That person isn't available.") };
            const last = (db.dms || []).filter((d) => d.sender_id === uid).at(-1);
            if (last && Date.now() - new Date(last.created_at) < 1000) {
              return { data: null, error: err("P0001", "Slow down a little — one message per second.") };
            }
            return { data: postDm({ sender_id: uid, recipient_id, body: text }), error: null };
          })();
          const chain = { select: () => chain, single: () => run, then: (a, b) => run.then(a, b) };
          return chain;
        },
        delete: () => ({
          async eq(_col, id) {
            await wait(150);
            const d = (db.dms || []).find((x) => x.id === id);
            if (!d || d.sender_id !== currentId()) return { error: err("42501", "permission denied") };
            db.dms = db.dms.filter((x) => x.id !== id);
            save(db);
            broadcast("DELETE", d, "direct_messages");
            return { error: null };
          },
        }),
      };
    }
    return {
      async select() {
        await wait(250);
        if (table !== "day_marks") return { data: null, error: err("42P01", "unknown table") };
        const mine = db.marks[currentId()] || {};
        return { data: Object.entries(mine).map(([day, v]) => ({ day, had_sugar: !!v, forgiven: v === "gift" })), error: null };
      },
    };
  }

  function channel() {
    const ch = { handlers: [],
      on(_type, filter, cb) { ch.handlers.push({ event: filter.event, table: filter.table, cb }); return ch; },
      subscribe(cb) { channels.add(ch); if (cb) setTimeout(() => cb("SUBSCRIBED"), 50); return ch; } };
    return ch;
  }
  const removeChannel = (ch) => channels.delete(ch);

  const FRIENDS = ["Asha", "Rohan", "Meera"];
  const LINES = ["Day 3 without sugar and I already feel lighter 😄", "Who else is craving chocolate right now? 🍫",
    "Pro tip: frozen grapes hit the sweet spot 🍇", "You've got this everyone 💪", "Skipped dessert at a wedding. Proud of me!"];
  const friendId = (i) => "u-friend-" + i;
  const rand = (n) => Math.floor(Math.random() * n);
  function simulateFriendMessage() {
    const i = rand(3);
    postMessage({ user_id: friendId(i), name: FRIENDS[i], body: LINES[rand(LINES.length)] });
  }
  const DM_LINES = ["Hey! How's your streak going? 🔥", "Want to do a no-sugar week together? 💪",
    "I almost ate a whole cake yesterday 😅", "Proud of you, keep going! ❤️"];
  function simulateFriendDm() {
    const me = currentId();
    if (!me) return;
    postDm({ sender_id: friendId(rand(3)), recipient_id: me, body: DM_LINES[rand(DM_LINES.length)] });
  }

  // Everyone you could DM: other confirmed mock users + fake friends who have talked to you.
  function people() {
    const me = currentId();
    const real = Object.values(db.users).filter((u) => u.id !== me && Date.now() >= u.confirmAt)
      .map((u) => ({ id: u.id, name: u.name || "Player" }));
    const fake = FRIENDS.map((name, i) => ({ id: friendId(i), name }))
      .filter((f) => (db.dms || []).some((d) => [d.sender_id, d.recipient_id].includes(f.id)
        && [d.sender_id, d.recipient_id].includes(me)));
    return [...real, ...fake];
  }

  function dmThreads() {
    const me = currentId();
    if (!me) return { data: null, error: err("28000", "Not signed in") };
    const rows = people().map((p) => {
      const pair = (db.dms || []).filter((d) => (d.sender_id === me && d.recipient_id === p.id)
        || (d.sender_id === p.id && d.recipient_id === me));
      const last = pair.at(-1);
      return { user_id: p.id, name: p.name, last_body: last?.body ?? null, last_at: last?.created_at ?? null,
        last_from_me: last ? last.sender_id === me : false,
        unread: pair.filter((d) => d.recipient_id === me && !d.read_at).length };
    });
    rows.sort((a, b) => (b.last_at || "").localeCompare(a.last_at || "") || a.name.localeCompare(b.name));
    return { data: rows, error: null };
  }

  function dmThread(other) {
    const me = currentId();
    if (!me) return { data: null, error: err("28000", "Not signed in") };
    const pair = (db.dms || []).filter((d) => (d.sender_id === me && d.recipient_id === other)
      || (d.sender_id === other && d.recipient_id === me));
    return { data: pair.slice(-100), error: null };
  }

  function markDmRead(other) {
    const me = currentId();
    (db.dms || []).forEach((d) => { if (d.recipient_id === me && d.sender_id === other && !d.read_at) d.read_at = new Date().toISOString(); });
    save(db);
    return { data: null, error: null };
  }
  function leaderboard() {
    const me = currentId();
    if (!me) return { data: null, error: err("28000", "Not signed in") };
    const today = iso(new Date());
    const rows = Object.values(db.users)
      .filter((u) => Date.now() >= u.confirmAt)
      .map((u) => {
        const marks = db.marks[u.id] || {};
        const sugar = Object.values(marks).filter((v) => v === true).length;
        return {
          name: u.name || "Player",
          sugar_days: sugar,
          clean_days: Object.values(marks).filter((v) => v === false).length,
          streak: currentStreak(marks, today),
          locked: sugar > MAX_SUGAR,
          is_me: u.id === me,
          user_id: u.id,
        };
      })
      .sort((a, b) => a.locked - b.locked || b.streak - a.streak || b.clean_days - a.clean_days
        || a.sugar_days - b.sugar_days || a.name.localeCompare(b.name));
    return { data: rows, error: null };
  }

  async function rpc(fn, { p_day, p_had_sugar } = {}) {
    await wait(350);
    if (fn === "leaderboard") return leaderboard();
    if (fn === "dm_threads") return dmThreads();
    if (fn === "dm_thread") return dmThread(arguments[1]?.p_other);
    if (fn === "mark_dm_read") return markDmRead(arguments[1]?.p_other);
    if (fn === "next_announcement") {
      const me = currentId();
      const a = (db.announcements || []).find((x) => !(db.seen?.[me] || []).includes(x.id));
      return { data: a ? [a] : [], error: null };
    }
    if (fn === "ack_announcement") {
      const me = currentId();
      ((db.seen ||= {})[me] ||= []).push(arguments[1]?.p_id);
      save(db);
      return { data: null, error: null };
    }
    if (fn !== "mark_day") return { data: null, error: err("PGRST202", "unknown function") };
    const uid = currentId();
    if (!uid) return { data: null, error: err("28000", "Not signed in") };
    const mine = (db.marks[uid] ||= {});
    let count = Object.values(mine).filter((v) => v === true).length;
    if (count > MAX_SUGAR) return { data: null, error: err("P0001", `Your tracker is locked: you used all ${MAX_SUGAR} chances.`) };
    if (p_day >= iso(new Date())) return { data: null, error: err("P0001", "You can only mark a day once it's over.") };
    if (p_day in mine) return { data: null, error: err("P0001", "That day is already marked.") };
    mine[p_day] = p_had_sugar;
    if (p_had_sugar) count++;
    save(db);

    // milestone posts (same rules as supabase/chat.sql)
    const name = nameOf(uid);
    if (p_had_sugar) {
      const left = Math.max(0, MAX_SUGAR - count);
      postMessage({ user_id: uid, name, kind: "system", body: count > MAX_SUGAR
        ? `☠️ ${name} is out of lives — game over. Thanks for playing honestly!`
        : left === 0 ? `⚠️ ${name} just used their last life. Cheer them on — no more sugar!`
        : `💔 ${name} lost a life (${left} left). Send some support!` });
    } else if (p_day === daysAgo(1)) {
      let run = 0;
      for (let i = 1; mine[daysAgo(i)] === false; i++) run++;
      if ([3, 7, 14, 21, 30, 50, 100].includes(run)) {
        postMessage({ user_id: uid, name, kind: "system", body: `🔥 ${name} hit a ${run}-day no-sugar streak!` });
      }
    }
    return { data: { sugar_count: count, max_sugar: MAX_SUGAR, locked: count > MAX_SUGAR }, error: null };
  }

  // Same as PART 2 of supabase/diwali.sql: forgive every sugar day, one-time pop-up, group chat post.
  function simulateGift() {
    Object.values(db.marks).forEach((m) => Object.keys(m).forEach((d) => { if (m[d] === true) m[d] = "gift"; }));
    (db.announcements ||= []).push({ id: Date.now(), icon: "🪔", title: "Happy Diwali! 🪔",
      body: "All 3 hearts are back — it's a Diwali gift! 🎁 Your sugar days so far are forgiven. Fresh start, make it count ✨" });
    postMessage({ user_id: null, name: "Desserted", kind: "system",
      body: "🪔 Happy Diwali! Everyone got all 3 hearts back — it's a Diwali gift! 🎁 Fresh start, make it count ✨" });
  }

  return { auth, from, rpc, channel, removeChannel, simulateFriendMessage, simulateFriendDm, simulateGift,
    setRealtime: (on) => { realtimeOn = !!on; } };
}
