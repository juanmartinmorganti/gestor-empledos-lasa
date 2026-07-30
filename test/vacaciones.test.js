const test = require("node:test");
const assert = require("node:assert/strict");
const { obtenerFechaCorte, calcularVacaciones, calcularDiasCorridos } = require("../lib/vacaciones");
const { dateRangesOverlap } = require("../server");

test("la fecha de corte es el 31 de diciembre del período seleccionado", () => {
  assert.equal(obtenerFechaCorte(2026).toISOString(), "2026-12-31T00:00:00.000Z");
  assert.equal(obtenerFechaCorte(2027).toISOString(), "2027-12-31T00:00:00.000Z");
});

test("respeta exactamente los límites de antigüedad al cierre del período", () => {
  const casos = [
    ["exactamente 5 años", "2021-12-31", 5, 14],
    ["más de 5 años", "2021-12-30", 5, 21],
    ["exactamente 10 años", "2016-12-31", 10, 21],
    ["más de 10 años", "2016-12-30", 10, 28],
    ["exactamente 20 años", "2006-12-31", 20, 28],
    ["más de 20 años", "2006-12-30", 20, 35],
  ];

  for (const [descripcion, fechaIngreso, antiguedadAnios, diasCorrespondientes] of casos) {
    assert.deepEqual(
      calcularVacaciones(fechaIngreso, 2026),
      { antiguedadAnios, diasCorrespondientes },
      descripcion,
    );
  }
});

test("calcula los días esperados para los cinco casos reales de 2026", () => {
  const casos = [
    ["Pietro", "2006-03-17", 35],
    ["Mota", "2016-04-01", 28],
    ["Fuenza", "2016-07-11", 28],
    ["Natán", "2021-03-01", 21],
    ["Cordero", "2021-11-09", 21],
  ];

  for (const [nombre, fechaIngreso, diasEsperados] of casos) {
    assert.equal(calcularVacaciones(fechaIngreso, 2026).diasCorrespondientes, diasEsperados, nombre);
  }
});

test("calcula días corridos incluyendo la fecha inicial y final", () => {
  assert.equal(calcularDiasCorridos("2026-07-01", "2026-07-01"), 1);
  assert.equal(calcularDiasCorridos("2026-07-01", "2026-07-07"), 7);
});

test("detecta períodos de vacaciones superpuestos", () => {
  assert.equal(dateRangesOverlap("2026-07-01", "2026-07-07", "2026-07-07", "2026-07-10"), true);
  assert.equal(dateRangesOverlap("2026-07-01", "2026-07-07", "2026-07-08", "2026-07-10"), false);
});
