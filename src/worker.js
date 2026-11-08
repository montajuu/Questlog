import { sendPush, generateVapid } from "./push.js";

// The worker makes its own notification key pair on first use and keeps it in KV,
// so nobody has to copy a private key around.
let vapidCache = null;
async function getVapid(env) {
  if (vapidCache) return vapidCache;
  let v = await getJSON(env, "config:vapid", null);
  if (!v) {
    v = await generateVapid();
    await env.QUESTLOG.put("config:vapid", JSON.stringify(v));
    // KV is eventually consistent: re-read so two first requests settle on one pair
    v = (await getJSON(env, "config:vapid", null)) || v;
  }
  vapidCache = { ...v, subject: env.VAPID_SUBJECT || "https://github.com/montajuu/questlog" };
  return vapidCache;
}

const KEY_RE = /^[A-Za-z0-9_-]{20,64}$/;
const MAX_STATE_BYTES = 900_000;
const DIFF_XP = { easy: 10, mid: 20, hard: 35 };
const MISS_HP = 15;
// Deadline nags (local time). Sent only while quests are still open.
const NAGS = [
  { at: "21:00", title: n => `아직 퀘스트 ${n}개 남았어요`, body: (n, names) => `${names}. 오늘 불꽃을 지켜요.` },
  { at: "23:00", title: n => `마감 1시간 전 · ${n}개 남음`, body: n => `자정이 지나면 HP −${n * MISS_HP}. 지금 하나라도 깨요.` },
  { at: "23:45", title: () => `15분 남았어요`, body: n => `${n}개가 그대로면 불꽃이 꺼져요.` },
];

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

function userKey(req) {
  const k = req.headers.get("x-questlog-key") || "";
  return KEY_RE.test(k) ? k : null;
}

async function getJSON(env, key, fallback) {
  const v = await env.QUESTLOG.get(key);
  if (!v) return fallback;
  try { return JSON.parse(v); } catch { return fallback; }
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(req);

    if (url.pathname === "/api/vapid") return json({ key: (await getVapid(env)).publicKey });

    const key = userKey(req);
    if (!key) return json({ error: "기기 키가 없거나 형식이 잘못됐어요." }, 401);

    if (url.pathname === "/api/state" && req.method === "GET") {
      const raw = await env.QUESTLOG.get(`u:${key}`);
      return new Response(raw || "null", { headers: { "content-type": "application/json", "cache-control": "no-store" } });
    }
    if (url.pathname === "/api/state" && req.method === "PUT") {
      const text = await req.text();
      if (text.length > MAX_STATE_BYTES) return json({ error: "저장 데이터가 너무 커요." }, 413);
      let state;
      try { state = JSON.parse(text); } catch { return json({ error: "JSON 형식이 아니에요." }, 400); }
      if (!state || !Array.isArray(state.quests) || typeof state.log !== "object") return json({ error: "퀘스트로그 데이터가 아니에요." }, 400);
      const current = await getJSON(env, `u:${key}`, null);
      if (current && current.updatedAt && state.updatedAt && current.updatedAt > state.updatedAt) {
        return json({ conflict: true, state: current }, 409);
      }
      await env.QUESTLOG.put(`u:${key}`, JSON.stringify(state));
      return json({ ok: true });
    }
    if (url.pathname === "/api/subscribe" && req.method === "POST") {
      const { subscription } = await req.json().catch(() => ({}));
      if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) return json({ error: "구독 정보가 올바르지 않아요." }, 400);
      if (!/^https:\/\//.test(subscription.endpoint)) return json({ error: "구독 주소가 올바르지 않아요." }, 400);
      const subs = (await getJSON(env, `sub:${key}`, [])).filter(s => s.endpoint !== subscription.endpoint);
      subs.push({ endpoint: subscription.endpoint, keys: subscription.keys, added: new Date().toISOString() });
      await env.QUESTLOG.put(`sub:${key}`, JSON.stringify(subs.slice(-5)));
      return json({ ok: true, devices: subs.length });
    }
    if (url.pathname === "/api/unsubscribe" && req.method === "POST") {
      const { endpoint } = await req.json().catch(() => ({}));
      const subs = (await getJSON(env, `sub:${key}`, [])).filter(s => s.endpoint !== endpoint);
      if (subs.length) await env.QUESTLOG.put(`sub:${key}`, JSON.stringify(subs));
      else await env.QUESTLOG.delete(`sub:${key}`);
      return json({ ok: true, devices: subs.length });
    }
    if (url.pathname === "/api/test" && req.method === "POST") {
      const subs = await getJSON(env, `sub:${key}`, []);
      if (!subs.length) return json({ error: "알림을 켠 기기가 없어요." }, 404);
      const results = await deliver(env, key, subs, [{ title: "퀘스트로그 알림 테스트", body: "이렇게 알림이 와요. 오늘 퀘스트도 깨러 가요.", tag: "test" }]);
      return json({ ok: results.some(s => s >= 200 && s < 300), results });
    }
    return json({ error: "없는 경로예요." }, 404);
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(runReminders(env, new Date(event.scheduledTime || Date.now())));
  },
};

async function deliver(env, key, subs, messages) {
  const vapid = await getVapid(env);
  const statuses = [];
  let changed = false;
  const alive = [];
  for (const sub of subs) {
    let gone = false;
    for (const m of messages) {
      let status = 0;
      try { status = await sendPush(sub, { url: "/", ...m }, vapid); } catch (e) { status = -1; }
      statuses.push(status);
      if (status === 404 || status === 410) { gone = true; break; }
    }
    if (gone) changed = true; else alive.push(sub);
  }
  if (changed) {
    if (alive.length) await env.QUESTLOG.put(`sub:${key}`, JSON.stringify(alive));
    else await env.QUESTLOG.delete(`sub:${key}`);
  }
  return statuses;
}

/** Local date/time parts for a time zone. */
export function localParts(date, tz) {
  const f = new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short", hourCycle: "h23" });
  const p = Object.fromEntries(f.formatToParts(date).map(x => [x.type, x.value]));
  const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday);
  return { date: `${p.year}-${p.month}-${p.day}`, hm: `${p.hour}:${p.minute}`, dow };
}
const toMin = hm => { const [h, m] = hm.split(":").map(Number); return h * 60 + m; };

/** Decide which notifications are due. Pure, so it can be tested. */
export function dueMessages(state, now, sent) {
  const tz = state.tz || "Asia/Seoul";
  const { date, hm, dow } = localParts(now, tz);
  const notify = state.notify || {};
  if (notify.enabled === false) return { date, messages: [], marks: [] };
  const done = state.log?.[date] || {};
  const open = (state.quests || []).filter(q =>
    q.created <= date && !(q.archivedAt && date >= q.archivedAt) && q.days?.includes(dow) && !done[q.id]);
  const messages = [], marks = [];
  const nowMin = toMin(hm);

  if (notify.questTimes !== false) {
    const due = open.filter(q => q.time && toMin(q.time) <= nowMin && !sent.includes(`q:${q.id}`));
    const fresh = due.filter(q => nowMin - toMin(q.time) <= 60);
    due.forEach(q => marks.push(`q:${q.id}`));
    if (fresh.length === 1) {
      const q = fresh[0];
      messages.push({ title: `${q.name} 할 시간`, body: `지금 클리어하면 +${DIFF_XP[q.diff] || 10} XP${q.target ? ` · 목표 ${q.target}${q.unit || ""}` : ""}. 자정을 넘기면 HP −${MISS_HP}.`, tag: `q-${q.id}` });
    } else if (fresh.length > 1) {
      messages.push({ title: `퀘스트 ${fresh.length}개 시작 시간`, body: fresh.map(q => q.name).join(", "), tag: `q-batch-${hm}` });
    }
  }
  if (notify.deadline !== false && open.length) {
    for (const n of NAGS) {
      const id = `n:${n.at}`;
      if (sent.includes(id)) continue;
      const diff = nowMin - toMin(n.at);
      if (diff < 0) continue;
      marks.push(id);
      if (diff <= 40) {
        const names = open.slice(0, 3).map(q => q.name).join(", ") + (open.length > 3 ? ` 외 ${open.length - 3}개` : "");
        messages.push({ title: n.title(open.length), body: n.body(open.length, names), tag: "deadline" });
      }
    }
  }
  // One notification per run at most: the deadline nag outranks a start-time reminder.
  return { date, messages: messages.slice(-1), marks };
}

async function runReminders(env, now) {
  let cursor;
  do {
    const page = await env.QUESTLOG.list({ prefix: "sub:", cursor });
    cursor = page.list_complete ? null : page.cursor;
    for (const { name } of page.keys) {
      const key = name.slice(4);
      try {
        const [subs, state] = await Promise.all([getJSON(env, name, []), getJSON(env, `u:${key}`, null)]);
        if (!state || !subs.length) continue;
        const { date } = localParts(now, state.tz || "Asia/Seoul");
        const sentKey = `sent:${key}:${date}`;
        const sent = await getJSON(env, sentKey, []);
        const { messages, marks } = dueMessages(state, now, sent);
        if (messages.length) await deliver(env, key, subs, messages);
        if (marks.length) await env.QUESTLOG.put(sentKey, JSON.stringify([...sent, ...marks]), { expirationTtl: 60 * 60 * 48 });
      } catch (e) {
        console.log("reminder failed", key.slice(0, 6), String(e));
      }
    }
  } while (cursor);
}
