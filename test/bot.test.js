import assert from "node:assert/strict";
import { test } from "node:test";
import { consumeBatch, handleUpdate, runSchedule } from "../src/bot.js";
import worker from "../src/index.js";
import { webhookSecret } from "../src/telegram.js";
import { makeEnv, msg, msk, tap } from "./helpers.js";

const NOW = msk("2026-11-06", "12:00");
const users = (env) => env.DB.raw.prepare("SELECT * FROM users ORDER BY created_at, rowid").all();
const sent = (env) => env.tg.filter((c) => c.method === "sendMessage");

test("/start subscribes, greets and sends today's phrase with two buttons", async () => {
  const env = makeEnv();
  await handleUpdate(env, msg(100, "/start"), NOW);
  const [u] = users(env);
  assert.equal(u.chat_id, 100);
  assert.equal(u.last_sent, "2026-11-06");
  const [welcome, phrase] = sent(env);
  assert.match(welcome.text, /Каждый день в 10:00 по Москве/);
  assert.match(phrase.text, /^Бабуль, привет! С днём иконы Божией Матери «Всех скорбящих Радость»! .+\?$/);
  assert.equal(phrase.reply_markup.inline_keyboard[0][0].copy_text.text, phrase.text);
  assert.equal(phrase.reply_markup.inline_keyboard[0][1].callback_data, "s");
});

test("users are spread over 10:00..11:00 in 5 minute steps, the 14th goes back to 10:00", async () => {
  const env = makeEnv();
  for (let i = 1; i <= 14; i++) await handleUpdate(env, msg(i, "/start"), NOW);
  assert.deepEqual(users(env).map((u) => u.slot), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 0]);
  // a gap left by someone who unsubscribed is filled first
  env.DB.raw.prepare("DELETE FROM users WHERE chat_id = 5").run();
  await handleUpdate(env, msg(15, "/start"), NOW);
  assert.equal(users(env).find((u) => u.chat_id === 15).slot, 4);
});

test("schedule: each user at their slot, respecting the interval, never twice a day", async () => {
  const env = makeEnv();
  const add = env.DB.raw.prepare("INSERT INTO users (chat_id, slot, every, last_sent) VALUES (?, ?, ?, ?)");
  add.run(1, 0, 1, "2026-11-05"); // 10:00, daily
  add.run(2, 6, 1, "2026-11-05"); // 10:30, daily
  add.run(3, 0, 3, "2026-11-05"); // every 3 days: next on 11-08
  add.run(4, 12, 1, null); // 11:00, never got one

  assert.equal(await runSchedule(env, msk("2026-11-06", "09:55")), 0);
  assert.equal(await runSchedule(env, msk("2026-11-06", "10:00")), 1);
  assert.equal(await runSchedule(env, msk("2026-11-06", "10:05")), 0); // already queued
  assert.equal(await runSchedule(env, msk("2026-11-06", "10:30")), 1);
  assert.equal(await runSchedule(env, msk("2026-11-06", "15:00")), 1); // a late cron still catches up
  assert.deepEqual(env.SEND_QUEUE.sent.map((m) => m.chat_id), [1, 2, 4]);
  assert.equal(await runSchedule(env, msk("2026-11-08", "10:00")), 2); // user 1 and, finally, user 3
  assert.match(env.SEND_QUEUE.sent[0].text, /^Бабуль, привет! /);
});

test("schedule uses one D1 query for marking, whatever the number of users", async () => {
  const env = makeEnv();
  const add = env.DB.raw.prepare("INSERT INTO users (chat_id, slot) VALUES (?, 0)");
  for (let i = 1; i <= 300; i++) add.run(i);
  env.DB.raw.queries = 0;
  assert.equal(await runSchedule(env, msk("2026-11-06", "10:00")), 300);
  assert.ok(env.DB.raw.queries <= 2);
  assert.equal(env.SEND_QUEUE.sent.length, 300);
});

test("queue consumer sends with buttons and drops users who blocked the bot", async () => {
  const env = makeEnv({ blocked: [2] });
  env.DB.raw.prepare("INSERT INTO users (chat_id, slot) VALUES (1, 0), (2, 1)").run();
  const acks = [];
  const m = (chat_id) => ({ body: { chat_id, text: "Бабуль, привет!" }, ack: () => acks.push(chat_id), retry: () => {} });
  await consumeBatch(env, { messages: [m(1), m(2)] });
  assert.deepEqual(acks, [1, 2]);
  assert.deepEqual(users(env).map((u) => u.chat_id), [1]);
  assert.equal(sent(env)[0].reply_markup.inline_keyboard[0][0].copy_text.text, "Бабуль, привет!");
});

test("settings: frequency", async () => {
  const env = makeEnv();
  await handleUpdate(env, msg(100, "/start"), NOW);
  await handleUpdate(env, tap(100, "s"), NOW);
  await handleUpdate(env, tap(100, "f"), NOW);
  await handleUpdate(env, tap(100, "f:3"), NOW);
  assert.equal(users(env)[0].every, 3);
  const edits = env.tg.filter((c) => c.method === "editMessageReplyMarkup");
  assert.equal(edits.length, 3);
  assert.match(edits[2].reply_markup.inline_keyboard[0][0].text, /раз в 3 дня/);
  assert.ok(env.tg.some((c) => c.method === "answerCallbackQuery" && c.text === "Буду присылать раз в 3 дня"));
});

test("settings: excluding questions, but never all of them", async () => {
  const env = makeEnv();
  await handleUpdate(env, msg(100, "/start"), NOW);
  await handleUpdate(env, tap(100, "q:weather"), NOW);
  assert.deepEqual(JSON.parse(users(env)[0].excluded), ["weather"]);
  await handleUpdate(env, tap(100, "q:weather"), NOW); // tap again = turn back on
  assert.deepEqual(JSON.parse(users(env)[0].excluded), []);
  const { QUESTIONS } = await import("../src/data.generated.js");
  for (const q of QUESTIONS) await handleUpdate(env, tap(100, `q:${q.id}`), NOW);
  assert.equal(JSON.parse(users(env)[0].excluded).length, 19);
  assert.ok(env.tg.some((c) => c.text === "Оставь хотя бы один вопрос"));
  await handleUpdate(env, tap(100, "q:nonsense"), NOW);
  assert.equal(JSON.parse(users(env)[0].excluded).length, 19);
});

test("back button restores copy + settings for the same text", async () => {
  const env = makeEnv();
  await handleUpdate(env, msg(100, "/start"), NOW);
  await handleUpdate(env, tap(100, "m", "Бабуль, привет! Тест! Как ты?"), NOW);
  const edit = env.tg.findLast((c) => c.method === "editMessageReplyMarkup");
  assert.equal(edit.reply_markup.inline_keyboard[0][0].copy_text.text, "Бабуль, привет! Тест! Как ты?");
});

test("strangers: buttons and messages ask to /start, group chats are ignored", async () => {
  const env = makeEnv();
  await handleUpdate(env, tap(5, "s"), NOW);
  await handleUpdate(env, msg(5, "привет"), NOW);
  await handleUpdate(env, { message: { chat: { id: -1, type: "group" }, text: "/start" } }, NOW);
  assert.equal(users(env).length, 0);
  assert.deepEqual(env.tg.map((c) => c.text), ["Сначала нажми /start", "Чтобы подписаться, нажми /start"]);
});

test("any message from a subscriber = one more phrase, schedule untouched", async () => {
  const env = makeEnv();
  await handleUpdate(env, msg(100, "/start"), msk("2026-11-05", "12:00"));
  await handleUpdate(env, msg(100, "ещё"), NOW);
  const u = users(env)[0];
  assert.equal(u.last_sent, "2026-11-05");
  assert.equal(u.sent_count, 2);
});

test("webhook checks Telegram's secret header", async () => {
  const env = makeEnv();
  const req = (secret) => new Request("https://x.workers.dev/telegram", {
    method: "POST",
    headers: { "X-Telegram-Bot-Api-Secret-Token": secret },
    body: JSON.stringify({ update_id: 1, ...msg(100, "/start") }),
  });
  assert.equal((await worker.fetch(req("wrong"), env)).status, 403);
  assert.equal(users(env).length, 0);
  assert.equal((await worker.fetch(req(await webhookSecret(env.TELEGRAM_BOT_TOKEN)), env)).status, 200);
  assert.equal(users(env).length, 1);
});
