const test = require("node:test");
const assert = require("node:assert/strict");
const {
  completarDni,
  generarCuil,
  generarCuilPorSexo,
  normalizarCuil,
  prefijoDesdeSexo,
  validarCuil,
} = require("../lib/cuil");

test("genera un CUIL formateado desde prefijo y DNI", () => {
  assert.equal(generarCuil("17419041", "20"), "20-17419041-1");
});

test("completa DNI menores a 8 dígitos antes de calcular el CUIL", () => {
  assert.equal(completarDni("1234567"), "01234567");
  assert.equal(generarCuil("1234567", "20"), "20-01234567-5");
});

test("valida CUIL con o sin guiones", () => {
  assert.equal(validarCuil("20-17419041-1"), true);
  assert.equal(validarCuil("20174190411"), true);
});

test("genera CUIL desde sexo y DNI", () => {
  assert.equal(prefijoDesdeSexo("masculino"), "20");
  assert.equal(prefijoDesdeSexo("femenino"), "27");
  assert.equal(prefijoDesdeSexo("otro"), "23");
  assert.equal(generarCuilPorSexo("17419041", "femenino"), "27-17419041-6");
});

test("rechaza CUIL con dígito verificador inválido", () => {
  assert.equal(validarCuil("20-17419041-2"), false);
});

test("normaliza el CUIL guardando sólo los 11 dígitos", () => {
  assert.equal(normalizarCuil("20-17419041-1"), "20174190411");
});
