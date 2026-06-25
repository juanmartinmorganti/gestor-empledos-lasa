(function exposeCuilUtils(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.CuilUtils = api;
  }
}(typeof globalThis !== "undefined" ? globalThis : this, function createCuilUtils() {
  const VALID_PREFIXES = new Set(["20", "23", "24", "27"]);
  const PREFIX_BY_SEX = {
    masculino: "20",
    femenino: "27",
    otro: "23",
  };
  const WEIGHTS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

  function limpiarNumeros(value) {
    return String(value ?? "").replace(/\D/g, "");
  }

  function limpiarDni(value) {
    return limpiarNumeros(value);
  }

  function completarDni(value) {
    const dni = limpiarDni(value);
    return dni.length >= 8 ? dni.slice(-8) : dni.padStart(8, "0");
  }

  function normalizarCuil(value) {
    return limpiarNumeros(value);
  }

  function calcularDigitoVerificador(base) {
    const digits = limpiarNumeros(base);
    if (!/^\d{10}$/.test(digits)) return "";

    const sum = digits
      .split("")
      .reduce((total, digit, index) => total + Number(digit) * WEIGHTS[index], 0);
    const result = 11 - (sum % 11);

    if (result === 11) return "0";
    if (result === 10) return "9";
    return String(result);
  }

  function formatearCuil(value) {
    const cuil = normalizarCuil(value);
    return cuil.length === 11 ? `${cuil.slice(0, 2)}-${cuil.slice(2, 10)}-${cuil.slice(10)}` : cuil;
  }

  function generarCuil(dni, prefijo) {
    const prefix = limpiarNumeros(prefijo);
    if (!VALID_PREFIXES.has(prefix)) return "";

    const dniCompleto = completarDni(dni);
    const base = `${prefix}${dniCompleto}`;
    return formatearCuil(`${base}${calcularDigitoVerificador(base)}`);
  }

  function prefijoDesdeSexo(sexo) {
    return PREFIX_BY_SEX[String(sexo ?? "").toLowerCase()] || "";
  }

  function generarCuilPorSexo(dni, sexo) {
    return generarCuil(dni, prefijoDesdeSexo(sexo));
  }

  function validarCuil(value) {
    const cuil = normalizarCuil(value);
    if (!/^\d{11}$/.test(cuil)) return false;

    const prefix = cuil.slice(0, 2);
    if (!VALID_PREFIXES.has(prefix)) return false;

    return calcularDigitoVerificador(cuil.slice(0, 10)) === cuil.slice(10);
  }

  return {
    limpiarNumeros,
    limpiarDni,
    completarDni,
    normalizarCuil,
    calcularDigitoVerificador,
    formatearCuil,
    generarCuil,
    prefijoDesdeSexo,
    generarCuilPorSexo,
    validarCuil,
  };
}));
