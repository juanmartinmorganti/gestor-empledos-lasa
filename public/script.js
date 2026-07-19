const state = { empleados: [], permisos: [], vacaciones: [], resumenVacaciones: [], resumenVacacionesPorPeriodo: {} };
const page = document.body.dataset.page;
const $ = (selector) => document.querySelector(selector);
const status = $("#status");
const MONTH_NAMES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

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

function employeeInitials(employee) {
  return `${employee.nombre?.[0] || ""}${employee.apellido?.[0] || ""}`.toUpperCase() || "—";
}

function normalizedSearch(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function employeeSex(value) {
  return ({ masculino: "Masculino", femenino: "Femenino", otro: "Otro / asignado por ANSES" })[value] || "—";
}

function employeeName(id) {
  const employee = state.empleados.find((item) => item.id === id);
  return employee ? `${employee.apellido}, ${employee.nombre}` : "Empleado eliminado";
}

async function request(url, options = {}) {
  const isFormData = options.body instanceof FormData;
  const response = await fetch(url, {
    ...options,
    headers: { ...(isFormData ? {} : { "Content-Type": "application/json" }), ...(options.headers || {}) },
  });
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

  const query = normalizedSearch($("#employee-search").value);
  const selectedId = $("#employee-filter").value;
  const employees = state.empleados.filter((employee) => {
    const searchable = normalizedSearch([employee.nombre, employee.apellido, employee.legajo, employee.dni].join(" "));
    return (!query || searchable.includes(query)) && (!selectedId || employee.id === selectedId);
  });

  list.replaceChildren();
  employees.forEach((employee) => {
    const card = document.createElement("article");
    card.className = "employee-card";

    const header = document.createElement("div");
    header.className = "employee-card-header";
    const avatar = document.createElement("span");
    avatar.className = "employee-avatar";
    avatar.setAttribute("aria-hidden", "true");
    avatar.textContent = employeeInitials(employee);
    const identity = document.createElement("div");
    identity.className = "employee-card-identity";
    const name = document.createElement("h2");
    name.textContent = `${employee.nombre} ${employee.apellido}`;
    const position = document.createElement("p");
    position.className = "employee-position";
    position.textContent = employee.puesto || "Puesto sin informar";
    identity.append(name, position);
    const file = document.createElement("span");
    file.className = "employee-file-badge";
    file.textContent = `Legajo ${formatLegajo(employee.legajo)}`;
    header.append(avatar, identity, file);

    const details = document.createElement("dl");
    details.className = "employee-card-details";
    [["DNI", employee.dni || "—"], ["CUIL", formatCuil(employee.cuil)], ["Ingreso", formatDate(employee.fechaIngreso)]].forEach(([label, value]) => {
      const item = document.createElement("div");
      const term = document.createElement("dt");
      const description = document.createElement("dd");
      term.textContent = label;
      description.textContent = value;
      item.append(term, description);
      details.append(item);
    });

    const footer = document.createElement("div");
    footer.className = "employee-card-footer";
    footer.append(createButton("Ver ficha", "button button-secondary", () => openEmployeeDetail(employee)));
    card.append(header, details, footer);
    list.append(card);
  });

  $("#employees-empty").hidden = state.empleados.length > 0;
  $("#employee-filter-empty").hidden = state.empleados.length === 0 || employees.length > 0;
  $("#employee-results-count").textContent = state.empleados.length
    ? `${employees.length} de ${state.empleados.length} empleado${state.empleados.length === 1 ? "" : "s"}`
    : "";
}

function updateEmployeeFilter() {
  const select = $("#employee-filter");
  if (!select) return;
  const currentValue = select.value;
  select.replaceChildren(new Option("Todos los empleados", ""));
  state.empleados.forEach((employee) => select.add(new Option(`${employee.apellido}, ${employee.nombre} · Legajo ${employee.legajo}`, employee.id)));
  select.value = currentValue;
}

function updateEmployeeSelects() {
  document.querySelectorAll(".employee-select").forEach((select) => {
    const currentValue = select.value;
    select.replaceChildren(new Option("Seleccionar empleado", ""));
    state.empleados.forEach((employee) => select.add(new Option(`${employee.apellido}, ${employee.nombre}`, employee.id)));
    select.value = currentValue;
  });
}

function employeeById(id) {
  return state.empleados.find((employee) => employee.id === id);
}

function permissionDate(permission) {
  return permission.fechaDesde || permission.fecha || "";
}

function permissionType(permission) {
  return permission.tipo || "Sin especificar";
}

function permissionTime(permission) {
  if (permission.horaDesde && permission.horaHasta) return `${permission.horaDesde} a ${permission.horaHasta}`;
  if (permission.horaDesde) return `Desde ${permission.horaDesde}`;
  if (permission.horaHasta) return `Hasta ${permission.horaHasta}`;
  return "Sin horario";
}

function sortedPermissions(records) {
  return [...records].sort((a, b) => permissionDate(b).localeCompare(permissionDate(a)) || String(b.creadoEn || "").localeCompare(String(a.creadoEn || "")));
}

function permissionsForPeriod(year, month = null) {
  return state.permisos.filter((permission) => {
    const date = permissionDate(permission);
    return date.slice(0, 4) === String(year) && (month === null || Number(date.slice(5, 7)) === Number(month));
  });
}

function mostFrequentEmployee(records) {
  const counts = new Map();
  records.forEach((permission) => counts.set(permission.empleadoId, (counts.get(permission.empleadoId) || 0) + 1));
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (!top) return { label: "—", count: 0 };
  const employee = employeeById(top[0]);
  return { label: employee ? `${employee.apellido}, ${employee.nombre}` : "Empleado eliminado", count: top[1] };
}

function createPermissionBadge(text, modifier = "") {
  const badge = document.createElement("span");
  badge.className = `permission-badge${modifier ? ` ${modifier}` : ""}`;
  badge.textContent = text;
  return badge;
}

function createDocumentButton(permission, label = "Ver documento") {
  if (!permission.adjunto) {
    const missing = document.createElement("span");
    missing.className = "permission-no-document";
    missing.textContent = "Sin documento adjunto";
    return missing;
  }
  return createButton(label, "text-button permission-document-button", () => openPermissionDocument(permission));
}

function renderPermissionCards(container, records) {
  if (!container) return;
  container.replaceChildren();
  sortedPermissions(records).forEach((permission) => {
    const employee = employeeById(permission.empleadoId);
    const card = document.createElement("article");
    card.className = "permission-card";
    const header = document.createElement("div");
    header.className = "permission-card-header";
    const identity = document.createElement("div");
    const name = document.createElement("h2");
    name.textContent = employee ? `${employee.apellido}, ${employee.nombre}` : "Empleado eliminado";
    const file = document.createElement("p");
    file.textContent = `Legajo ${formatLegajo(employee?.legajo)}`;
    identity.append(name, file);
    const badges = document.createElement("div");
    badges.className = "permission-badges";
    badges.append(createPermissionBadge(permissionType(permission)), createPermissionBadge(permission.estado || "Registrado", "permission-status-badge"));
    header.append(identity, badges);

    const date = document.createElement("p");
    date.className = "permission-card-date";
    date.textContent = permission.fechaHasta && permission.fechaHasta !== permissionDate(permission)
      ? `${formatDate(permissionDate(permission))} al ${formatDate(permission.fechaHasta)} · ${permissionTime(permission)}`
      : `${formatDate(permissionDate(permission))} · ${permissionTime(permission)}`;
    const reason = document.createElement("h3");
    reason.textContent = permission.motivo || "Sin motivo informado";
    const notes = document.createElement("p");
    notes.className = "permission-card-notes";
    notes.textContent = permission.observaciones || "Sin observaciones";
    const documentState = document.createElement("div");
    documentState.className = `permission-document-state${permission.adjunto ? " has-document" : ""}`;
    documentState.append(createPermissionBadge(permission.adjunto ? "Documento adjunto" : "Sin documento", permission.adjunto ? "has-document" : ""));
    if (permission.adjunto) documentState.append(createDocumentButton(permission));
    const actions = document.createElement("div");
    actions.className = "permission-card-actions";
    actions.append(createButton("Ver detalle", "button button-secondary", () => openPermissionDetail(permission)));
    card.append(header, date, reason, notes, documentState, actions);
    container.append(card);
  });
}

function updatePermissionEmployeeFilters() {
  document.querySelectorAll(".permission-employee-filter").forEach((select) => {
    const currentValue = select.value;
    select.replaceChildren(new Option("Todos los empleados", ""));
    state.empleados.forEach((employee) => select.add(new Option(`${employee.apellido}, ${employee.nombre} · Legajo ${employee.legajo}`, employee.id)));
    select.value = currentValue;
  });
}

function renderCurrentPermissions() {
  const container = $("#permissions-current-list");
  if (!container) return;
  const now = new Date();
  const monthRecords = permissionsForPeriod(now.getFullYear(), now.getMonth() + 1);
  const query = normalizedSearch($("#permission-current-search").value);
  const filtered = monthRecords.filter((permission) => {
    const employee = employeeById(permission.empleadoId);
    return !query || normalizedSearch([employee?.nombre, employee?.apellido, employee?.legajo, permission.motivo, permission.observaciones].join(" ")).includes(query);
  });
  const top = mostFrequentEmployee(monthRecords);
  $("#permission-current-period").textContent = `${MONTH_NAMES[now.getMonth()]} ${now.getFullYear()}`;
  $("#permission-month-total").textContent = monthRecords.length;
  $("#permission-month-employees").textContent = new Set(monthRecords.map((permission) => permission.empleadoId)).size;
  $("#permission-month-top").textContent = top.count ? `${top.label} (${top.count})` : "—";
  renderPermissionCards(container, filtered);
  $("#permissions-current-empty").hidden = filtered.length > 0;
}

function historyFilteredPermissions() {
  const employeeId = $("#permission-history-employee").value;
  const legajo = $("#permission-history-file").value.trim();
  const month = $("#permission-history-month").value;
  const year = $("#permission-history-year").value;
  const from = $("#permission-history-from").value;
  const to = $("#permission-history-to").value;
  const type = $("#permission-history-type").value;
  const attachment = $("#permission-history-attachment").value;
  const query = normalizedSearch($("#permission-history-query").value);
  return state.permisos.filter((permission) => {
    const employee = employeeById(permission.empleadoId);
    const date = permissionDate(permission);
    if (employeeId && permission.empleadoId !== employeeId) return false;
    if (legajo && String(employee?.legajo || "") !== legajo) return false;
    if (month && date.slice(5, 7) !== month) return false;
    if (year && date.slice(0, 4) !== year) return false;
    if (from && date < from) return false;
    if (to && date > to) return false;
    if (type && permissionType(permission) !== type) return false;
    if (attachment === "con" && !permission.adjunto) return false;
    if (attachment === "sin" && permission.adjunto) return false;
    if (query && !normalizedSearch([permission.motivo, permission.observaciones, permission.tipo, employee?.nombre, employee?.apellido].join(" ")).includes(query)) return false;
    return true;
  });
}

function renderPermissionHistory() {
  const container = $("#permissions-history-list");
  if (!container) return;
  const records = historyFilteredPermissions();
  renderPermissionCards(container, records);
  $("#permission-history-count").textContent = `${records.length} permiso${records.length === 1 ? "" : "s"} encontrado${records.length === 1 ? "" : "s"}`;
  $("#permissions-history-empty").hidden = records.length > 0;
}

function renderMonthBreakdown(container, records) {
  if (!container) return;
  container.replaceChildren();
  MONTH_NAMES.forEach((month, index) => {
    const item = document.createElement("div");
    const label = document.createElement("span");
    const count = document.createElement("strong");
    label.textContent = month;
    count.textContent = records.filter((permission) => Number(permissionDate(permission).slice(5, 7)) === index + 1).length;
    item.append(label, count);
    container.append(item);
  });
}

function renderAnnualPermissions() {
  const list = $("#permission-annual-list");
  if (!list) return;
  const year = Number($("#permission-annual-year").value) || new Date().getFullYear();
  const records = permissionsForPeriod(year);
  const top = mostFrequentEmployee(records);
  $("#permission-year-total").textContent = records.length;
  $("#permission-year-employees").textContent = new Set(records.map((permission) => permission.empleadoId)).size;
  $("#permission-year-top").textContent = top.count ? `${top.label} (${top.count})` : "—";
  renderMonthBreakdown($("#permission-month-breakdown"), records);
  list.replaceChildren();
  state.empleados.forEach((employee) => {
    const employeeRecords = records.filter((permission) => permission.empleadoId === employee.id);
    const row = document.createElement("tr");
    const values = [`${employee.apellido}, ${employee.nombre}`, formatLegajo(employee.legajo)];
    MONTH_NAMES.forEach((_month, index) => values.push(employeeRecords.filter((permission) => Number(permissionDate(permission).slice(5, 7)) === index + 1).length));
    values.push(employeeRecords.length);
    values.forEach((value, index) => {
      const cell = document.createElement("td");
      cell.textContent = value;
      if (index === values.length - 1) cell.className = "annual-total";
      row.append(cell);
    });
    list.append(row);
  });
  $("#permission-annual-empty").hidden = records.length > 0;
}

function renderPermissions() {
  if (page !== "permisos") return;
  updatePermissionEmployeeFilters();
  renderCurrentPermissions();
  renderPermissionHistory();
  renderAnnualPermissions();
}

function vacationSummary(period) {
  return state.resumenVacacionesPorPeriodo[period] || [];
}

async function ensureVacationSummary(period) {
  const year = Number(period);
  if (!Number.isInteger(year) || year < 1900 || year > 9999) throw new Error("Ingresá un año válido.");
  if (!state.resumenVacacionesPorPeriodo[year]) {
    state.resumenVacacionesPorPeriodo[year] = await request(`/api/vacaciones/resumen?periodo=${year}`);
  }
  return state.resumenVacacionesPorPeriodo[year];
}

function vacationRecordsFor(employeeId, period = null) {
  return state.vacaciones
    .filter((vacation) => vacation.empleadoId === employeeId && (period === null || vacation.periodo === Number(period)))
    .sort((a, b) => b.fechaDesde.localeCompare(a.fechaDesde));
}

function vacationBalanceState(summary) {
  if (summary.saldoPendiente < 0) return { key: "exceeded", label: "Excedido" };
  if (summary.diasTomados === 0) return { key: "none", label: "Sin vacaciones registradas" };
  if (summary.saldoPendiente === 0) return { key: "used", label: "Saldo utilizado" };
  return { key: "pending", label: "Saldo disponible" };
}

function updateVacationEmployeeFilters() {
  document.querySelectorAll(".vacation-employee-filter").forEach((select) => {
    const currentValue = select.value;
    select.replaceChildren(new Option("Todos los empleados", ""));
    state.empleados.forEach((employee) => select.add(new Option(`${employee.apellido}, ${employee.nombre} · Legajo ${employee.legajo}`, employee.id)));
    select.value = currentValue;
  });
}

function createVacationMetric(label, value, modifier = "") {
  const item = document.createElement("div");
  if (modifier) item.className = modifier;
  const term = document.createElement("span");
  const amount = document.createElement("strong");
  term.textContent = label;
  amount.textContent = `${value} día${Number(value) === 1 ? "" : "s"}`;
  item.append(term, amount);
  return item;
}

function openVacationEmployeeFromRecord(record) {
  openVacationEmployeeDetail(record.empleadoId, record.periodo);
}

function renderCurrentVacations() {
  const grid = $("#vacation-employee-grid");
  if (!grid) return;
  const period = Number($("#vacation-current-year").value) || new Date().getFullYear();
  const summary = vacationSummary(period);
  const query = normalizedSearch($("#vacation-current-search").value);
  const employeeId = $("#vacation-current-employee").value;
  const statusFilter = $("#vacation-current-status").value;
  const filtered = summary.filter((item) => {
    const employee = employeeById(item.empleadoId);
    const stateInfo = vacationBalanceState(item);
    const matchesText = !query || normalizedSearch([employee?.nombre, employee?.apellido, employee?.legajo, employee?.dni].join(" ")).includes(query);
    return matchesText && (!employeeId || item.empleadoId === employeeId) && (!statusFilter || stateInfo.key === statusFilter);
  });
  $("#vacation-current-period").textContent = `Vacaciones ${period}`;
  $("#vacation-current-employees").textContent = summary.length;
  $("#vacation-current-assigned").textContent = summary.reduce((total, item) => total + item.diasCorrespondientes, 0);
  $("#vacation-current-taken").textContent = summary.reduce((total, item) => total + item.diasTomados, 0);
  $("#vacation-current-balance").textContent = summary.reduce((total, item) => total + Math.max(0, item.saldoPendiente), 0);
  $("#vacation-current-count").textContent = `${filtered.length} de ${summary.length} empleado${summary.length === 1 ? "" : "s"}`;
  grid.replaceChildren();
  filtered.forEach((item) => {
    const employee = employeeById(item.empleadoId);
    const balanceState = vacationBalanceState(item);
    const card = document.createElement("article");
    card.className = `vacation-employee-card balance-${balanceState.key}`;
    const header = document.createElement("div");
    header.className = "vacation-card-header";
    const identity = document.createElement("div");
    const name = document.createElement("h2");
    name.textContent = employee ? `${employee.nombre} ${employee.apellido}` : item.empleado;
    const file = document.createElement("p");
    file.textContent = `Legajo ${formatLegajo(employee?.legajo)}`;
    identity.append(name, file);
    header.append(identity, createPermissionBadge(balanceState.label, `vacation-state-${balanceState.key}`));
    const metrics = document.createElement("div");
    metrics.className = "vacation-card-metrics";
    metrics.append(
      createVacationMetric("Corresponden", item.diasCorrespondientes),
      createVacationMetric("Tomados", item.diasTomados),
      createVacationMetric(item.saldoPendiente < 0 ? "Excedido" : "Saldo", Math.abs(item.saldoPendiente), `vacation-balance-${balanceState.key}`),
    );
    const actions = document.createElement("div");
    actions.className = "vacation-card-actions";
    actions.append(createButton("Ver vacaciones", "button button-secondary", () => openVacationEmployeeDetail(item.empleadoId, period)));
    card.append(header, metrics, actions);
    grid.append(card);
  });
  $("#vacation-current-empty").hidden = filtered.length > 0;
}

function vacationHistoryRecords() {
  const employeeId = $("#vacation-history-employee").value;
  const legajo = $("#vacation-history-file").value.trim();
  const year = $("#vacation-history-year").value;
  const month = $("#vacation-history-month").value;
  const from = $("#vacation-history-from").value;
  const to = $("#vacation-history-to").value;
  const statusValue = $("#vacation-history-status").value;
  const query = normalizedSearch($("#vacation-history-query").value);
  return state.vacaciones.filter((vacation) => {
    const employee = employeeById(vacation.empleadoId);
    if (employeeId && vacation.empleadoId !== employeeId) return false;
    if (legajo && String(employee?.legajo || "") !== legajo) return false;
    if (year && String(vacation.periodo) !== year) return false;
    if (month && vacation.fechaDesde.slice(5, 7) !== month) return false;
    if (from && vacation.fechaDesde < from) return false;
    if (to && vacation.fechaHasta > to) return false;
    if (statusValue && (vacation.estado || "Registrado") !== statusValue) return false;
    if (query && !normalizedSearch(vacation.observaciones).includes(query)) return false;
    return true;
  }).sort((a, b) => b.fechaDesde.localeCompare(a.fechaDesde));
}

function renderVacationHistory() {
  const list = $("#vacation-history-list");
  if (!list) return;
  const records = vacationHistoryRecords();
  list.replaceChildren();
  records.forEach((vacation) => {
    const employee = employeeById(vacation.empleadoId);
    const card = document.createElement("article");
    card.className = "vacation-history-card";
    const header = document.createElement("div");
    header.className = "vacation-card-header";
    const identity = document.createElement("div");
    const name = document.createElement("h2");
    name.textContent = employee ? `${employee.apellido}, ${employee.nombre}` : "Empleado eliminado";
    const file = document.createElement("p");
    file.textContent = `Legajo ${formatLegajo(employee?.legajo)} · Período ${vacation.periodo}`;
    identity.append(name, file);
    header.append(identity, createPermissionBadge(vacation.estado || "Registrado", "permission-status-badge"));
    const dates = document.createElement("p");
    dates.className = "vacation-history-dates";
    dates.textContent = `${formatDate(vacation.fechaDesde)} al ${formatDate(vacation.fechaHasta)}`;
    const days = document.createElement("strong");
    days.className = "vacation-history-days";
    days.textContent = `${vacation.diasTomados} día${vacation.diasTomados === 1 ? "" : "s"}`;
    const notes = document.createElement("p");
    notes.className = "vacation-history-notes";
    notes.textContent = vacation.observaciones || "Sin observaciones";
    const actions = document.createElement("div");
    actions.className = "vacation-card-actions";
    actions.append(createButton("Ver ficha", "button button-secondary", () => openVacationEmployeeFromRecord(vacation)));
    card.append(header, dates, days, notes, actions);
    list.append(card);
  });
  $("#vacation-history-count").textContent = `${records.length} registro${records.length === 1 ? "" : "s"}`;
  $("#vacation-history-empty").hidden = records.length > 0;
}

function renderAnnualVacations() {
  const list = $("#vacation-annual-list");
  if (!list) return;
  const period = Number($("#vacation-annual-year").value) || new Date().getFullYear();
  const summary = vacationSummary(period);
  const assigned = summary.reduce((total, item) => total + item.diasCorrespondientes, 0);
  const taken = summary.reduce((total, item) => total + item.diasTomados, 0);
  $("#vacation-year-assigned").textContent = assigned;
  $("#vacation-year-taken").textContent = taken;
  $("#vacation-year-balance").textContent = summary.reduce((total, item) => total + Math.max(0, item.saldoPendiente), 0);
  $("#vacation-year-pending").textContent = summary.filter((item) => item.saldoPendiente > 0).length;
  $("#vacation-year-used").textContent = summary.filter((item) => item.diasCorrespondientes > 0 && item.saldoPendiente === 0).length;
  list.replaceChildren();
  summary.forEach((item) => {
    const employee = employeeById(item.empleadoId);
    const stateInfo = vacationBalanceState(item);
    const row = document.createElement("tr");
    [`${employee?.apellido || ""}, ${employee?.nombre || ""}`, formatLegajo(employee?.legajo), item.diasCorrespondientes, item.diasTomados, item.saldoPendiente, stateInfo.label].forEach((value, index) => {
      const cell = document.createElement("td");
      cell.textContent = value;
      if (index === 4) cell.className = item.saldoPendiente < 0 ? "balance-exceeded" : item.saldoPendiente > 0 ? "balance-positive" : "balance-zero";
      if (index === 5) cell.className = `vacation-table-state vacation-state-${stateInfo.key}`;
      row.append(cell);
    });
    list.append(row);
  });
  $("#vacation-annual-empty").hidden = summary.length > 0;
}

function renderVacations() {
  if (page !== "vacaciones") return;
  updateVacationEmployeeFilters();
  renderCurrentVacations();
  renderVacationHistory();
  renderAnnualVacations();
}

function render() {
  const count = (id, value) => { const element = $(`#${id}`); if (element) element.textContent = value; };
  count("employee-count", state.empleados.length);
  count("permission-count", state.permisos.length);
  count("vacation-count", state.vacaciones.length);
  updateEmployeeFilter();
  renderEmployees();
  updateEmployeeSelects();
  renderPermissions();
  renderVacations();
}

function selectedVacationPeriod() {
  const input = $("#vacation-current-year");
  return input ? Number(input.value) : new Date().getFullYear();
}

async function load() {
  try {
    setStatus("Actualizando…");
    const periodo = selectedVacationPeriod();
    const requests = [request("/api/empleados"), request("/api/permisos"), request("/api/vacaciones")];
    if (page === "vacaciones") requests.push(request(`/api/vacaciones/resumen?periodo=${periodo}`));
    const [empleados, permisos, vacaciones, resumenVacaciones = []] = await Promise.all(requests);
    Object.assign(state, { empleados, permisos, vacaciones, resumenVacaciones });
    if (page === "vacaciones") state.resumenVacacionesPorPeriodo = { [periodo]: resumenVacaciones };
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

function openEmployeeDetail(employee) {
  const dialog = $("#employee-detail-dialog");
  if (!dialog) return;
  dialog.dataset.employeeId = employee.id;
  $("#employee-detail-name").textContent = `${employee.nombre} ${employee.apellido}`;
  $("#employee-detail-initials").textContent = employeeInitials(employee);
  $("#employee-detail-position").textContent = employee.puesto || "Puesto sin informar";
  $("#employee-detail-file").textContent = `Legajo ${formatLegajo(employee.legajo)}`;
  const values = {
    "employee-detail-first-name": employee.nombre,
    "employee-detail-last-name": employee.apellido,
    "employee-detail-legajo": formatLegajo(employee.legajo),
    "employee-detail-dni": employee.dni,
    "employee-detail-cuil": formatCuil(employee.cuil),
    "employee-detail-sex": employeeSex(employee.sexo),
    "employee-detail-job": employee.puesto,
    "employee-detail-start-date": formatDate(employee.fechaIngreso),
    "employee-detail-email": employee.email,
  };
  Object.entries(values).forEach(([id, value]) => { $(`#${id}`).textContent = value || "—"; });
  if ($("#employee-permission-year")) $("#employee-permission-year").value = new Date().getFullYear();
  renderEmployeePermissions(employee.id);
  dialog.showModal();
}

function createMiniPermission(permission) {
  const item = document.createElement("article");
  item.className = "mini-permission-item";
  const content = document.createElement("div");
  const title = document.createElement("strong");
  title.textContent = permission.motivo || "Sin motivo informado";
  const details = document.createElement("small");
  details.textContent = `${formatDate(permissionDate(permission))} · ${permissionType(permission)}`;
  content.append(title, details);
  const actions = document.createElement("div");
  if (permission.adjunto) actions.append(createButton("Documento", "text-button", () => openPermissionDocument(permission)));
  item.append(content, actions);
  return item;
}

function renderEmployeePermissions(employeeId) {
  const history = $("#employee-permission-history");
  if (!history) return;
  const year = Number($("#employee-permission-year").value) || new Date().getFullYear();
  const now = new Date();
  const allRecords = sortedPermissions(state.permisos.filter((permission) => permission.empleadoId === employeeId));
  const yearRecords = allRecords.filter((permission) => permissionDate(permission).slice(0, 4) === String(year));
  const currentMonthRecords = allRecords.filter((permission) => permissionDate(permission).slice(0, 7) === `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  $("#employee-permission-year-total").textContent = yearRecords.length;
  $("#employee-permission-month-total").textContent = currentMonthRecords.length;
  renderMonthBreakdown($("#employee-permission-months"), yearRecords);
  const latest = $("#employee-permission-latest");
  latest.replaceChildren(...allRecords.slice(0, 3).map(createMiniPermission));
  history.replaceChildren(...yearRecords.map(createMiniPermission));
  $("#employee-permission-empty").hidden = yearRecords.length > 0;
}

function ensureDocumentViewer() {
  let dialog = $("#permission-document-viewer");
  if (dialog) return dialog;
  dialog = document.createElement("dialog");
  dialog.id = "permission-document-viewer";
  dialog.className = "document-viewer-dialog";
  const content = document.createElement("div");
  content.className = "document-viewer-content";
  const heading = document.createElement("div");
  heading.className = "dialog-heading";
  const title = document.createElement("h2");
  title.id = "document-viewer-title";
  const close = createButton("×", "icon-button", () => dialog.close());
  close.setAttribute("aria-label", "Cerrar");
  heading.append(title, close);
  const body = document.createElement("div");
  body.id = "document-viewer-body";
  body.className = "document-viewer-body";
  const actions = document.createElement("div");
  actions.className = "dialog-actions";
  const download = document.createElement("a");
  download.id = "document-viewer-download";
  download.className = "button button-secondary";
  download.textContent = "Descargar";
  const closeAction = createButton("Cerrar", "button", () => dialog.close());
  actions.append(download, closeAction);
  content.append(heading, body, actions);
  dialog.append(content);
  document.body.append(dialog);
  return dialog;
}

function openPermissionDocument(permission) {
  if (!permission.adjunto) return setStatus("Este permiso no tiene un documento adjunto.", true);
  const dialog = ensureDocumentViewer();
  const body = $("#document-viewer-body");
  body.replaceChildren();
  $("#document-viewer-title").textContent = permission.adjunto.nombreOriginal || "Documento adjunto";
  $("#document-viewer-download").href = `/api/permisos/${encodeURIComponent(permission.id)}/documento/download`;
  if (permission.adjunto.tipoMime?.startsWith("image/")) {
    const image = document.createElement("img");
    image.src = permission.adjunto.url;
    image.alt = `Documento de ${employeeName(permission.empleadoId)}`;
    body.append(image);
  } else {
    const frame = document.createElement("iframe");
    frame.src = permission.adjunto.url;
    frame.title = "Vista previa del documento PDF";
    body.append(frame);
  }
  dialog.showModal();
}

function openPermissionDetail(permission) {
  const dialog = $("#permission-detail-dialog");
  if (!dialog) return;
  const employee = employeeById(permission.empleadoId);
  dialog.dataset.permissionId = permission.id;
  $("#permission-detail-name").textContent = permission.motivo || "Permiso";
  $("#permission-detail-employee").textContent = employee ? `${employee.apellido}, ${employee.nombre}` : "Empleado eliminado";
  $("#permission-detail-file").textContent = formatLegajo(employee?.legajo);
  $("#permission-detail-from").textContent = formatDate(permissionDate(permission));
  $("#permission-detail-to").textContent = formatDate(permission.fechaHasta || permissionDate(permission));
  $("#permission-detail-time").textContent = permissionTime(permission);
  $("#permission-detail-status").textContent = permission.estado || "Registrado";
  $("#permission-detail-reason").textContent = permission.motivo || "—";
  $("#permission-detail-notes").textContent = permission.observaciones || "—";
  const badges = $("#permission-detail-badges");
  badges.replaceChildren(createPermissionBadge(permissionType(permission)), createPermissionBadge(permission.adjunto ? "Con documento" : "Sin documento", permission.adjunto ? "has-document" : ""));
  const documentBox = $("#permission-detail-document");
  documentBox.replaceChildren();
  if (permission.adjunto) {
    const information = document.createElement("div");
    const name = document.createElement("strong");
    const size = document.createElement("small");
    name.textContent = permission.adjunto.nombreOriginal;
    size.textContent = `${Math.max(1, Math.round(Number(permission.adjunto.tamanio || 0) / 1024))} KB`;
    information.append(name, size);
    const actions = document.createElement("div");
    actions.append(createDocumentButton(permission), Object.assign(document.createElement("a"), {
      className: "text-button",
      textContent: "Descargar",
      href: `/api/permisos/${encodeURIComponent(permission.id)}/documento/download`,
    }));
    documentBox.append(information, actions);
  } else {
    documentBox.append(createDocumentButton(permission));
  }
  dialog.showModal();
}

function openPermissionDialog(permission = null) {
  const form = $("#permission-form");
  if (!form) return;
  form.reset();
  updateEmployeeSelects();
  $("#permission-id").value = permission?.id || "";
  $("#permission-dialog-title").textContent = permission ? "Editar permiso" : "Nuevo permiso";
  $("#permission-form-error").hidden = true;
  const today = new Date().toISOString().slice(0, 10);
  form.elements.empleadoId.value = permission?.empleadoId || "";
  form.elements.tipo.value = permissionType(permission || {});
  if (!permission) form.elements.tipo.value = "";
  form.elements.motivo.value = permission?.motivo || "";
  form.elements.fechaDesde.value = permissionDate(permission || {}) || today;
  form.elements.fechaHasta.value = permission?.fechaHasta || permissionDate(permission || {}) || today;
  form.elements.horaDesde.value = permission?.horaDesde || "";
  form.elements.horaHasta.value = permission?.horaHasta || "";
  form.elements.estado.value = permission?.estado || "Registrado";
  form.elements.observaciones.value = permission?.observaciones || "";
  $("#permission-document").value = "";
  $("#permission-file-name").textContent = "Ningún archivo seleccionado";
  const currentAttachment = $("#permission-current-attachment");
  currentAttachment.replaceChildren();
  currentAttachment.hidden = !permission?.adjunto;
  if (permission?.adjunto) {
    const text = document.createElement("span");
    text.textContent = `Documento actual: ${permission.adjunto.nombreOriginal}. Se conservará si no elegís otro.`;
    currentAttachment.append(text, createDocumentButton(permission, "Ver actual"));
  }
  $("#permission-dialog").showModal();
}

async function renderVacationEmployeeDetail() {
  const dialog = $("#vacation-employee-dialog");
  if (!dialog?.dataset.employeeId) return;
  const employeeId = dialog.dataset.employeeId;
  const period = Number($("#vacation-employee-year").value) || new Date().getFullYear();
  try {
    const summary = await ensureVacationSummary(period);
    const item = summary.find((entry) => entry.empleadoId === employeeId) || { diasCorrespondientes: 0, diasTomados: 0, saldoPendiente: 0 };
    const balanceState = vacationBalanceState(item);
    $("#vacation-employee-assigned").textContent = item.diasCorrespondientes;
    $("#vacation-employee-taken").textContent = item.diasTomados;
    $("#vacation-employee-balance").textContent = item.saldoPendiente < 0 ? `${Math.abs(item.saldoPendiente)} excedidos` : item.saldoPendiente;
    $("#vacation-employee-balance-card").className = `balance-${balanceState.key}`;
    const history = $("#vacation-employee-history");
    const records = vacationRecordsFor(employeeId, period);
    history.replaceChildren();
    records.forEach((vacation) => {
      const record = document.createElement("article");
      record.className = "vacation-detail-record";
      const content = document.createElement("div");
      const dates = document.createElement("strong");
      dates.textContent = `${formatDate(vacation.fechaDesde)} al ${formatDate(vacation.fechaHasta)}`;
      const detail = document.createElement("small");
      detail.textContent = `${vacation.diasTomados} día${vacation.diasTomados === 1 ? "" : "s"} · ${vacation.estado || "Registrado"}`;
      const notes = document.createElement("p");
      notes.textContent = vacation.observaciones || "Sin observaciones";
      content.append(dates, detail, notes);
      const actions = document.createElement("div");
      actions.append(
        createButton("Editar", "text-button", () => { dialog.close(); openVacationDialog(vacation); }),
        createButton("Eliminar", "text-button danger", () => deleteVacationRecord(vacation)),
      );
      record.append(content, actions);
      history.append(record);
    });
    $("#vacation-employee-empty").hidden = records.length > 0;
  } catch (error) { setStatus(error.message, true); }
}

function openVacationEmployeeDetail(employeeId, period) {
  const dialog = $("#vacation-employee-dialog");
  if (!dialog) return;
  const employee = employeeById(employeeId);
  dialog.dataset.employeeId = employeeId;
  $("#vacation-employee-name").textContent = employee ? `${employee.nombre} ${employee.apellido}` : "Empleado eliminado";
  $("#vacation-employee-file").textContent = `Legajo ${formatLegajo(employee?.legajo)}`;
  $("#vacation-employee-year").value = period || selectedVacationPeriod();
  dialog.showModal();
  renderVacationEmployeeDetail();
}

function openVacationDialog(vacation = null, employeeId = "", period = null) {
  const form = $("#vacation-form");
  if (!form) return;
  form.reset();
  updateEmployeeSelects();
  $("#vacation-id").value = vacation?.id || "";
  $("#vacation-dialog-title").textContent = vacation ? "Editar vacaciones" : "Registrar vacaciones";
  $("#vacation-form-error").hidden = true;
  form.elements.empleadoId.value = vacation?.empleadoId || employeeId;
  form.elements.periodo.value = vacation?.periodo || period || selectedVacationPeriod();
  form.elements.fechaDesde.value = vacation?.fechaDesde || "";
  form.elements.fechaHasta.value = vacation?.fechaHasta || "";
  form.elements.estado.value = vacation?.estado || "Registrado";
  form.elements.observaciones.value = vacation?.observaciones || "";
  $("#vacation-dialog").showModal();
}

async function deleteEmployee(employee) {
  if (!confirm(`¿Eliminar a ${employee.nombre} ${employee.apellido}?`)) return;
  try {
    await request(`/api/empleados/${employee.id}`, { method: "DELETE" });
    $("#employee-detail-dialog")?.close();
    await load();
    setStatus("Empleado eliminado");
  } catch (error) { setStatus(error.message, true); }
}

async function deleteRecord(resource, id, label) {
  if (!confirm(`¿Eliminar este ${label}?`)) return;
  try { await request(`/api/${resource}/${id}`, { method: "DELETE" }); await load(); setStatus(`${label[0].toUpperCase()}${label.slice(1)} eliminado`); } catch (error) { setStatus(error.message, true); }
}

async function deletePermission(permission) {
  if (!confirm(`¿Eliminar el permiso de ${employeeName(permission.empleadoId)}? El registro dejará de aparecer en el historial.`)) return;
  try {
    await request(`/api/permisos/${permission.id}`, { method: "DELETE" });
    $("#permission-detail-dialog")?.close();
    await load();
    setStatus("Permiso eliminado");
  } catch (error) { setStatus(error.message, true); }
}

async function deleteVacationRecord(vacation) {
  if (!confirm(`¿Eliminar las vacaciones del ${formatDate(vacation.fechaDesde)} al ${formatDate(vacation.fechaHasta)}?`)) return;
  try {
    await request(`/api/vacaciones/${vacation.id}`, { method: "DELETE" });
    await load();
    delete state.resumenVacacionesPorPeriodo[vacation.periodo];
    await ensureVacationSummary(vacation.periodo);
    renderVacations();
    if ($("#vacation-employee-dialog")?.open) await renderVacationEmployeeDetail();
    setStatus("Registro de vacaciones eliminado");
  } catch (error) { setStatus(error.message, true); }
}

$("#new-employee")?.addEventListener("click", () => openEmployeeDialog());
$("#employee-search")?.addEventListener("input", renderEmployees);
$("#employee-filter")?.addEventListener("change", renderEmployees);
$("#clear-employee-filters")?.addEventListener("click", () => {
  $("#employee-search").value = "";
  $("#employee-filter").value = "";
  renderEmployees();
  $("#employee-search").focus();
});
$("#employee-detail-edit")?.addEventListener("click", () => {
  const dialog = $("#employee-detail-dialog");
  const employee = state.empleados.find((item) => item.id === dialog.dataset.employeeId);
  if (!employee) return;
  dialog.close();
  openEmployeeDialog(employee);
});
$("#employee-detail-delete")?.addEventListener("click", () => {
  const dialog = $("#employee-detail-dialog");
  const employee = state.empleados.find((item) => item.id === dialog.dataset.employeeId);
  if (employee) deleteEmployee(employee);
});
$("#employee-permission-year")?.addEventListener("change", () => {
  const dialog = $("#employee-detail-dialog");
  if (dialog?.dataset.employeeId) renderEmployeePermissions(dialog.dataset.employeeId);
});
$("#permission-detail-edit")?.addEventListener("click", () => {
  const dialog = $("#permission-detail-dialog");
  const permission = state.permisos.find((item) => item.id === dialog.dataset.permissionId);
  if (!permission) return;
  dialog.close();
  openPermissionDialog(permission);
});
$("#permission-detail-delete")?.addEventListener("click", () => {
  const dialog = $("#permission-detail-dialog");
  const permission = state.permisos.find((item) => item.id === dialog.dataset.permissionId);
  if (permission) deletePermission(permission);
});
document.querySelectorAll("[data-permission-tab]").forEach((tab) => tab.addEventListener("click", () => {
  const selected = tab.dataset.permissionTab;
  document.querySelectorAll("[data-permission-tab]").forEach((item) => {
    const isActive = item.dataset.permissionTab === selected;
    item.classList.toggle("active", isActive);
    item.setAttribute("aria-selected", String(isActive));
  });
  document.querySelectorAll("[data-permission-view]").forEach((view) => { view.hidden = view.dataset.permissionView !== selected; });
  $("#permission-page-subtitle").textContent = ({ current: "Permisos del mes actual", history: "Consulta de permisos anteriores", annual: "Estadísticas mensuales y anuales" })[selected];
}));
$("#permission-current-search")?.addEventListener("input", renderCurrentPermissions);
document.querySelectorAll("#permission-history-view input, #permission-history-view select").forEach((field) => field.addEventListener("input", renderPermissionHistory));
$("#permission-history-clear")?.addEventListener("click", () => {
  document.querySelectorAll("#permission-history-view input, #permission-history-view select").forEach((field) => { field.value = ""; });
  renderPermissionHistory();
});
$("#permission-annual-year")?.addEventListener("change", renderAnnualPermissions);
$("#permission-document")?.addEventListener("change", (event) => {
  const file = event.target.files[0];
  $("#permission-file-name").textContent = file ? `${file.name} · ${Math.max(1, Math.round(file.size / 1024))} KB` : "Ningún archivo seleccionado";
  $("#permission-form-error").hidden = true;
});
document.querySelectorAll("[data-vacation-tab]").forEach((tab) => tab.addEventListener("click", () => {
  const selected = tab.dataset.vacationTab;
  document.querySelectorAll("[data-vacation-tab]").forEach((item) => {
    const isActive = item.dataset.vacationTab === selected;
    item.classList.toggle("active", isActive);
    item.setAttribute("aria-selected", String(isActive));
  });
  document.querySelectorAll("[data-vacation-view]").forEach((view) => { view.hidden = view.dataset.vacationView !== selected; });
  $("#vacation-page-subtitle").textContent = ({ current: "Saldos del período actual", history: "Consulta de vacaciones anteriores", annual: "Balance general por empleado" })[selected];
}));
document.querySelectorAll("#vacation-current-search, #vacation-current-employee, #vacation-current-status").forEach((field) => field.addEventListener("input", renderCurrentVacations));
$("#vacation-current-clear")?.addEventListener("click", () => {
  $("#vacation-current-search").value = "";
  $("#vacation-current-employee").value = "";
  $("#vacation-current-status").value = "";
  renderCurrentVacations();
});
$("#vacation-current-year")?.addEventListener("change", async (event) => {
  try { await ensureVacationSummary(event.target.value); renderCurrentVacations(); } catch (error) { setStatus(error.message, true); }
});
document.querySelectorAll("#vacation-history-view input, #vacation-history-view select").forEach((field) => field.addEventListener("input", renderVacationHistory));
$("#vacation-history-clear")?.addEventListener("click", () => {
  document.querySelectorAll("#vacation-history-view input, #vacation-history-view select").forEach((field) => { field.value = ""; });
  renderVacationHistory();
});
$("#vacation-annual-year")?.addEventListener("change", async (event) => {
  try { await ensureVacationSummary(event.target.value); renderAnnualVacations(); } catch (error) { setStatus(error.message, true); }
});
$("#vacation-employee-year")?.addEventListener("change", renderVacationEmployeeDetail);
$("#vacation-employee-register")?.addEventListener("click", () => {
  const dialog = $("#vacation-employee-dialog");
  const employeeId = dialog.dataset.employeeId;
  const period = Number($("#vacation-employee-year").value);
  dialog.close();
  openVacationDialog(null, employeeId, period);
});
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
  if (button.dataset.open === "permission-dialog") return openPermissionDialog();
  const dialog = $(`#${button.dataset.open}`);
  dialog.querySelector("form").reset();
  dialog.showModal();
}));

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

$("#permission-form")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const id = $("#permission-id").value;
  const file = $("#permission-document").files[0];
  const allowedTypes = new Set(["image/jpeg", "image/png", "application/pdf"]);
  const showError = (message) => {
    $("#permission-form-error").textContent = message;
    $("#permission-form-error").hidden = false;
    setStatus(message, true);
  };
  if (file && !allowedTypes.has(file.type)) return showError("El documento debe ser JPG, JPEG, PNG o PDF.");
  if (file && file.size > 10 * 1024 * 1024) return showError("El documento supera el límite máximo de 10 MB.");
  try {
    await request(id ? `/api/permisos/${id}` : "/api/permisos", {
      method: id ? "PUT" : "POST",
      body: new FormData(event.currentTarget),
    });
    $("#permission-dialog").close();
    await load();
    setStatus(id ? "Permiso actualizado" : "Permiso registrado");
  } catch (error) { showError(error.message); }
});

$("#vacation-form")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const id = $("#vacation-id").value;
  const payload = Object.fromEntries(new FormData(event.currentTarget));
  const previousPeriod = state.vacaciones.find((vacation) => vacation.id === id)?.periodo;
  const showError = (message) => {
    $("#vacation-form-error").textContent = message;
    $("#vacation-form-error").hidden = false;
    setStatus(message, true);
  };
  try {
    await request(id ? `/api/vacaciones/${id}` : "/api/vacaciones", {
      method: id ? "PUT" : "POST",
      body: JSON.stringify(payload),
    });
    $("#vacation-dialog").close();
    await load();
    delete state.resumenVacacionesPorPeriodo[payload.periodo];
    if (previousPeriod) delete state.resumenVacacionesPorPeriodo[previousPeriod];
    await ensureVacationSummary(payload.periodo);
    if (previousPeriod && Number(previousPeriod) !== Number(payload.periodo)) await ensureVacationSummary(previousPeriod);
    renderVacations();
    setStatus(id ? "Vacaciones actualizadas" : "Vacaciones registradas");
  } catch (error) { showError(error.message); }
});

if ($("#permission-history-year")) $("#permission-history-year").value = new Date().getFullYear();
if ($("#permission-annual-year")) $("#permission-annual-year").value = new Date().getFullYear();
if ($("#vacation-current-year")) $("#vacation-current-year").value = new Date().getFullYear();
if ($("#vacation-annual-year")) $("#vacation-annual-year").value = new Date().getFullYear();
load();
