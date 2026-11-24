import { crc32 } from "node:zlib";
import { describe, expect, it } from "vitest";
import { buildZip } from "./zip";

/** Legge lo zip come farebbe un programma qualunque: dalla directory centrale in fondo. */
function readZip(zip: Buffer): { name: string; data: Buffer }[] {
  const end = zip.length - 22;
  expect(zip.readUInt32LE(end)).toBe(0x06054b50);
  const count = zip.readUInt16LE(end + 10);
  let at = zip.readUInt32LE(end + 16);
  const files: { name: string; data: Buffer }[] = [];
  for (let i = 0; i < count; i++) {
    expect(zip.readUInt32LE(at)).toBe(0x02014b50);
    const crc = zip.readUInt32LE(at + 16);
    const size = zip.readUInt32LE(at + 20);
    const nameLength = zip.readUInt16LE(at + 28);
    const offset = zip.readUInt32LE(at + 42);
    const name = zip.subarray(at + 46, at + 46 + nameLength).toString("utf8");
    expect(zip.readUInt32LE(offset)).toBe(0x04034b50);
    const localNameLength = zip.readUInt16LE(offset + 26);
    const data = zip.subarray(offset + 30 + localNameLength, offset + 30 + localNameLength + size);
    expect(crc32(data) >>> 0).toBe(crc);
    files.push({ name, data });
    at += 46 + nameLength;
  }
  return files;
}

describe("buildZip", () => {
  it("mette i file con nomi, cartelle e contenuto giusti", () => {
    const zip = buildZip([
      { name: "xml/COM-2026-1.xml", data: Buffer.from("<FatturaElettronica/>") },
      { name: "pdf/COM-2026-1.pdf", data: Buffer.from("%PDF-1.4 prova") },
      { name: "pdf/àèì.pdf", data: Buffer.alloc(0) },
    ]);
    const files = readZip(zip);
    expect(files.map((f) => f.name)).toEqual(["xml/COM-2026-1.xml", "pdf/COM-2026-1.pdf", "pdf/àèì.pdf"]);
    expect(files[0]!.data.toString()).toBe("<FatturaElettronica/>");
    expect(files[2]!.data.length).toBe(0);
  });

  it("uno zip vuoto è comunque valido", () => {
    expect(readZip(buildZip([]))).toEqual([]);
  });
});
