// Orthodox calendar: which holiday or saint to greet grandma with on a given day.
// Dates are handled as Julian Day Numbers (whole days), so there are no time zone surprises.

const UNIX_EPOCH_JDN = 2440588;

/** "YYYY-MM-DD" (civil, Gregorian) -> Julian Day Number. */
export function jdnFromIso(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86400000 + UNIX_EPOCH_JDN;
}

/** Julian Day Number -> old-style (Julian calendar) [year, month, day]. */
export function toJulian(jdn) {
  const c = jdn + 32082;
  const d = Math.floor((4 * c + 3) / 1461);
  const e = c - Math.floor((1461 * d) / 4);
  const m = Math.floor((5 * e + 2) / 153);
  return [d - 4800 + Math.floor(m / 10), m + 3 - 12 * Math.floor(m / 10), e - Math.floor((153 * m + 2) / 5) + 1];
}

/** Old-style (Julian calendar) date -> Julian Day Number. */
export function fromJulian(year, month, day) {
  const a = Math.floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  return day + Math.floor((153 * m + 2) / 5) + 365 * y + Math.floor(y / 4) - 32083;
}

export function isoFromJdn(jdn) {
  return new Date((jdn - UNIX_EPOCH_JDN) * 86400000).toISOString().slice(0, 10);
}

/** Orthodox Easter as a Julian Day Number (Meeus' Julian algorithm). */
export function orthodoxEaster(year) {
  const d = (19 * (year % 19) + 15) % 30;
  const e = (2 * (year % 4) + 4 * (year % 7) - d + 34) % 7;
  const n = d + e + 114;
  return fromJulian(year, Math.floor(n / 31), (n % 31) + 1);
}

const entry = (v) => (typeof v === "string" ? { text: v, end: "!" } : { text: v.greeting, end: v.end ?? "!" });

/**
 * Greeting for a civil date "YYYY-MM-DD": { text, end }.
 * Priority: major movable feast > great fixed feast > other movable day > saint of the day.
 */
export function greetingFor(holidays, iso) {
  const jdn = jdnFromIso(iso);
  const [, month, day] = toJulian(jdn);
  const key = `${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const movable = holidays.movable[jdn - orthodoxEaster(Number(iso.slice(0, 4)))];
  if (movable?.major) return entry(movable);
  if (holidays.great[key]) return entry(holidays.great[key]);
  if (movable) return entry(movable);
  return entry(holidays.fixed[key]);
}
