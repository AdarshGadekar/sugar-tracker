// LOCAL MOCK BACKEND — only used on localhost with ?mock in the URL.
// Mimics the parts of supabase-js the app uses, with the same rules as supabase/schema.sql.
// Everything lives in this browser's localStorage; nothing is sent anywhere.
//
// Seeded test users (mock only — not real accounts):
//   test@sugar.test   / test1234  -> 1 sugar day used, 2 lives left
//   locked@sugar.test / test1234  -> 4 sugar days, tracker locked
// Sign up with any new email: it "confirms" itself 6 seconds later.
// Sign up with an email containing "ratelimit" to see the rate-limit error.

const KEY = "sugar_mock_v1";
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
      "locked@sugar.test": { id: "u-locked", password: "test1234", name: "Locked Lucy", confirmAt: 0 },
    },
    marks: {
      "u-test": { [daysAgo(6)]: false, [daysAgo(5)]: false, [daysAgo(4)]: true, [daysAgo(2)]: false },
      "u-locked": { [daysAgo(9)]: true, [daysAgo(7)]: true, [daysAgo(5)]: true, [daysAgo(3)]: true, [daysAgo(1)]: false },
    },
    session: null,
  };
}

function load() {
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

  function from(table) {
    return {
      async select() {
        await wait(250);
        if (table !== "day_marks") return { data: null, error: err("42P01", "unknown table") };
        const mine = db.marks[currentId()] || {};
        return { data: Object.entries(mine).map(([day, had_sugar]) => ({ day, had_sugar })), error: null };
      },
    };
  }

  async function rpc(fn, { p_day, p_had_sugar } = {}) {
    await wait(350);
    if (fn !== "mark_day") return { data: null, error: err("PGRST202", "unknown function") };
    const uid = currentId();
    if (!uid) return { data: null, error: err("28000", "Not signed in") };
    const mine = (db.marks[uid] ||= {});
    let count = Object.values(mine).filter(Boolean).length;
    if (count > MAX_SUGAR) return { data: null, error: err("P0001", `Your tracker is locked: you used all ${MAX_SUGAR} chances.`) };
    if (p_day > daysAgo(-1)) return { data: null, error: err("P0001", "You cannot mark a future day.") };
    if (p_day in mine) return { data: null, error: err("P0001", "That day is already marked.") };
    mine[p_day] = p_had_sugar;
    if (p_had_sugar) count++;
    save(db);
    return { data: { sugar_count: count, max_sugar: MAX_SUGAR, locked: count > MAX_SUGAR }, error: null };
  }

  return { auth, from, rpc };
}
