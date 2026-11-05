// Minimal Telegram Bot API client.

export class TelegramError extends Error {
  constructor(code, description, retryAfter) {
    super(`${code}: ${description}`);
    this.code = code;
    this.description = description;
    this.retryAfter = retryAfter;
  }
}

export async function callTelegram(token, method, params) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(params),
  });
  const body = await res.json();
  if (!body.ok) throw new TelegramError(body.error_code, body.description, body.parameters?.retry_after);
  return body.result;
}

/** Telegram webhook secret, derived from the bot token: no extra secret to manage. */
export async function webhookSecret(token) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}
