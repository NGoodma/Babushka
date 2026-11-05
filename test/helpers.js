// Test doubles: D1 on top of SQLite, a recording Telegram, and a recording queue.
import { readFileSync } from "node:fs";
import Database from "better-sqlite3";

class Statement {
  constructor(db, sql, args = []) {
    Object.assign(this, { db, sql, args });
  }
  bind(...args) {
    return new Statement(this.db, this.sql, args);
  }
  #stmt() {
    // D1 uses ?1, ?2...; better-sqlite3 wants them bound positionally in that order
    const order = [...this.sql.matchAll(/\?(\d+)/g)].map((m) => Number(m[1]) - 1);
    return [this.db.prepare(this.sql.replace(/\?\d+/g, "?")), order.map((i) => this.args[i])];
  }
  async first() {
    const [s, a] = this.#stmt();
    return s.get(...a) ?? null;
  }
  async all() {
    const [s, a] = this.#stmt();
    return { results: s.all(...a) };
  }
  async run() {
    const [s, a] = this.#stmt();
    return { meta: { changes: s.run(...a).changes } };
  }
}

export function fakeD1() {
  const db = new Database(":memory:");
  db.exec(readFileSync(new URL("../migrations/0001_init.sql", import.meta.url), "utf8"));
  db.queries = 0;
  return { raw: db, prepare: (sql) => (db.queries++, new Statement(db, sql)) };
}

export function fakeTelegram({ blocked = [] } = {}) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const method = url.split("/").pop();
    const params = JSON.parse(init.body);
    calls.push({ method, ...params });
    if (blocked.includes(params.chat_id)) {
      return Response.json({ ok: false, error_code: 403, description: "Forbidden: bot was blocked by the user" });
    }
    return Response.json({ ok: true, result: true });
  };
  return calls;
}

export function fakeQueue() {
  const sent = [];
  return { sent, sendBatch: async (msgs) => sent.push(...msgs.map((m) => m.body)) };
}

export function makeEnv(opts) {
  return { DB: fakeD1(), SEND_QUEUE: fakeQueue(), TELEGRAM_BOT_TOKEN: "123:test", tg: fakeTelegram(opts) };
}

export const msg = (chatId, text) => ({
  message: { message_id: 1, chat: { id: chatId, type: "private" }, text },
});
export const tap = (chatId, data, text = "Бабуль, привет!") => ({
  callback_query: { id: "cq", data, message: { message_id: 7, chat: { id: chatId }, text } },
});
/** Moscow wall clock -> Date */
export const msk = (iso, hhmm) => new Date(`${iso}T${hhmm}:00+03:00`);
