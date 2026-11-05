// One command to put a bot on Cloudflare: database, queue, config, migrations, code, token, webhook.
// Safe to run again and again: it only creates what is missing.
//
//   CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... TELEGRAM_BOT_TOKEN=... BOT_NAME=babushka npm run deploy
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { webhookSecret } from "../src/telegram.js";

for (const key of ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID", "TELEGRAM_BOT_TOKEN"]) {
  if (!process.env[key]) throw new Error(`${key} is not set`);
}
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const name = (process.env.BOT_NAME || pkg.name).toLowerCase().replace(/[^a-z0-9-]/g, "-");
const queue = `${name}-send`;
const token = process.env.TELEGRAM_BOT_TOKEN;

const wrangler = (args, input) =>
  execFileSync("npx", ["wrangler", ...args], {
    encoding: "utf8",
    input,
    env: { ...process.env, CI: "true", WRANGLER_SEND_METRICS: "false" },
    stdio: ["pipe", "pipe", "inherit"],
  });
const step = (s) => console.log(`\n== ${s}`);

step(`D1 database "${name}"`);
const findDb = () => JSON.parse(wrangler(["d1", "list", "--json"])).find((d) => d.name === name);
let db = findDb();
if (!db) {
  wrangler(["d1", "create", name]);
  db = findDb();
}
const dbId = db.uuid ?? db.id;
console.log("id", dbId);

step(`queue "${queue}"`);
try {
  wrangler(["queues", "info", queue]);
  console.log("exists");
} catch {
  wrangler(["queues", "create", queue]);
  console.log("created");
}

step("wrangler.jsonc");
const config = {
  $schema: "node_modules/wrangler/config-schema.json",
  name,
  main: "src/index.js",
  compatibility_date: "2026-09-01",
  workers_dev: true,
  // every 5 min, 10:00-23:55 Moscow (07-20 UTC): slots are 10:00..11:00, later runs catch up anything missed
  triggers: { crons: ["*/5 7-20 * * *"] },
  d1_databases: [{ binding: "DB", database_name: name, database_id: dbId, migrations_dir: "migrations" }],
  queues: {
    producers: [{ binding: "SEND_QUEUE", queue }],
    consumers: [{ queue, max_batch_size: 40, max_batch_timeout: 5, max_retries: 3 }],
  },
  observability: { enabled: true },
};
writeFileSync("wrangler.jsonc", `${JSON.stringify(config, null, 2)}\n`);

step("migrations");
console.log(wrangler(["d1", "migrations", "apply", name, "--remote"]));

step("deploy");
const out = wrangler(["deploy"]);
console.log(out);
const url = out.match(/https:\/\/[\w.-]+\.workers\.dev/)?.[0];
if (!url) throw new Error("could not find the workers.dev URL in the deploy output (is the workers.dev subdomain set?)");

step("bot token -> Worker secret");
wrangler(["secret", "put", "TELEGRAM_BOT_TOKEN"], token);

step("Telegram webhook");
const tg = async (method, params = {}) => {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(params),
  });
  const body = await res.json();
  if (!body.ok) throw new Error(`${method}: ${body.description}`);
  return body.result;
};
await tg("setWebhook", {
  url: `${url}/telegram`,
  secret_token: await webhookSecret(token),
  allowed_updates: ["message", "callback_query"],
});
await tg("deleteMyCommands"); // everything is buttons now
const info = await tg("getWebhookInfo");
console.log({ url: info.url, pending: info.pending_update_count, last_error: info.last_error_message ?? "none" });
