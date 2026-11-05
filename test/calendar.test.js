import assert from "node:assert/strict";
import { test } from "node:test";
import { fromJulian, greetingFor, isoFromJdn, jdnFromIso, orthodoxEaster, toJulian } from "../src/calendar.js";
import { HOLIDAYS } from "../src/data.generated.js";

test("orthodox easter", () => {
  for (const [y, iso] of [[2025, "2025-04-20"], [2026, "2026-04-12"], [2027, "2027-05-02"], [2028, "2028-04-16"]]) {
    assert.equal(isoFromJdn(orthodoxEaster(y)), iso);
  }
});

test("old-style conversion, including the March shift and Julian leap days", () => {
  const cases = [
    ["2026-10-14", [2026, 10, 1]], // Покров
    ["2027-01-07", [2026, 12, 25]], // Рождество
    ["2027-03-13", [2027, 2, 28]],
    ["2028-03-13", [2028, 2, 29]],
    ["2028-03-14", [2028, 3, 1]],
  ];
  for (const [iso, julian] of cases) {
    assert.deepEqual(toJulian(jdnFromIso(iso)), julian);
    assert.equal(isoFromJdn(fromJulian(...julian)), iso);
  }
});

test("every old-style day has a greeting, great feasts match fixed", () => {
  const short = { 2: 29, 4: 30, 6: 30, 9: 30, 11: 30 };
  const days = [];
  for (let m = 1; m <= 12; m++) for (let d = 1; d <= (short[m] ?? 31); d++) {
    days.push(`${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  }
  assert.deepEqual(Object.keys(HOLIDAYS.fixed).sort(), days);
  for (const [k, v] of Object.entries(HOLIDAYS.great)) assert.equal(HOLIDAYS.fixed[k], v);
});

test("every day of ten years resolves", () => {
  for (let j = jdnFromIso("2026-01-01"); j < jdnFromIso("2036-01-01"); j++) {
    const g = greetingFor(HOLIDAYS, isoFromJdn(j));
    assert.ok(g.text && "!.".includes(g.end), isoFromJdn(j));
  }
});

test("priorities", () => {
  assert.match(greetingFor(HOLIDAYS, "2026-10-14").text, /^С Покровом/);
  assert.match(greetingFor(HOLIDAYS, "2027-05-02").text, /^Христос воскресе!/);
  assert.deepEqual(greetingFor(HOLIDAYS, "2034-04-07"), { text: "Сегодня Великая пятница", end: "." }); // vs Благовещение
  assert.match(greetingFor(HOLIDAYS, "2026-02-15").text, /^Со Сретением/); // great beats a movable Sunday
  assert.equal(greetingFor(HOLIDAYS, "2026-11-05").text, "С днём памяти апостола Иакова, брата Господня");
});
