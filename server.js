const express = require("express");
const fs = require("fs/promises");
const fsSync = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");
const multer = require("multer");
const { calcularVacaciones, calcularDiasCorridos } = require("./lib/vacaciones");
const { normalizarCuil, validarCuil } = require("./lib/cuil");

const app = express();
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const PERMISSION_UPLOAD_DIR = process.env.PERMISSION_UPLOAD_DIR || path.join(__dirname, "uploads", "permisos");
const MAX_PERMISSION_FILE_SIZE = 10 * 1024 * 1024;
const PERMISSION_FILE_TYPES = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".pdf": "application/pdf",
};
const resources = {
  empleados: "empleados.json",
  permisos: "permisos.json",
  vacaciones: "vacaciones.json",
};

fsSync.mkdirSync(PERMISSION_UPLOAD_DIR, { recursive: true });

const permissionUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => callback(null, PERMISSION_UPLOAD_DIR),
    filename: (_req, file, callback) => callback(null, `permiso-${randomUUID()}${path.extname(file.originalname).toLowerCase()}`),
  }),
  limits: { fileSize: MAX_PERMISSION_FILE_SIZE, files: 1 },
  fileFilter: (_req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    if (!PERMISSION_FILE_TYPES[extension] || PERMISSION_FILE_TYPES[extension] !== file.mimetype) {
      const error = new Error("El documento debe ser una imagen JPG, JPEG, PNG o un archivo PDF.");
      error.status = 400;
      return callback(error);
    }
    callback(null, true);
  },
});

app.use(express.json({ limit: "100kb" }));
app.use("/shared", express.static(path.join(__dirname, "lib")));
app.use("/uploads/permisos", express.static(PERMISSION_UPLOAD_DIR, { dotfiles: "deny", index: false }));
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

function dateRangesOverlap(firstStart, firstEnd, secondStart, secondEnd) {
  return firstStart <= secondEnd && secondStart <= firstEnd;
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

function detectPermissionFileType(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buffer.length >= 5 && buffer.subarray(0, 5).toString("ascii") === "%PDF-") return "application/pdf";
  return null;
}

function safeOriginalFileName(value) {
  const baseName = path.posix.basename(String(value || "documento").replace(/\\/g, "/"));
  return baseName.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 200) || "documento";
}

async function verifyPermissionFile(file) {
  if (!file) return null;
  const handle = await fs.open(file.path, "r");
  try {
    const buffer = Buffer.alloc(8);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    const detectedMime = detectPermissionFileType(buffer.subarray(0, bytesRead));
    if (!detectedMime || detectedMime !== file.mimetype) {
      throw Object.assign(new Error("El contenido del documento no coincide con un formato JPG, PNG o PDF válido."), { status: 400 });
    }
  } finally {
    await handle.close();
  }
  return {
    nombreOriginal: safeOriginalFileName(file.originalname),
    nombreAlmacenado: file.filename,
    url: `/uploads/permisos/${encodeURIComponent(file.filename)}`,
    tipoMime: file.mimetype,
    tamanio: file.size,
    fechaCarga: new Date().toISOString(),
  };
}

async function removeUploadedFile(file) {
  if (!file?.path) return;
  await fs.unlink(file.path).catch((error) => { if (error.code !== "ENOENT") throw error; });
}

function attachmentPath(attachment) {
  const storedName = cleanText(attachment?.nombreAlmacenado);
  if (!storedName || path.basename(storedName) !== storedName) return null;
  return path.join(PERMISSION_UPLOAD_DIR, storedName);
}

async function removeUnusedAttachment(attachment, records) {
  const file = attachmentPath(attachment);
  if (!file) return;
  const isUsed = records.some((record) => record.adjunto?.nombreAlmacenado === attachment.nombreAlmacenado);
  if (!isUsed) await fs.unlink(file).catch((error) => { if (error.code !== "ENOENT") throw error; });
}

async function validatePermission(body) {
  const permission = {
    empleadoId: cleanText(body.empleadoId),
    tipo: cleanText(body.tipo) || "Sin especificar",
    motivo: cleanText(body.motivo),
    fechaDesde: cleanText(body.fechaDesde),
    fechaHasta: cleanText(body.fechaHasta) || cleanText(body.fechaDesde),
    horaDesde: cleanText(body.horaDesde),
    horaHasta: cleanText(body.horaHasta),
    estado: cleanText(body.estado) || "Registrado",
    observaciones: cleanText(body.observaciones),
  };

  if (!permission.empleadoId || !permission.motivo || !permission.fechaDesde || !permission.fechaHasta) {
    return { error: "Empleado, motivo y ambas fechas son obligatorios." };
  }
  if (!validateDateRange(permission.fechaDesde, permission.fechaHasta)) {
    return { error: "El rango de fechas no es válido." };
  }
  if ((permission.horaDesde && !/^([01]\d|2[0-3]):[0-5]\d$/.test(permission.horaDesde)) || (permission.horaHasta && !/^([01]\d|2[0-3]):[0-5]\d$/.test(permission.horaHasta))) {
    return { error: "El horario del permiso no es válido." };
  }
  if (permission.horaDesde && permission.horaHasta && permission.horaDesde > permission.horaHasta) {
    return { error: "La hora de finalización debe ser posterior a la hora de inicio." };
  }
  if (permission.tipo.length > 80 || permission.motivo.length > 120 || permission.estado.length > 40 || permission.observaciones.length > 500) {
    return { error: "Uno de los textos supera la longitud permitida." };
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

app.get("/api/permisos", async (req, res, next) => {
  try {
    const [records, employees] = await Promise.all([readResource("permisos"), readResource("empleados")]);
    const employeesById = new Map(employees.map((employee) => [employee.id, employee]));
    const query = cleanText(req.query.q).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const filtered = records.filter((record) => {
      const employee = employeesById.get(record.empleadoId);
      const date = record.fechaDesde || record.fecha || "";
      if (req.query.empleadoId && record.empleadoId !== req.query.empleadoId) return false;
      if (req.query.legajo && cleanText(employee?.legajo) !== cleanText(req.query.legajo)) return false;
      if (req.query.anio && date.slice(0, 4) !== cleanText(req.query.anio)) return false;
      if (req.query.mes && date.slice(5, 7) !== cleanText(req.query.mes).padStart(2, "0")) return false;
      if (req.query.fechaDesde && date < req.query.fechaDesde) return false;
      if (req.query.fechaHasta && date > req.query.fechaHasta) return false;
      if (req.query.tipo && (record.tipo || "Sin especificar") !== req.query.tipo) return false;
      if (req.query.adjunto === "con" && !record.adjunto) return false;
      if (req.query.adjunto === "sin" && record.adjunto) return false;
      if (query) {
        const searchable = [record.motivo, record.observaciones, record.tipo, employee?.nombre, employee?.apellido, employee?.legajo]
          .join(" ").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
        if (!searchable.includes(query)) return false;
      }
      return true;
    });
    res.json(filtered.sort((a, b) => (b.fechaDesde || b.fecha || "").localeCompare(a.fechaDesde || a.fecha || "")));
  } catch (error) { next(error); }
});

app.post("/api/permisos", permissionUpload.single("documento"), async (req, res, next) => {
  try {
    const attachment = await verifyPermissionFile(req.file);
    const result = await validatePermission(req.body);
    if (result.error) {
      await removeUploadedFile(req.file);
      return res.status(400).json({ error: result.error });
    }
    const records = await readResource("permisos");
    const record = { id: randomUUID(), ...result.value, creadoEn: new Date().toISOString(), ...(attachment ? { adjunto: attachment } : {}) };
    records.push(record);
    try { await writeResource("permisos", records); } catch (error) { await removeUploadedFile(req.file); throw error; }
    res.status(201).json(record);
  } catch (error) { await removeUploadedFile(req.file).catch(() => {}); next(error); }
});

app.put("/api/permisos/:id", permissionUpload.single("documento"), async (req, res, next) => {
  try {
    const records = await readResource("permisos");
    const index = records.findIndex((record) => record.id === req.params.id);
    if (index === -1) {
      await removeUploadedFile(req.file);
      return res.status(404).json({ error: "Registro no encontrado." });
    }
    const attachment = await verifyPermissionFile(req.file);
    const result = await validatePermission(req.body);
    if (result.error) {
      await removeUploadedFile(req.file);
      return res.status(400).json({ error: result.error });
    }
    const previousAttachment = records[index].adjunto;
    const record = {
      ...records[index],
      ...result.value,
      ...(attachment ? { adjunto: attachment } : {}),
      actualizadoEn: new Date().toISOString(),
    };
    records[index] = record;
    try { await writeResource("permisos", records); } catch (error) { await removeUploadedFile(req.file); throw error; }
    if (attachment && previousAttachment) {
      await removeUnusedAttachment(previousAttachment, records).catch((error) => console.error("No se pudo limpiar el adjunto reemplazado:", error));
    }
    res.json(record);
  } catch (error) { await removeUploadedFile(req.file).catch(() => {}); next(error); }
});

app.get("/api/permisos/:id/documento/download", async (req, res, next) => {
  try {
    const records = await readResource("permisos");
    const record = records.find((item) => item.id === req.params.id);
    const file = attachmentPath(record?.adjunto);
    if (!record || !file) return res.status(404).json({ error: "El permiso no tiene un documento adjunto." });
    res.download(file, record.adjunto.nombreOriginal);
  } catch (error) { next(error); }
});

app.delete("/api/permisos/:id", async (req, res, next) => {
  try {
    const records = await readResource("permisos");
    const index = records.findIndex((record) => record.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: "Registro no encontrado." });
    const [removed] = records.splice(index, 1);
    await writeResource("permisos", records);
    if (removed.adjunto) {
      await removeUnusedAttachment(removed.adjunto, records).catch((error) => console.error("No se pudo limpiar el adjunto eliminado:", error));
    }
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
    estado: cleanText(body.estado) || "Registrado",
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
  if (vacation.estado.length > 40 || vacation.observaciones.length > 500) {
    return { error: "El estado o las observaciones superan la longitud permitida." };
  }
  const [employees, vacations] = await Promise.all([readResource("empleados"), readResource("vacaciones")]);
  const employee = employees.find((item) => item.id === vacation.empleadoId);
  if (!employee) return { error: "El empleado seleccionado no existe." };

  const overlapping = vacations.some((item) => item.id !== excludedId
    && item.empleadoId === vacation.empleadoId
    && dateRangesOverlap(vacation.fechaDesde, vacation.fechaHasta, item.fechaDesde, item.fechaHasta));
  if (overlapping) return { error: "El empleado ya tiene vacaciones registradas en parte de ese rango de fechas." };

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
  if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ error: "El documento supera el límite máximo de 10 MB." });
  }
  if (error.status) return res.status(error.status).json({ error: error.message });
  console.error(error);
  res.status(500).json({ error: "No se pudo procesar la solicitud." });
});

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  app.listen(port, () => console.log(`Servidor funcionando en puerto ${port}`));
}

module.exports = app;
module.exports.detectPermissionFileType = detectPermissionFileType;
module.exports.dateRangesOverlap = dateRangesOverlap;
