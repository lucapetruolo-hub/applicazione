import assert from "node:assert/strict";
import { test } from "node:test";
import { externalClientKey, matchesClientSearch, professionalClientNoteSchema } from "./professionalClients";

test("rubrica: lo stesso telefono scritto in modi diversi è lo stesso cliente", () => {
  assert.equal(externalClientKey("Maria", "+39 333 111 2222"), externalClientKey("Maria Rossi", "3331112222"));
});

test("rubrica: senza telefono conta il nome, senza maiuscole né spazi doppi", () => {
  assert.equal(externalClientKey("  Maria   Rossi ", null), "e:maria rossi");
});

test("rubrica: si cerca per nome, telefono o indirizzo", () => {
  const client = { name: "Maria Rossi", phone: "+39 333 111 2222", address: "Via Roma 1, Latina", email: null };
  assert.equal(matchesClientSearch(client, "rossi"), true);
  assert.equal(matchesClientSearch(client, "111 22"), true);
  assert.equal(matchesClientSearch(client, "latina"), true);
  assert.equal(matchesClientSearch(client, "bianchi"), false);
});

test("rubrica: la nota vale solo con una chiave di cliente", () => {
  assert.equal(professionalClientNoteSchema.safeParse({ clientKey: "u:abc", note: "Citofono rotto" }).success, true);
  assert.equal(professionalClientNoteSchema.safeParse({ clientKey: "abc", note: "x" }).success, false);
});
