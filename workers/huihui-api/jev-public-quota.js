import { JEV_TIMEOUT_MS, normalizeJevResponse, toJevPayload } from "./jev.js";
import { boundedJson, deadline, jevError, privateFailure, privateJson } from "./jev-security.js";
import { PUBLIC_JEV_LEASE_MS, PUBLIC_JEV_LIMIT, PUBLIC_JEV_WINDOW_MS, publicJevQuestion } from "./jev-public-policy.js";

export function initializePublicJev(storage) {
  storage.sql.exec("CREATE TABLE IF NOT EXISTS uses (id TEXT PRIMARY KEY, state TEXT NOT NULL CHECK (state IN ('pending', 'success')), expires_at INTEGER NOT NULL)");
}

function liveUses(storage, now) {
  storage.sql.exec("DELETE FROM uses WHERE expires_at <= ?", now);
  return storage.sql.exec("SELECT id, state, expires_at FROM uses ORDER BY expires_at").toArray();
}

function quota(rows) {
  const successes = rows.filter(row => row.state === "success");
  return { remaining: PUBLIC_JEV_LIMIT - successes.length, resetAt: successes[0]?.expires_at ?? null };
}

// All admission/finalization work is synchronous SQLite in the IP's one DO.
// A persisted reservation counts against capacity while external I/O yields.
export async function askPublicJev(storage, env, input) {
  let reservation;
  try {
    if (env.WORKER_ENV !== "beta" || typeof env.TYPESAFE_JEV_API_KEY !== "string" || !env.TYPESAFE_JEV_API_KEY.trim()) throw jevError("unavailable", 503);
    const form = { mode: "noul", question: publicJevQuestion({ question: input }), context: [] };
    initializePublicJev(storage);
    const now = Date.now();
    const admitted = storage.transactionSync(() => {
      const rows = liveUses(storage, now);
      if (rows.length >= PUBLIC_JEV_LIMIT) return { rows };
      const id = crypto.randomUUID();
      storage.sql.exec("INSERT INTO uses (id, state, expires_at) VALUES (?, 'pending', ?)", id, now + PUBLIC_JEV_LEASE_MS);
      return { id };
    });
    if (!admitted.id) {
      const usage = quota(admitted.rows);
      const response = privateJson({ ok: false, error: usage.remaining === 0 ? "rate_limited" : "busy", ...usage }, 429);
      response.headers.set("Retry-After", String(Math.max(1, Math.ceil((admitted.rows[0].expires_at - now) / 1000))));
      return response;
    }
    reservation = admitted.id;
    // Schedule before paid I/O. This also covers a crash between success and reply.
    // Every accepted call expires by this bound; requests prune earlier expiries.
    await storage.setAlarm(now + PUBLIC_JEV_WINDOW_MS + PUBLIC_JEV_LEASE_MS);
    if (!liveUses(storage, Date.now()).some(row => row.id === reservation)) throw jevError("unavailable", 503);
    const probability = await deadline(JEV_TIMEOUT_MS, async signal => {
      let response;
      try {
        response = await fetch("https://api.typesafe.ai/v1/systemone", {
          method: "POST", redirect: "manual", signal,
          headers: { Authorization: `Bearer ${env.TYPESAFE_JEV_API_KEY}`, "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(toJevPayload(form)),
        });
      } catch { throw jevError("upstream_unavailable", 502); }
      if (!response.ok) {
        void response.body?.cancel().catch(() => {});
        throw jevError("upstream_unavailable", 502);
      }
      try { return normalizeJevResponse(await boundedJson(response, 32768, signal), form).probability; }
      catch { throw jevError("invalid_response", 502); }
    });
    const usage = storage.transactionSync(() => {
      const completedAt = Date.now();
      const rows = liveUses(storage, completedAt);
      // Fence a late completion: an expired/reclaimed reservation cannot succeed.
      if (!rows.some(row => row.id === reservation && row.state === "pending")) throw jevError("unavailable", 503);
      storage.sql.exec("UPDATE uses SET state = 'success', expires_at = ? WHERE id = ?", completedAt + PUBLIC_JEV_WINDOW_MS, reservation);
      return quota(liveUses(storage, completedAt));
    });
    return privateJson({ ok: true, probability, ...usage });
  } catch (error) {
    if (reservation) {
      try { storage.sql.exec("DELETE FROM uses WHERE id = ? AND state = 'pending'", reservation); }
      catch { /* Persisted leases still expire; storage failures remain closed. */ }
    }
    return privateFailure(error);
  }
}

export async function expirePublicJev(storage) {
  initializePublicJev(storage);
  const rows = storage.transactionSync(() => liveUses(storage, Date.now()));
  if (rows.length) await storage.setAlarm(rows[0].expires_at);
  else await storage.deleteAll();
}
