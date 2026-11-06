// The phrase for grandma, question rotation and inline keyboards.

export const SLOTS = 12; // 10:00, 10:05, ..., 10:55 in the user's time zone
export const FIRST_SLOT_MINUTES = 10 * 60;
export const SLOT_STEP = 5;

// Time zones offered in settings: one button per whole-hour offset, west to east.
// Each offset uses a zone WITHOUT daylight saving time, so no two buttons ever show the same time.
// (Users in countries with summer time pick by their clock; after the switch they are an hour off.)
// The first city is the short name shown in settings.
export const ZONES = [
  ["Гавайи", "Pacific/Honolulu"],
  ["Аляска", "Pacific/Gambier"],
  ["Лос-Анджелес, Ванкувер", "Pacific/Pitcairn"],
  ["Денвер, Финикс", "America/Phoenix"],
  ["Чикаго, Мехико", "America/Mexico_City"],
  ["Нью-Йорк, Торонто, Богота", "America/Bogota"],
  ["Каракас, Ла-Пас", "America/Caracas"],
  ["Буэнос-Айрес, Сан-Паулу", "America/Sao_Paulo"],
  ["Фернанду-ди-Норонья", "America/Noronha"],
  ["Азорские острова, Кабо-Верде", "Atlantic/Cape_Verde"],
  ["Лондон, Лиссабон, Рейкьявик", "Atlantic/Reykjavik"],
  ["Берлин, Париж, Белград", "Africa/Lagos"],
  ["Калининград", "Europe/Kaliningrad"],
  ["Москва, Минск, Стамбул", "Europe/Moscow"],
  ["Самара, Тбилиси, Ереван, Дубай", "Europe/Samara"],
  ["Екатеринбург, Ташкент, Алматы", "Asia/Yekaterinburg"],
  ["Омск, Бишкек", "Asia/Omsk"],
  ["Новосибирск, Красноярск, Бангкок", "Asia/Novosibirsk"],
  ["Иркутск, Пекин, Сингапур", "Asia/Irkutsk"],
  ["Якутск, Токио, Сеул", "Asia/Yakutsk"],
  ["Владивосток, Сидней", "Asia/Vladivostok"],
  ["Магадан", "Asia/Magadan"],
  ["Камчатка", "Asia/Kamchatka"],
];
export const DEFAULT_TZ = "Europe/Moscow";

export const zoneLabel = (tz) => ZONES.find(([, z]) => z === tz)?.[0].split(",")[0] ?? tz;

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
  const minutes = Number(p.hour) * 60 + Number(p.minute);
  const localAsUtc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), 0, minutes);
  const offset = Math.round((localAsUtc - Math.floor(date.getTime() / 60000) * 60000) / 60000);
  return { iso: `${p.year}-${p.month}-${p.day}`, minutes, offset };
}

const utc = (offset) => {
  const h = Math.floor(Math.abs(offset) / 60);
  const m = Math.abs(offset) % 60;
  return `UTC${offset < 0 ? "−" : "+"}${h}${m ? `:${String(m).padStart(2, "0")}` : ""}`;
};

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

export const NO_REPEAT = 7; // a question is not asked again within this many messages

export function enabledQuestions(questions, excluded) {
  const left = questions.filter((q) => !excluded.includes(q.id));
  return left.length ? left : questions; // never leave the user with nothing
}

/**
 * Random question that is not among the user's last NO_REPEAT ones.
 * If the user left fewer questions on, the window shrinks so there is always a choice.
 * Returns { question, recent } with the updated history.
 */
export function pickQuestion(questions, excluded, recent, seed) {
  const list = enabledQuestions(questions, excluded);
  const window = Math.min(NO_REPEAT, list.length - 1);
  const blocked = window > 0 ? recent.slice(-window) : [];
  const candidates = list.filter((q) => !blocked.includes(q.id));
  const question = candidates[Math.floor(seededRandom(seed)() * candidates.length)];
  return { question: question.text, recent: [...recent, question.id].slice(-NO_REPEAT) };
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

/** One button per zone, west to east, each with its offset and current time: pick the one matching your clock. */
export function zoneKeyboard(user, now) {
  const rows = ZONES.map(([label, tz]) => ({ label, tz, ...localNow(now, tz) }))
    .sort((a, b) => a.offset - b.offset) // stable: zones with the same offset keep the list order
    .map((z) => [button(`${z.tz === user.tz ? "✓ " : ""}${utc(z.offset)} ${z.label} · ${hhmm(z.minutes)}`, `z:${z.tz}`)]);
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
