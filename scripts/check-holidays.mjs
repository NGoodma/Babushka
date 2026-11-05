// Hand check of data/holidays.yaml texts: grammar hints, duplicates, feasts that meet movable days.
// The hard rules (every day covered, great == fixed, dates) are in test/calendar.test.js.
import { fromJulian, greetingFor, isoFromJdn, orthodoxEaster } from "../src/calendar.js";
import { HOLIDAYS } from "../src/data.generated.js";

const text = (v) => (typeof v === "string" ? v : v.greeting);
const all = [
  ...Object.entries(HOLIDAYS.fixed).map(([k, v]) => [`fixed ${k}`, text(v)]),
  ...Object.entries(HOLIDAYS.movable).map(([k, v]) => [`movable ${k}`, text(v)]),
];
const problems = [];
for (const [where, t] of all) {
  if (/(?:^|! )С [СсЗзШшЖжВв][бвгджзйклмнпрстфхцчшщ]/.test(t) && !t.includes("Введением")) {
    problems.push(`${where}: maybe "Со": ${t}`);
  }
  if (!/^(С|Со|Христос|Сегодня) /.test(t)) problems.push(`${where}: odd start: ${t}`);
  if (/[,.! ]$/.test(t)) problems.push(`${where}: bad ending: ${t}`);
}
const seen = new Map();
for (const v of Object.values(HOLIDAYS.fixed)) seen.set(text(v), (seen.get(text(v)) ?? 0) + 1);
const dups = [...seen].filter(([, n]) => n > 1).map(([t]) => t);
console.log("fixed entries:", Object.keys(HOLIDAYS.fixed).length, "| duplicates:", dups.length ? dups : "none");
console.log("PROBLEMS:", problems.length ? `\n  ${problems.join("\n  ")}` : "none");

console.log("\nGreat feasts that fall on movable days, 2026-2035:");
for (let year = 2026; year < 2036; year++) {
  const easter = orthodoxEaster(year);
  for (const key of Object.keys(HOLIDAYS.great)) {
    const [m, d] = key.split("-").map(Number);
    for (const y of [year - 1, year]) {
      const jdn = fromJulian(y, m, d);
      const iso = isoFromJdn(jdn);
      const offset = jdn - easter;
      if (iso.startsWith(String(year)) && HOLIDAYS.movable[offset]) {
        console.log(`  ${iso} ${key} meets movable ${offset} -> ${greetingFor(HOLIDAYS, iso).text}`);
      }
    }
  }
}
