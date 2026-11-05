import assert from "node:assert/strict";
import { test } from "node:test";
import { greetingFor, isoFromJdn, jdnFromIso } from "../src/calendar.js";
import { HOLIDAYS, QUESTIONS } from "../src/data.generated.js";
import {
  everyKeyboard, everyLabel, mainKeyboard, phrase, pickQuestion, questionsKeyboard, settingsKeyboard, slotTime,
} from "../src/message.js";

test("twenty questions with unique ids", () => {
  assert.equal(QUESTIONS.length, 20);
  assert.equal(new Set(QUESTIONS.map((q) => q.id)).size, 20);
  for (const q of QUESTIONS) assert.ok(q.text.endsWith("?") && /^[a-z]{1,20}$/.test(q.id), q.id);
});

test("phrase format", () => {
  assert.equal(phrase({ text: "С Покровом", end: "!" }, "Как ты?"), "Бабуль, привет! С Покровом! Как ты?");
  assert.equal(phrase({ text: "Сегодня Великая пятница", end: "." }, "Как ты?"),
    "Бабуль, привет! Сегодня Великая пятница. Как ты?");
});

test("every phrase fits the copy button (256 chars)", () => {
  const longest = QUESTIONS.reduce((a, q) => (q.text.length > a.length ? q.text : a), "");
  for (let j = jdnFromIso("2026-01-01"); j < jdnFromIso("2030-01-01"); j++) {
    const p = phrase(greetingFor(HOLIDAYS, isoFromJdn(j)), longest);
    assert.ok(p.length <= 256, p);
  }
});

test("rotation: no repeats inside a round, differs per user, respects exclusions", () => {
  const round = Array.from({ length: 20 }, (_, n) => pickQuestion(QUESTIONS, [], 42, n));
  assert.equal(new Set(round).size, 20);
  const other = Array.from({ length: 20 }, (_, n) => pickQuestion(QUESTIONS, [], 43, n));
  assert.notDeepEqual(round, other);
  const picks = Array.from({ length: 40 }, (_, n) => pickQuestion(QUESTIONS, ["weather", "dacha"], 42, n));
  assert.ok(!picks.includes("Какая у вас сегодня погода?"));
  assert.equal(new Set(picks).size, 18);
  // everything excluded -> fall back to all questions instead of crashing
  assert.ok(pickQuestion(QUESTIONS, QUESTIONS.map((q) => q.id), 1, 0));
});

test("labels", () => {
  assert.deepEqual([1, 2, 5, 7].map(everyLabel), ["каждый день", "раз в 2 дня", "раз в 5 дней", "раз в неделю"]);
  assert.deepEqual([0, 1, 11, 12].map(slotTime), ["10:00", "10:05", "10:55", "11:00"]);
});

test("keyboards: copy + settings, callback_data within 64 bytes", () => {
  const main = mainKeyboard("Бабуль, привет!").inline_keyboard[0];
  assert.deepEqual(main.map((b) => b.text), ["📋 Скопировать", "⚙️ Настройки"]);
  assert.equal(main[0].copy_text.text, "Бабуль, привет!");
  const user = { every: 3, slot: 5, excluded: '["weather"]' };
  const all = [settingsKeyboard(user, QUESTIONS), everyKeyboard(user), questionsKeyboard(user, QUESTIONS)]
    .flatMap((k) => k.inline_keyboard.flat());
  for (const b of all) assert.ok(Buffer.byteLength(b.callback_data) <= 64);
  assert.match(settingsKeyboard(user, QUESTIONS).inline_keyboard[1][0].text, /19 из 20/);
  assert.ok(everyKeyboard(user).inline_keyboard.flat().some((b) => b.text === "✓ раз в 3 дня"));
});
