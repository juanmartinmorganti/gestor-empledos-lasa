const express = require("express");
const fs = require("fs/promises");
const path = require("path");
const { randomUUID } = require("crypto");
const { calcularVacaciones, calcularDiasCorridos } = require("./lib/vacaciones");
const { normalizarCuil, validarCuil } = require("./lib/cuil");

const app = express();
const DATA_DIR = path.join(__dirname, "data");
const resources = {
  empleados: "empleados.json",
  permisos: "permisos.json",
  vacaciones: "vacaciones.json",
};

app.use(express.json({ limit: "100kb" }));
app.use("/shared", express.static(path.join(__dirname, "lib")));
app.use(express.static(path.join(__dirname, "public")));

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function isValidDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

function validateDateRange(start, end) {
  return isValidDate(start) && isValidDate(end) && start <= end;
}

function parsePeriodo(value) {
  const periodo = Number(value);
  return Number.isInteger(periodo) && periodo >= 1900 && periodo <= 9999 ? periodo : null;
}

function compareLegajo(a, b) {
  const aLegajo = cleanText(a.legajo);
  const bLegajo = cleanText(b.legajo);
  if (aLegajo && bLegajo) {
    return Number(aLegajo) - Number(bLegajo) || aLegajo.localeCompare(bLegajo, "es");
  }
  if (aLegajo) return -1;
  if (bLegajo) return 1;
  return `${a.apellido} ${a.nombre}`.localeCompare(`${b.apellido} ${b.nombre}`, "es");
}

function sameLegajo(a, b) {
  const aLegajo = cleanText(a);
  const bLegajo = cleanText(b);
  return aLegajo !== "" && bLegajo !== "" && Number(aLegajo) === Number(bLegajo);
}

async function readResource(name) {
  const content = await fs.readFile(path.join(DATA_DIR, resources[name]), "utf8");
  return JSON.parse(content);
}

async function writeResource(name, records) {
  const file = path.join(DATA_DIR, resources[name]);
  const temporaryFile = `${file}.tmp`;
  await fs.writeFile(temporaryFile, `${JSON.stringify(records, null, 2)}\n`);
  await fs.rename(temporaryFile, file);
}

function validateEmployee(body) {
  const employee = {
    legajo: cleanText(body.legajo),
    nombre: cleanText(body.nombre),
    apellido: cleanText(body.apellido),
    dni: cleanText(body.dni),
    sexo: cleanText(body.sexo),
    cuil: normalizarCuil(body.cuil),
    puesto: cleanText(body.puesto),
    email: cleanText(body.email),
    fechaIngreso: cleanText(body.fechaIngreso),
  };

  if (!employee.legajo || !employee.nombre || !employee.apellido || !employee.dni || !employee.cuil || !employee.puesto) {
    return { error: "Legajo, nombre, apellido, DNI, CUIL y puesto son obligatorios." };
  }
  if (!/^\d+$/.test(employee.legajo)) {
    return { error: "El legajo debe ser numérico." };
  }
  if (!validarCuil(employee.cuil)) {
    return { error: "El CUIL no es válido. Revisá el prefijo, el DNI y el dígito verificador." };
  }
  if (employee.email && !/^\S+@\S+\.\S+$/.test(employee.email)) {
    return { error: "El email no tiene un formato válido." };
  }
  if (employee.fechaIngreso && !isValidDate(employee.fechaIngreso)) {
    return { error: "La fecha de ingreso no es válida." };
  }
  return { value: employee };
}

async function validatePermission(body) {
  const permission = {
    empleadoId: cleanText(body.empleadoId),
    motivo: cleanText(body.motivo),
    fechaDesde: cleanText(body.fechaDesde),
    fechaHasta: cleanText(body.fechaHasta),
    observaciones: cleanText(body.observaciones),
  };

  if (!permission.empleadoId || !permission.motivo || !permission.fechaDesde || !permission.fechaHasta) {
    return { error: "Empleado, motivo y ambas fechas son obligatorios." };
  }
  if (!validateDateRange(permission.fechaDesde, permission.fechaHasta)) {
    return { error: "El rango de fechas no es válido." };
  }
  const employees = await readResource("empleados");
  if (!employees.some((employee) => employee.id === permission.empleadoId)) {
    return { error: "El empleado seleccionado no existe." };
  }
  return { value: permission };
}

app.get("/api/empleados", async (_req, res, next) => {
  try {
    const employees = await readResource("empleados");
    res.json(employees.sort(compareLegajo));
  } catch (error) { next(error); }
});

app.post("/api/empleados", async (req, res, next) => {
  try {
    const result = validateEmployee(req.body);
    if (result.error) return res.status(400).json({ error: result.error });
    const employees = await readResource("empleados");
    if (employees.some((employee) => sameLegajo(employee.legajo, result.value.legajo))) {
      return res.status(409).json({ error: "Ya existe un empleado con ese legajo." });
    }
    if (employees.some((employee) => employee.dni === result.value.dni)) {
      return res.status(409).json({ error: "Ya existe un empleado con ese DNI." });
    }
    if (employees.some((employee) => employee.cuil === result.value.cuil)) {
      return res.status(409).json({ error: "Ya existe un empleado con ese CUIL." });
    }
    const employee = { id: randomUUID(), ...result.value, creadoEn: new Date().toISOString() };
    employees.push(employee);
    await writeResource("empleados", employees);
    res.status(201).json(employee);
  } catch (error) { next(error); }
});

app.put("/api/empleados/:id", async (req, res, next) => {
  try {
    const result = validateEmployee(req.body);
    if (result.error) return res.status(400).json({ error: result.error });
    const employees = await readResource("empleados");
    const index = employees.findIndex((employee) => employee.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: "Empleado no encontrado." });
    if (employees.some((employee, employeeIndex) => employeeIndex !== index && sameLegajo(employee.legajo, result.value.legajo))) {
      return res.status(409).json({ error: "Ya existe un empleado con ese legajo." });
    }
    if (employees.some((employee, employeeIndex) => employeeIndex !== index && employee.dni === result.value.dni)) {
      return res.status(409).json({ error: "Ya existe un empleado con ese DNI." });
    }
    if (employees.some((employee, employeeIndex) => employeeIndex !== index && employee.cuil === result.value.cuil)) {
      return res.status(409).json({ error: "Ya existe un empleado con ese CUIL." });
    }
    employees[index] = { ...employees[index], ...result.value, actualizadoEn: new Date().toISOString() };
    await writeResource("empleados", employees);
    res.json(employees[index]);
  } catch (error) { next(error); }
});

app.delete("/api/empleados/:id", async (req, res, next) => {
  try {
    const [employees, permissions, vacations] = await Promise.all([
      readResource("empleados"), readResource("permisos"), readResource("vacaciones"),
    ]);
    const index = employees.findIndex((employee) => employee.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: "Empleado no encontrado." });
    if ([...permissions, ...vacations].some((record) => record.empleadoId === req.params.id)) {
      return res.status(409).json({ error: "No se puede eliminar un empleado con permisos o vacaciones registrados." });
    }
    employees.splice(index, 1);
    await writeResource("empleados", employees);
    res.status(204).end();
  } catch (error) { next(error); }
});

app.get("/api/permisos", async (_req, res, next) => {
  try { res.json(await readResource("permisos")); } catch (error) { next(error); }
});

app.post("/api/permisos", async (req, res, next) => {
  try {
    const result = await validatePermission(req.body);
    if (result.error) return res.status(400).json({ error: result.error });
    const records = await readResource("permisos");
    const record = { id: randomUUID(), ...result.value, creadoEn: new Date().toISOString() };
    records.push(record);
    await writeResource("permisos", records);
    res.status(201).json(record);
  } catch (error) { next(error); }
});

app.delete("/api/permisos/:id", async (req, res, next) => {
  try {
    const records = await readResource("permisos");
    const index = records.findIndex((record) => record.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: "Registro no encontrado." });
    records.splice(index, 1);
    await writeResource("permisos", records);
    res.status(204).end();
  } catch (error) { next(error); }
});

app.get("/api/vacaciones/resumen", async (req, res, next) => {
  try {
    const periodo = parsePeriodo(req.query.periodo);
    if (!periodo) return res.status(400).json({ error: "El período debe ser un año válido." });
    const [employees, vacations] = await Promise.all([readResource("empleados"), readResource("vacaciones")]);
    const summary = employees.map((employee) => {
      const { antiguedadAnios, diasCorrespondientes } = calcularVacaciones(employee.fechaIngreso, periodo);
      const diasTomados = vacations
        .filter((vacation) => vacation.empleadoId === employee.id && vacation.periodo === periodo)
        .reduce((total, vacation) => total + Number(vacation.diasTomados || 0), 0);
      return {
        empleadoId: employee.id,
        empleado: `${employee.apellido}, ${employee.nombre}`,
        fechaIngreso: employee.fechaIngreso,
        antiguedadAnios,
        diasCorrespondientes,
        diasTomados,
        saldoPendiente: diasCorrespondientes - diasTomados,
      };
    });
    res.json(summary);
  } catch (error) { next(error); }
});

app.get("/api/vacaciones", async (req, res, next) => {
  try {
    const vacations = await readResource("vacaciones");
    const periodo = req.query.periodo === undefined ? null : parsePeriodo(req.query.periodo);
    if (req.query.periodo !== undefined && !periodo) return res.status(400).json({ error: "El período debe ser un año válido." });
    res.json(periodo ? vacations.filter((vacation) => vacation.periodo === periodo) : vacations);
  } catch (error) { next(error); }
});

async function validateVacation(body, excludedId = null) {
  const vacation = {
    empleadoId: cleanText(body.empleadoId),
    periodo: parsePeriodo(body.periodo),
    fechaDesde: cleanText(body.fechaDesde),
    fechaHasta: cleanText(body.fechaHasta),
    observaciones: cleanText(body.observaciones),
  };
  if (!vacation.empleadoId || !vacation.periodo || !vacation.fechaDesde || !vacation.fechaHasta) {
    return { error: "Empleado, período y ambas fechas son obligatorios." };
  }
  if (!validateDateRange(vacation.fechaDesde, vacation.fechaHasta)) {
    return { error: "El rango de fechas no es válido." };
  }
  if (Number(vacation.fechaDesde.slice(0, 4)) !== vacation.periodo || Number(vacation.fechaHasta.slice(0, 4)) !== vacation.periodo) {
    return { error: "Las vacaciones deben corresponder al período seleccionado." };
  }
  const [employees, vacations] = await Promise.all([readResource("empleados"), readResource("vacaciones")]);
  const employee = employees.find((item) => item.id === vacation.empleadoId);
  if (!employee) return { error: "El empleado seleccionado no existe." };

  const { diasCorrespondientes } = calcularVacaciones(employee.fechaIngreso, vacation.periodo);
  const diasTomados = calcularDiasCorridos(vacation.fechaDesde, vacation.fechaHasta);
  const acumulados = vacations
    .filter((item) => item.id !== excludedId && item.empleadoId === vacation.empleadoId && item.periodo === vacation.periodo)
    .reduce((total, item) => total + Number(item.diasTomados || 0), 0);
  if (acumulados + diasTomados > diasCorrespondientes) {
    return { error: `El tramo supera el saldo disponible de ${diasCorrespondientes - acumulados} día(s).` };
  }
  return { value: { ...vacation, diasTomados } };
}

app.post("/api/vacaciones", async (req, res, next) => {
  try {
    const result = await validateVacation(req.body);
    if (result.error) return res.status(400).json({ error: result.error });
    const records = await readResource("vacaciones");
    const record = { id: randomUUID(), ...result.value, creadoEn: new Date().toISOString() };
    records.push(record);
    await writeResource("vacaciones", records);
    res.status(201).json(record);
  } catch (error) { next(error); }
});

app.put("/api/vacaciones/:id", async (req, res, next) => {
  try {
    const records = await readResource("vacaciones");
    const index = records.findIndex((record) => record.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: "Registro no encontrado." });
    const result = await validateVacation(req.body, req.params.id);
    if (result.error) return res.status(400).json({ error: result.error });
    const record = { ...records[index], ...result.value, actualizadoEn: new Date().toISOString() };
    records[index] = record;
    await writeResource("vacaciones", records);
    res.json(record);
  } catch (error) { next(error); }
});

app.delete("/api/vacaciones/:id", async (req, res, next) => {
  try {
    const records = await readResource("vacaciones");
    const index = records.findIndex((record) => record.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: "Registro no encontrado." });
    records.splice(index, 1);
    await writeResource("vacaciones", records);
    res.status(204).end();
  } catch (error) { next(error); }
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: "No se pudo procesar la solicitud." });
});

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  app.listen(port, () => console.log(`Servidor funcionando en puerto ${port}`));
}

module.exports = app;
