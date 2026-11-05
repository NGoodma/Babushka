// Cloudflare Worker entry: webhook (fetch), schedule (cron) and sending (queue).
import { consumeBatch, handleUpdate, runSchedule } from "./bot.js";
import { webhookSecret } from "./telegram.js";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method !== "POST" || url.pathname !== "/telegram") return new Response("ok");
    const secret = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
    if (secret !== (await webhookSecret(env.TELEGRAM_BOT_TOKEN))) return new Response("forbidden", { status: 403 });
    try {
      await handleUpdate(env, await request.json(), new Date());
    } catch (e) {
      console.error("update failed", e); // still 200, or Telegram would retry the same update forever
    }
    return new Response("ok");
  },

  async scheduled(event, env) {
    const queued = await runSchedule(env, new Date(event.scheduledTime));
    if (queued) console.log("queued", queued);
  },

  async queue(batch, env) {
    await consumeBatch(env, batch);
  },
};
