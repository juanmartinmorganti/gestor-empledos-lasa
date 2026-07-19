const test = require("node:test");
const assert = require("node:assert/strict");
const { calcularVacaciones, calcularDiasCorridos } = require("../lib/vacaciones");
const { dateRangesOverlap } = require("../server");

test("hasta 5 años de antigüedad corresponden 14 días", () => {
  assert.deepEqual(calcularVacaciones("2022-06-15", 2026), { antiguedadAnios: 4, diasCorrespondientes: 14 });
});

test("más de 5 y hasta 10 años corresponden 21 días", () => {
  assert.deepEqual(calcularVacaciones("2018-01-01", 2026), { antiguedadAnios: 8, diasCorrespondientes: 21 });
});

test("más de 10 y hasta 20 años corresponden 28 días", () => {
  assert.deepEqual(calcularVacaciones("2012-12-31", 2026), { antiguedadAnios: 14, diasCorrespondientes: 28 });
});

test("más de 20 años corresponden 35 días", () => {
  assert.deepEqual(calcularVacaciones("2000-01-01", 2026), { antiguedadAnios: 26, diasCorrespondientes: 35 });
});

test("calcula días corridos incluyendo la fecha inicial y final", () => {
  assert.equal(calcularDiasCorridos("2026-07-01", "2026-07-01"), 1);
  assert.equal(calcularDiasCorridos("2026-07-01", "2026-07-07"), 7);
});

test("detecta períodos de vacaciones superpuestos", () => {
  assert.equal(dateRangesOverlap("2026-07-01", "2026-07-07", "2026-07-07", "2026-07-10"), true);
  assert.equal(dateRangesOverlap("2026-07-01", "2026-07-07", "2026-07-08", "2026-07-10"), false);
});
