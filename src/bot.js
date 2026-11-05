// Bot logic: Telegram updates (webhook), the schedule (cron) and sending (queue consumer).
import { greetingFor } from "./calendar.js";
import { HOLIDAYS, QUESTIONS } from "./data.generated.js";
import {
  everyKeyboard,
  everyLabel,
  FIRST_SLOT_MINUTES,
  localNow,
  mainKeyboard,
  phrase,
  pickQuestion,
  questionsKeyboard,
  SLOT_STEP,
  SLOTS,
  settingsKeyboard,
  slotTime,
  ZONES,
  zoneKeyboard,
  zoneLabel,
} from "./message.js";
import { callTelegram, TelegramError } from "./telegram.js";

const MAX_PER_RUN = 500; // users enqueued by one cron run; the rest go on the next run (5 min later)
const MAX_SCANNED = 5000; // users read by one cron run

const tg = (env, method, params) => callTelegram(env.TELEGRAM_BOT_TOKEN, method, params);
const getUser = (env, chatId) => env.DB.prepare("SELECT * FROM users WHERE chat_id = ?1").bind(chatId).first();
const daysBetween = (a, b) => (Date.parse(b) - Date.parse(a)) / 86400000;

function phraseFor(user, iso) {
  const question = pickQuestion(QUESTIONS, JSON.parse(user.excluded), user.chat_id, user.sent_count);
  return phrase(greetingFor(HOLIDAYS, iso), question);
}

/** The least busy slot; ties go to the earliest, so users fill 10:00, 10:05, ... 10:55, then 10:00 again. */
async function freeSlot(env) {
  const { results } = await env.DB.prepare("SELECT slot, COUNT(*) AS n FROM users GROUP BY slot").all();
  const counts = new Array(SLOTS).fill(0);
  for (const r of results) if (r.slot < SLOTS) counts[r.slot] = r.n;
  return counts.indexOf(Math.min(...counts));
}

async function sendPhrase(env, user, now, { scheduled }) {
  const { iso } = localNow(now, user.tz);
  const text = phraseFor(user, iso);
  await tg(env, "sendMessage", { chat_id: user.chat_id, text, reply_markup: mainKeyboard(text) });
  const sql = scheduled
    ? "UPDATE users SET sent_count = sent_count + 1, last_sent = ?2 WHERE chat_id = ?1"
    : "UPDATE users SET sent_count = sent_count + 1 WHERE chat_id = ?1";
  await env.DB.prepare(sql).bind(user.chat_id, iso).run();
}

// --- webhook -----------------------------------------------------------------------------

export async function handleUpdate(env, update, now) {
  if (update.callback_query) return handleCallback(env, update.callback_query, now);
  const msg = update.message;
  if (!msg || msg.chat?.type !== "private") return;
  const chatId = msg.chat.id;
  let user = await getUser(env, chatId);

  if ((msg.text ?? "").startsWith("/start")) {
    if (!user) {
      const slot = await freeSlot(env);
      await env.DB.prepare("INSERT INTO users (chat_id, slot) VALUES (?1, ?2)").bind(chatId, slot).run();
      user = await getUser(env, chatId);
    }
    await tg(env, "sendMessage", { chat_id: chatId, text: welcomeText(user) });
    await sendPhrase(env, user, now, { scheduled: true });
    return;
  }
  if (!user) {
    await tg(env, "sendMessage", { chat_id: chatId, text: "Чтобы подписаться, нажми /start" });
    return;
  }
  await sendPhrase(env, user, now, { scheduled: false }); // any message = one more phrase right now
}

function welcomeText(user) {
  return (
    "Привет! Я помогаю не забывать писать бабушке.\n\n" +
    `${capitalize(everyLabel(user.every))} в ${slotTime(user.slot)} я пришлю готовое сообщение ` +
    "с православным праздником или памятью святого этого дня. Нажми «Скопировать» и отправь его бабушке.\n\n" +
    `Время считаю по часовому поясу «${zoneLabel(user.tz)}». Если у тебя другой, поменяй его в «Настройках» ` +
    "под сообщением. Там же можно выбрать, как часто присылать, и убрать неподходящие вопросы. " +
    "Если захочется ещё одно сообщение, просто напиши мне что угодно.\n\nВот сообщение на сегодня:"
  );
}

const capitalize = (s) => s[0].toUpperCase() + s.slice(1);

async function handleCallback(env, cq, now) {
  const chatId = cq.message?.chat?.id;
  const user = chatId && (await getUser(env, chatId));
  if (!user) {
    await tg(env, "answerCallbackQuery", { callback_query_id: cq.id, text: "Сначала нажми /start" });
    return;
  }
  const [action, arg] = (cq.data ?? "").split(":");
  const set = (column, value) =>
    env.DB.prepare(`UPDATE users SET ${column} = ?2 WHERE chat_id = ?1`).bind(chatId, value).run();
  let markup = null;
  let toast;

  if (action === "m") markup = mainKeyboard(cq.message.text ?? "");
  else if (action === "s") markup = settingsKeyboard(user, QUESTIONS);
  else if (action === "f" && !arg) markup = everyKeyboard(user);
  else if (action === "f") {
    const every = Number(arg);
    if (every >= 1 && every <= 7) {
      await set("every", every);
      user.every = every;
      toast = `Буду присылать ${everyLabel(every)}`;
    }
    markup = settingsKeyboard(user, QUESTIONS);
  } else if (action === "q" && !arg) markup = questionsKeyboard(user, QUESTIONS);
  else if (action === "q") {
    const excluded = JSON.parse(user.excluded);
    const known = QUESTIONS.some((q) => q.id === arg);
    const next = excluded.includes(arg) ? excluded.filter((id) => id !== arg) : [...excluded, arg];
    if (known && QUESTIONS.some((q) => !next.includes(q.id))) {
      user.excluded = JSON.stringify(next);
      await set("excluded", user.excluded);
      markup = questionsKeyboard(user, QUESTIONS);
    } else if (known) toast = "Оставь хотя бы один вопрос";
  } else if (action === "z" && !arg) markup = zoneKeyboard(user, now);
  else if (action === "z") {
    const zone = ZONES.find(([, tz]) => tz === arg);
    if (zone) {
      await set("tz", zone[1]);
      user.tz = zone[1];
      toast = `Буду присылать в ${slotTime(user.slot)} по времени «${zoneLabel(zone[1])}»`;
    }
    markup = settingsKeyboard(user, QUESTIONS);
  }

  await tg(env, "answerCallbackQuery", { callback_query_id: cq.id, ...(toast && { text: toast }) });
  if (!markup) return;
  try {
    await tg(env, "editMessageReplyMarkup", {
      chat_id: chatId,
      message_id: cq.message.message_id,
      reply_markup: markup,
    });
  } catch (e) {
    if (!(e instanceof TelegramError && /not modified/i.test(e.description))) throw e;
  }
}

// --- cron: pick who is due and put them into the queue ---------------------------------------

/** Due = their slot has come in their own time zone and `every` days passed since the last message. */
export function isDue(user, now) {
  const { iso, minutes } = localNow(now, user.tz);
  if (minutes < FIRST_SLOT_MINUTES + SLOT_STEP * user.slot) return false;
  return user.last_sent === null || daysBetween(user.last_sent, iso) >= user.every;
}

export async function runSchedule(env, now) {
  // The furthest-ahead zone (UTC+14) decides the latest date anyone can have; the exact check is in isDue.
  const latest = new Date(now.getTime() + 14 * 3600 * 1000).toISOString().slice(0, 10);
  const { results } = await env.DB.prepare(
    `SELECT * FROM users WHERE last_sent IS NULL OR julianday(?1) - julianday(last_sent) >= every LIMIT ${MAX_SCANNED}`,
  )
    .bind(latest)
    .all();
  const due = results.filter((u) => isDue(u, now)).slice(0, MAX_PER_RUN);
  if (!due.length) return 0;

  const marks = due.map((u) => ({ c: u.chat_id, d: localNow(now, u.tz).iso }));
  const messages = due.map((u, i) => ({ body: { chat_id: u.chat_id, text: phraseFor(u, marks[i].d) } }));
  // Mark first, in one query (free plan allows 50 D1 queries per run): the next run must not pick them again.
  await env.DB.prepare(
    `UPDATE users SET sent_count = sent_count + 1,
       last_sent = (SELECT json_extract(value, '$.d') FROM json_each(?1) WHERE json_extract(value, '$.c') = users.chat_id)
     WHERE chat_id IN (SELECT json_extract(value, '$.c') FROM json_each(?1))`,
  )
    .bind(JSON.stringify(marks))
    .run();
  for (let i = 0; i < messages.length; i += 100) await env.SEND_QUEUE.sendBatch(messages.slice(i, i + 100));
  return messages.length;
}

// --- queue consumer: actually send (max 40 per batch, under the 50 subrequests limit) ---------

export async function consumeBatch(env, batch) {
  for (const msg of batch.messages) {
    const { chat_id, text } = msg.body;
    try {
      await tg(env, "sendMessage", { chat_id, text, reply_markup: mainKeyboard(text) });
      msg.ack();
    } catch (e) {
      if (e instanceof TelegramError && e.code === 403) {
        // the user blocked the bot or deleted their account
        await env.DB.prepare("DELETE FROM users WHERE chat_id = ?1").bind(chat_id).run();
        msg.ack();
      } else if (e instanceof TelegramError && e.code === 429) {
        msg.retry({ delaySeconds: e.retryAfter ?? 5 });
      } else {
        console.error("send failed", chat_id, e);
        msg.retry();
      }
    }
  }
}
