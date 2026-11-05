// The phrase for grandma, question rotation and inline keyboards.

export const SLOTS = 12; // 10:00, 10:05, ..., 10:55 in the user's time zone
export const FIRST_SLOT_MINUTES = 10 * 60;
export const SLOT_STEP = 5;

// Time zones offered in settings. Append only: the picker refers to them by index.
export const ZONES = [
  ["Калининград", "Europe/Kaliningrad"],
  ["Москва", "Europe/Moscow"],
  ["Самара", "Europe/Samara"],
  ["Екатеринбург", "Asia/Yekaterinburg"],
  ["Омск", "Asia/Omsk"],
  ["Новосибирск", "Asia/Novosibirsk"],
  ["Красноярск", "Asia/Krasnoyarsk"],
  ["Иркутск", "Asia/Irkutsk"],
  ["Якутск", "Asia/Yakutsk"],
  ["Владивосток", "Asia/Vladivostok"],
  ["Магадан", "Asia/Magadan"],
  ["Камчатка", "Asia/Kamchatka"],
  ["Минск", "Europe/Minsk"],
  ["Тбилиси", "Asia/Tbilisi"],
  ["Ереван", "Asia/Yerevan"],
  ["Алматы", "Asia/Almaty"],
  ["Ташкент", "Asia/Tashkent"],
  ["Стамбул", "Europe/Istanbul"],
  ["Берлин, Париж", "Europe/Berlin"],
  ["Лондон", "Europe/London"],
  ["Дубай", "Asia/Dubai"],
  ["Бангкок", "Asia/Bangkok"],
  ["Тель-Авив", "Asia/Jerusalem"],
  ["Нью-Йорк", "America/New_York"],
  ["Лос-Анджелес", "America/Los_Angeles"],
];
export const DEFAULT_TZ = "Europe/Moscow";

export const zoneLabel = (tz) => ZONES.find(([, z]) => z === tz)?.[0] ?? tz;

const formatters = new Map();
/** Local date ("YYYY-MM-DD") and minutes since midnight in a time zone. */
export function localNow(date, tz) {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    formatters.set(tz, f);
  }
  const p = Object.fromEntries(f.formatToParts(date).map(({ type, value }) => [type, value]));
  return { iso: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute) };
}

const hhmm = (minutes) => `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`;

export function phrase(greeting, question) {
  return `Бабуль, привет! ${greeting.text}${greeting.end} ${question}`;
}

// Small deterministic PRNG, so the order depends only on (chat, round) and needs no storage.
function seededRandom(seed) {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function enabledQuestions(questions, excluded) {
  const left = questions.filter((q) => !excluded.includes(q.id));
  return left.length ? left : questions; // never leave the user with nothing
}

/** n-th question for a chat: each round is a fresh shuffle, no repeats inside a round. */
export function pickQuestion(questions, excluded, chatId, n) {
  const list = enabledQuestions(questions, excluded);
  const order = list.map((_, i) => i);
  const rand = seededRandom(`${chatId}:${Math.floor(n / list.length)}`);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return list[order[n % list.length]].text;
}

export function everyLabel(n) {
  if (n === 1) return "каждый день";
  if (n === 7) return "раз в неделю";
  return n <= 4 ? `раз в ${n} дня` : `раз в ${n} дней`;
}

export const slotTime = (slot) => hhmm(FIRST_SLOT_MINUTES + SLOT_STEP * slot);

// --- keyboards (callback_data: m main, s settings, f frequency, q questions, z time zone) -----

const button = (text, data) => ({ text, callback_data: data });
const back = (to) => [button("← Назад", to)];

export function mainKeyboard(text) {
  return {
    inline_keyboard: [[{ text: "📋 Скопировать", copy_text: { text } }, button("⚙️ Настройки", "s")]],
  };
}

export function settingsKeyboard(user, questions) {
  const excluded = JSON.parse(user.excluded);
  const on = questions.length - questions.filter((q) => excluded.includes(q.id)).length;
  return {
    inline_keyboard: [
      [button(`🗓 Как часто: ${everyLabel(user.every)}`, "f")],
      [button(`💬 Вопросы: ${on} из ${questions.length}`, "q")],
      [button(`🌍 Часовой пояс: ${zoneLabel(user.tz)}`, "z")],
      back("m"),
    ],
  };
}

/** Each zone shows its current time, so the user just picks the line that matches their clock. */
export function zoneKeyboard(user, now) {
  const items = ZONES.map(([label, tz], i) =>
    button(`${tz === user.tz ? "✓ " : ""}${label} · ${hhmm(localNow(now, tz).minutes)}`, `z:${i}`),
  );
  const rows = [];
  for (let i = 0; i < items.length; i += 2) rows.push(items.slice(i, i + 2));
  return { inline_keyboard: [...rows, back("s")] };
}

export function everyKeyboard(user) {
  const items = [1, 2, 3, 4, 5, 6, 7].map((n) => button(`${n === user.every ? "✓ " : ""}${everyLabel(n)}`, `f:${n}`));
  const rows = [];
  for (let i = 0; i < items.length; i += 2) rows.push(items.slice(i, i + 2));
  return { inline_keyboard: [...rows, back("s")] };
}

export function questionsKeyboard(user, questions) {
  const excluded = JSON.parse(user.excluded);
  return {
    inline_keyboard: [
      ...questions.map((q) => [button(`${excluded.includes(q.id) ? "⬜" : "✅"} ${q.text}`, `q:${q.id}`)]),
      back("s"),
    ],
  };
}
