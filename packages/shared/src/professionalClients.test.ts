import { describe, expect, it } from "vitest";
import { externalClientKey, matchesClientSearch, professionalClientNoteSchema } from "./professionalClients";

describe("rubrica \"I miei clienti\"", () => {
  it("lo stesso telefono scritto in modi diversi è lo stesso cliente", () => {
    expect(externalClientKey("Maria", "+39 333 111 2222")).toBe(externalClientKey("Maria Rossi", "3331112222"));
  });

  it("senza telefono conta il nome, senza maiuscole né spazi doppi", () => {
    expect(externalClientKey("  Maria   Rossi ", null)).toBe("e:maria rossi");
  });

  it("si cerca per nome, telefono o indirizzo", () => {
    const client = { name: "Maria Rossi", phone: "+39 333 111 2222", address: "Via Roma 1, Latina", email: null };
    expect(matchesClientSearch(client, "rossi")).toBe(true);
    expect(matchesClientSearch(client, "111 22")).toBe(true);
    expect(matchesClientSearch(client, "latina")).toBe(true);
    expect(matchesClientSearch(client, "bianchi")).toBe(false);
  });

  it("la nota vale solo con una chiave di cliente", () => {
    expect(professionalClientNoteSchema.safeParse({ clientKey: "u:abc", note: "Citofono rotto" }).success).toBe(true);
    expect(professionalClientNoteSchema.safeParse({ clientKey: "abc", note: "x" }).success).toBe(false);
  });
});
