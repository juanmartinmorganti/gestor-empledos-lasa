const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

class MockElement {
  constructor(tagName = "div") {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.dataset = {};
    this.value = "";
    this.textContent = "";
    this.hidden = false;
    this.className = "";
    this.classList = { toggle() {}, add() {}, remove() {} };
  }

  add(option) { this.children.push(option); }
  addEventListener() {}
  append(...children) { this.children.push(...children); }
  close() { this.open = false; }
  focus() {}
  querySelector() { return new MockElement(); }
  replaceChildren(...children) { this.children = children; }
  setAttribute() {}
  showModal() { this.open = true; }
}

function createDocument(html, page) {
  const elements = new Map();
  for (const match of html.matchAll(/<[^>]*id="([^"]+)"[^>]*>/g)) {
    const element = new MockElement(match[0].startsWith("<select") ? "select" : "div");
    const classMatch = match[0].match(/class="([^"]+)"/);
    element.className = classMatch?.[1] || "";
    elements.set(match[1], element);
  }
  const body = new MockElement("body");
  body.dataset.page = page;
  const documentElement = new MockElement("html");
  return {
    body,
    documentElement,
    createElement: (tagName) => new MockElement(tagName),
    querySelector: (selector) => selector.startsWith("#") ? elements.get(selector.slice(1)) || null : null,
    querySelectorAll: (selector) => {
      if (selector === ".employee-select") return [...elements.values()].filter((element) => element.className.split(" ").includes("employee-select"));
      if (selector === ".permission-employee-filter") return [...elements.values()].filter((element) => element.className.split(" ").includes("permission-employee-filter"));
      return [];
    },
  };
}

async function renderPage(page) {
  const publicDir = path.join(__dirname, "..", "public");
  const html = fs.readFileSync(path.join(publicDir, `${page}.html`), "utf8");
  const responses = {
    "/api/empleados": JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "empleados.json"), "utf8")),
    "/api/permisos": JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "permisos.json"), "utf8")),
    "/api/vacaciones": JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "vacaciones.json"), "utf8")),
  };
  const document = createDocument(html, page);
  const context = {
    document,
    console,
    confirm: () => true,
    fetch: async (url) => ({ ok: true, status: 200, json: async () => responses[url] || [] }),
    FormData: class FormData {},
    localStorage: { getItem: () => null, setItem() {} },
    matchMedia: () => ({ matches: false }),
    Option: class Option { constructor(text, value) { this.text = text; this.value = value; } },
    setTimeout,
    clearTimeout,
  };
  context.window = context;
  vm.runInNewContext(fs.readFileSync(path.join(publicDir, "script.js"), "utf8"), context, { filename: "public/script.js" });
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(document.querySelector("#status").textContent, "Datos actualizados");
}

test("la pantalla de permisos carga y renderiza sin errores JavaScript", async () => {
  await renderPage("permisos");
});

test("la ficha de empleados sigue cargando tras integrar sus permisos", async () => {
  await renderPage("empleados");
});

test("la pantalla de vacaciones carga sus tres vistas sin errores JavaScript", async () => {
  await renderPage("vacaciones");
});
