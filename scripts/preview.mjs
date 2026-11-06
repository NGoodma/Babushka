// Print phrases for a few days: npm run preview -- 2026-11-06 14
import { greetingFor, isoFromJdn, jdnFromIso } from "../src/calendar.js";
import { HOLIDAYS, QUESTIONS } from "../src/data.generated.js";
import { phrase, pickQuestion } from "../src/message.js";

const [start = new Date().toISOString().slice(0, 10), days = "7"] = process.argv.slice(2);
let recent = [];
for (let i = 0; i < Number(days); i++) {
  const iso = isoFromJdn(jdnFromIso(start) + i);
  const picked = pickQuestion(QUESTIONS, [], recent, `preview:${i}`);
  recent = picked.recent;
  console.log(iso, phrase(greetingFor(HOLIDAYS, iso), picked.question));
}
