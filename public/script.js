const state = { empleados: [], permisos: [], vacaciones: [], resumenVacaciones: [] };
const page = document.body.dataset.page;
const $ = (selector) => document.querySelector(selector);
const status = $("#status");

function setStatus(message, isError = false) {
  status.textContent = message;
  status.classList.toggle("error", isError);
}

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const toggle = $("#theme-toggle");
  const isDark = theme === "dark";
  toggle.querySelector(".theme-label").textContent = isDark ? "Modo claro" : "Modo oscuro";
  toggle.setAttribute("aria-label", isDark ? "Activar modo claro" : "Activar modo oscuro");
  localStorage.setItem("theme", theme);
}

setTheme(localStorage.getItem("theme") || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
$("#theme-toggle").addEventListener("click", () => setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark"));

if ($("#vacation-period")) $("#vacation-period").value = new Date().getFullYear();

function formatDate(value) {
  if (!value) return "—";
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function formatCuil(value) {
  if (!value) return "—";
  return window.CuilUtils ? CuilUtils.formatearCuil(value) : value;
}

function formatLegajo(value) {
  return value || "—";
}

function employeeName(id) {
  const employee = state.empleados.find((item) => item.id === id);
  return employee ? `${employee.apellido}, ${employee.nombre}` : "Empleado eliminado";
}

async function request(url, options = {}) {
  const response = await fetch(url, { headers: { "Content-Type": "application/json" }, ...options });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || "No se pudo completar la operación.");
  }
  return response.status === 204 ? null : response.json();
}

function createButton(label, className, handler) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = label;
  button.addEventListener("click", handler);
  return button;
}

function renderEmployees() {
  const list = $("#employees-list");
  if (!list) return;
  list.replaceChildren();
  state.empleados.forEach((employee) => {
    const row = document.createElement("tr");
    [formatLegajo(employee.legajo), `${employee.apellido}, ${employee.nombre}`, employee.dni, formatCuil(employee.cuil), employee.puesto, formatDate(employee.fechaIngreso)].forEach((value) => {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.append(cell);
    });
    const actions = document.createElement("td");
    actions.className = "table-action";
    actions.append(createButton("Editar", "text-button", () => openEmployeeDialog(employee)), createButton("Eliminar", "text-button danger", () => deleteEmployee(employee)));
    row.append(actions);
    list.append(row);
  });
  $("#employees-empty").hidden = state.empleados.length > 0;
}

function updateEmployeeSelects() {
  document.querySelectorAll(".employee-select").forEach((select) => {
    const currentValue = select.value;
    select.replaceChildren(new Option("Seleccionar empleado", ""));
    state.empleados.forEach((employee) => select.add(new Option(`${employee.apellido}, ${employee.nombre}`, employee.id)));
    select.value = currentValue;
  });
}

function renderRecords(resource, label) {
  const list = $(`#${resource}-list`);
  if (!list) return;
  list.replaceChildren();
  [...state[resource]].sort((a, b) => b.fechaDesde.localeCompare(a.fechaDesde)).forEach((record) => {
    const item = document.createElement("li");
    item.className = "record";
    const content = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = employeeName(record.empleadoId);
    const details = document.createElement("small");
    details.textContent = resource === "vacaciones"
      ? `${formatDate(record.fechaDesde)} al ${formatDate(record.fechaHasta)} · ${record.diasTomados} día(s)`
      : `${record.motivo} · ${formatDate(record.fechaDesde)} al ${formatDate(record.fechaHasta)}`;
    content.append(title, details);
    if (record.observaciones) {
      const notes = document.createElement("small");
      notes.textContent = record.observaciones;
      content.append(notes);
    }
    const actions = document.createElement("div");
    if (resource === "vacaciones") actions.append(createButton("Editar", "text-button", () => openVacationDialog(record)));
    actions.append(createButton("Eliminar", "text-button danger", () => deleteRecord(resource, record.id, label)));
    item.append(content, actions);
    list.append(item);
  });
  $(`#${resource}-empty`).hidden = state[resource].length > 0;
}

function renderVacationSummary() {
  const list = $("#vacation-summary");
  if (!list) return;
  list.replaceChildren();
  state.resumenVacaciones.forEach((item) => {
    const row = document.createElement("tr");
    [
      item.empleado,
      formatDate(item.fechaIngreso),
      `${item.antiguedadAnios} año(s)`,
      `${item.diasCorrespondientes} días`,
      `${item.diasTomados} días`,
      `${item.saldoPendiente} días`,
    ].forEach((value, index) => {
      const cell = document.createElement("td");
      cell.textContent = value;
      if (index === 5) cell.className = item.saldoPendiente > 0 ? "balance-positive" : "balance-zero";
      row.append(cell);
    });
    list.append(row);
  });
  $("#vacation-summary-empty").hidden = state.resumenVacaciones.length > 0;
}

function render() {
  const count = (id, value) => { const element = $(`#${id}`); if (element) element.textContent = value; };
  count("employee-count", state.empleados.length);
  count("permission-count", state.permisos.length);
  count("vacation-count", state.vacaciones.length);
  renderEmployees();
  updateEmployeeSelects();
  renderRecords("permisos", "permiso");
  renderRecords("vacaciones", "vacaciones");
  renderVacationSummary();
}

function selectedVacationPeriod() {
  const input = $("#vacation-period");
  return input ? Number(input.value) : new Date().getFullYear();
}

async function load() {
  try {
    setStatus("Actualizando…");
    const periodo = selectedVacationPeriod();
    const requests = [request("/api/empleados"), request("/api/permisos"), request(page === "vacaciones" ? `/api/vacaciones?periodo=${periodo}` : "/api/vacaciones")];
    if (page === "vacaciones") requests.push(request(`/api/vacaciones/resumen?periodo=${periodo}`));
    const [empleados, permisos, vacaciones, resumenVacaciones = []] = await Promise.all(requests);
    Object.assign(state, { empleados, permisos, vacaciones, resumenVacaciones });
    render();
    setStatus("Datos actualizados");
  } catch (error) { setStatus(error.message, true); }
}

function openEmployeeDialog(employee = null) {
  const form = $("#employee-form");
  form.reset();
  $("#employee-form-error").hidden = true;
  $("#employee-id").value = employee?.id || "";
  $("#employee-dialog-title").textContent = employee ? "Editar empleado" : "Nuevo empleado";
  ["legajo", "nombre", "apellido", "dni", "puesto", "email", "fechaIngreso"].forEach((field) => {
    $(`#${field}`).value = employee?.[field] || "";
  });
  $("#sexo").value = employee?.sexo || sexoDesdeCuil(employee?.cuil) || "";
  $("#cuil").value = employee?.cuil ? formatCuil(employee.cuil) : "";
  updateCuilWarning();
  $("#employee-dialog").showModal();
}

function openVacationDialog(vacation = null) {
  const form = $("#vacation-form");
  form.reset();
  $("#vacation-id").value = vacation?.id || "";
  $("#vacation-dialog-title").textContent = vacation ? "Editar vacaciones" : "Registrar vacaciones";
  form.elements.empleadoId.value = vacation?.empleadoId || "";
  form.elements.periodo.value = vacation?.periodo || selectedVacationPeriod();
  form.elements.fechaDesde.value = vacation?.fechaDesde || "";
  form.elements.fechaHasta.value = vacation?.fechaHasta || "";
  form.elements.observaciones.value = vacation?.observaciones || "";
  $("#vacation-dialog").showModal();
}

async function deleteEmployee(employee) {
  if (!confirm(`¿Eliminar a ${employee.nombre} ${employee.apellido}?`)) return;
  try { await request(`/api/empleados/${employee.id}`, { method: "DELETE" }); await load(); setStatus("Empleado eliminado"); } catch (error) { setStatus(error.message, true); }
}

async function deleteRecord(resource, id, label) {
  if (!confirm(`¿Eliminar este ${label}?`)) return;
  try { await request(`/api/${resource}/${id}`, { method: "DELETE" }); await load(); setStatus(`${label[0].toUpperCase()}${label.slice(1)} eliminado`); } catch (error) { setStatus(error.message, true); }
}

$("#new-employee")?.addEventListener("click", () => openEmployeeDialog());
document.querySelectorAll("[data-close]").forEach((button) => button.addEventListener("click", () => button.closest("dialog").close()));

function hideEmployeeFormError() {
  $("#employee-form-error").hidden = true;
}

function updateCuilWarning() {
  const cuil = $("#cuil");
  const warning = $("#cuil-warning");
  if (!cuil || !warning || !window.CuilUtils) return true;

  const hasValue = cuil.value.trim().length > 0;
  const isValid = CuilUtils.validarCuil(cuil.value);
  warning.hidden = !hasValue || isValid;
  cuil.classList.toggle("input-warning", hasValue && !isValid);
  return !hasValue || isValid;
}

function sexoDesdeCuil(cuil) {
  const prefix = String(cuil || "").replace(/\D/g, "").slice(0, 2);
  if (prefix === "20") return "masculino";
  if (prefix === "27") return "femenino";
  if (prefix === "23" || prefix === "24") return "otro";
  return "";
}

function updateCuilSuggestion() {
  const dni = $("#dni");
  const sexo = $("#sexo");
  const cuil = $("#cuil");
  if (!dni || !sexo || !cuil || !window.CuilUtils || !dni.value.trim() || !sexo.value) return;

  cuil.value = CuilUtils.generarCuilPorSexo(dni.value, sexo.value);
  updateCuilWarning();
}

$("#dni")?.addEventListener("input", () => {
  hideEmployeeFormError();
  updateCuilSuggestion();
});

$("#legajo")?.addEventListener("input", (event) => {
  event.target.value = event.target.value.replace(/\D/g, "");
  hideEmployeeFormError();
});

$("#sexo")?.addEventListener("change", () => {
  hideEmployeeFormError();
  updateCuilSuggestion();
});

$("#cuil")?.addEventListener("input", () => {
  hideEmployeeFormError();
  updateCuilWarning();
});

$("#cuil")?.addEventListener("blur", (event) => {
  if (!window.CuilUtils) return;
  event.target.value = CuilUtils.formatearCuil(event.target.value);
  updateCuilWarning();
});

document.querySelectorAll("[data-open]").forEach((button) => button.addEventListener("click", () => {
  if (!state.empleados.length) return setStatus("Primero cargá al menos un empleado.", true);
  if (button.dataset.open === "vacation-dialog") return openVacationDialog();
  const dialog = $(`#${button.dataset.open}`);
  dialog.querySelector("form").reset();
  dialog.showModal();
}));

$("#vacation-period")?.addEventListener("change", () => {
  const period = selectedVacationPeriod();
  if (!Number.isInteger(period) || period < 1900 || period > 9999) return setStatus("Ingresá un período válido.", true);
  load();
});

$("#employee-form")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const id = $("#employee-id").value;
  const payload = Object.fromEntries(new FormData(event.currentTarget));
  if (!window.CuilUtils || !CuilUtils.validarCuil(payload.cuil)) {
    const message = "Ingresá un CUIL argentino válido. Puede tener guiones o sólo 11 números.";
    $("#employee-form-error").textContent = message;
    $("#employee-form-error").hidden = false;
    $("#cuil").focus();
    setStatus(message, true);
    return;
  }
  payload.cuil = CuilUtils.normalizarCuil(payload.cuil);
  try {
    await request(id ? `/api/empleados/${id}` : "/api/empleados", { method: id ? "PUT" : "POST", body: JSON.stringify(payload) });
    $("#employee-dialog").close(); await load(); setStatus(id ? "Empleado actualizado" : "Empleado creado");
  } catch (error) { setStatus(error.message, true); }
});

[{ resource: "permisos", formId: "permission-form", dialogId: "permission-dialog" }].forEach(({ resource, formId, dialogId }) => {
  $(`#${formId}`)?.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await request(`/api/${resource}`, { method: "POST", body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))) });
      $(`#${dialogId}`).close(); await load(); setStatus(resource === "permisos" ? "Permiso registrado" : "Vacaciones registradas");
    } catch (error) { setStatus(error.message, true); }
  });
});

$("#vacation-form")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const id = $("#vacation-id").value;
  try {
    await request(id ? `/api/vacaciones/${id}` : "/api/vacaciones", {
      method: id ? "PUT" : "POST",
      body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))),
    });
    $("#vacation-dialog").close();
    await load();
    setStatus(id ? "Vacaciones actualizadas" : "Vacaciones registradas");
  } catch (error) { setStatus(error.message, true); }
});

load();
