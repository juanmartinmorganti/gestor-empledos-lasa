const test = require("node:test");
const assert = require("node:assert/strict");
const { detectPermissionFileType } = require("../server");

test("detecta las firmas reales de JPG, PNG y PDF", () => {
  assert.equal(detectPermissionFileType(Buffer.from([0xff, 0xd8, 0xff, 0xe0])), "image/jpeg");
  assert.equal(detectPermissionFileType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), "image/png");
  assert.equal(detectPermissionFileType(Buffer.from("%PDF-1.7")), "application/pdf");
});

test("rechaza contenido que no corresponde a un documento permitido", () => {
  assert.equal(detectPermissionFileType(Buffer.from("contenido ejecutable")), null);
  assert.equal(detectPermissionFileType(Buffer.alloc(0)), null);
});
