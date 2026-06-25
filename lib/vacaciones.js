function parseDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function calcularVacaciones(fechaIngreso, periodo) {
  const ingreso = parseDate(fechaIngreso);
  const year = Number(periodo);
  if (!ingreso || !Number.isInteger(year) || year < 1900 || year > 9999) {
    throw new Error("Fecha de ingreso o período inválido.");
  }

  const corte = new Date(Date.UTC(year, 11, 31));
  if (ingreso > corte) {
    return { antiguedadAnios: 0, diasCorrespondientes: 0 };
  }

  let antiguedadAnios = corte.getUTCFullYear() - ingreso.getUTCFullYear();
  const aniversario = new Date(Date.UTC(corte.getUTCFullYear(), ingreso.getUTCMonth(), ingreso.getUTCDate()));
  if (aniversario > corte) antiguedadAnios -= 1;

  let diasCorrespondientes = 14;
  if (antiguedadAnios > 20) diasCorrespondientes = 35;
  else if (antiguedadAnios > 10) diasCorrespondientes = 28;
  else if (antiguedadAnios > 5) diasCorrespondientes = 21;

  return { antiguedadAnios, diasCorrespondientes };
}

function calcularDiasCorridos(fechaDesde, fechaHasta) {
  const desde = parseDate(fechaDesde);
  const hasta = parseDate(fechaHasta);
  if (!desde || !hasta || desde > hasta) throw new Error("Rango de fechas inválido.");
  return Math.round((hasta - desde) / 86_400_000) + 1;
}

module.exports = { calcularVacaciones, calcularDiasCorridos };
