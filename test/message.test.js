import assert from "node:assert/strict";
import { test } from "node:test";
import { greetingFor, isoFromJdn, jdnFromIso } from "../src/calendar.js";
import { HOLIDAYS, QUESTIONS } from "../src/data.generated.js";
import {
  everyKeyboard, everyLabel, localNow, mainKeyboard, NO_REPEAT, phrase, pickQuestion, questionsKeyboard, settingsKeyboard,
  slotTime, ZONES, zoneKeyboard,
} from "../src/message.js";

test("fourteen questions with unique ids", () => {
  assert.equal(QUESTIONS.length, 14);
  assert.equal(new Set(QUESTIONS.map((q) => q.id)).size, 14);
  for (const q of QUESTIONS) assert.ok(q.text.endsWith("?") && /^[a-z]{1,20}$/.test(q.id), q.id);
});

test("phrase format", () => {
  assert.equal(phrase({ text: "С Покровом", end: "!" }, "Как ты?"), "Бабуль, привет! С Покровом! Как ты?");
  assert.equal(phrase({ text: "С Покровом", end: "!" }, null), "Бабуль, привет! С Покровом!");
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

/** Simulate n messages for one user; returns the question ids in order. */
function history(n, { excluded = [], chatId = 42 } = {}) {
  let recent = [];
  const ids = [];
  for (let i = 0; i < n; i++) {
    const picked = pickQuestion(QUESTIONS, excluded, recent, `${chatId}:${i}`);
    recent = picked.recent;
    ids.push(recent.at(-1));
  }
  return ids;
}

test("rotation: no question repeats within 7 messages", () => {
  const ids = history(500);
  for (let i = 0; i < ids.length; i++) {
    assert.ok(!ids.slice(Math.max(0, i - NO_REPEAT), i).includes(ids[i]), `repeat at ${i}: ${ids[i]}`);
  }
  assert.equal(new Set(ids).size, QUESTIONS.length); // all questions get used
  assert.notDeepEqual(history(30), history(30, { chatId: 43 })); // users differ
});

test("rotation respects exclusions and shrinks the window when few questions are left", () => {
  const few = QUESTIONS.slice(3).map((q) => q.id); // only 3 questions left on
  const ids = history(60, { excluded: few });
  assert.deepEqual(new Set(ids), new Set(QUESTIONS.slice(0, 3).map((q) => q.id)));
  for (let i = 1; i < ids.length; i++) assert.ok(!ids.slice(Math.max(0, i - 2), i).includes(ids[i]));
  // a single question left: it is simply repeated
  assert.deepEqual(new Set(history(5, { excluded: QUESTIONS.slice(1).map((q) => q.id) })), new Set([QUESTIONS[0].id]));
  // everything excluded -> no question, history untouched
  assert.deepEqual(pickQuestion(QUESTIONS, QUESTIONS.map((q) => q.id), ["dela"], "x"), { question: null, recent: ["dela"] });
});

test("history keeps only the last 7 and tolerates removed question ids", () => {
  const { recent } = pickQuestion(QUESTIONS, [], ["gone1", "gone2", ...QUESTIONS.slice(0, 7).map((q) => q.id)], "s");
  assert.equal(recent.length, NO_REPEAT);
  assert.ok(!QUESTIONS.slice(2, 7).map((q) => q.id).includes(recent.at(-1)));
});

test("labels", () => {
  assert.deepEqual([1, 2, 5, 7].map(everyLabel), ["каждый день", "раз в 2 дня", "раз в 5 дней", "раз в неделю"]);
  assert.deepEqual([0, 1, 11].map(slotTime), ["10:00", "10:05", "10:55"]);
});

test("keyboards: copy + settings, callback_data within 64 bytes", () => {
  const main = mainKeyboard("Бабуль, привет!").inline_keyboard[0];
  assert.deepEqual(main.map((b) => b.text), ["📋 Скопировать", "⚙️ Настройки"]);
  assert.equal(main[0].copy_text.text, "Бабуль, привет!");
  const user = { every: 3, slot: 5, excluded: '["weather"]', tz: "Asia/Omsk" };
  const all = [settingsKeyboard(user, QUESTIONS), everyKeyboard(user), questionsKeyboard(user, QUESTIONS),
    zoneKeyboard(user, new Date())]
    .flatMap((k) => k.inline_keyboard.flat());
  for (const b of all) assert.ok(Buffer.byteLength(b.callback_data) <= 64);
  const settings = settingsKeyboard(user, QUESTIONS).inline_keyboard.map((r) => r[0].text);
  assert.deepEqual(settings, ["🗓 Как часто: раз в 3 дня", "💬 Вопросы: 13 из 14", "🌍 Часовой пояс: Омск", "← Назад"]);
  assert.ok(everyKeyboard(user).inline_keyboard.flat().some((b) => b.text === "✓ раз в 3 дня"));
});

test("local time in a zone, and the zone picker shows each zone's clock", () => {
  const now = new Date("2026-11-06T07:05:00Z");
  assert.deepEqual(localNow(now, "Europe/Moscow"), { iso: "2026-11-06", minutes: 10 * 60 + 5, offset: 180 });
  assert.deepEqual(localNow(now, "America/Los_Angeles"), { iso: "2026-11-05", minutes: 23 * 60 + 5, offset: -480 });
  assert.deepEqual(localNow(now, "Asia/Kamchatka"), { iso: "2026-11-06", minutes: 19 * 60 + 5, offset: 720 });
  for (const [, tz] of ZONES) assert.ok(localNow(now, tz).iso, tz); // every zone is known to Intl
  const buttons = zoneKeyboard({ tz: "Europe/Moscow" }, now).inline_keyboard.flat();
  assert.equal(buttons[0].text, "UTC−10 Гавайи · 21:05");
  assert.ok(buttons.some((b) => b.text === "✓ UTC+3 Москва, Минск, Стамбул · 10:05"));
  assert.equal(buttons.at(-1).text, "← Назад");
});

test("zone picker: exactly one button per hour from UTC-10 to UTC+12, in winter and in summer", () => {
  for (const d of ["2026-01-15T12:00:00Z", "2026-07-15T12:00:00Z"]) {
    const offsets = ZONES.map(([, tz]) => localNow(new Date(d), tz).offset / 60);
    assert.deepEqual(offsets, Array.from({ length: 23 }, (_, i) => i - 10), d);
  }
});

test("questions keyboard: 'turn all off' unless every question is already off", () => {
  const last = (excluded) => questionsKeyboard({ excluded: JSON.stringify(excluded) }, QUESTIONS).inline_keyboard.at(-2)[0];
  assert.deepEqual(last([]), { text: "⬜ Отключить все", callback_data: "qa:off" });
  assert.equal(last(["dela", "feel"]).callback_data, "qa:off");
  assert.equal(last(QUESTIONS.slice(1).map((q) => q.id)).callback_data, "qa:off");
  assert.deepEqual(last(QUESTIONS.map((q) => q.id)), { text: "✅ Включить все", callback_data: "qa:on" });
});
