import { describe, expect, it } from "vitest";
import { documentExtension, isMarkupImage } from "./file-signature";

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const OLE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0]);
const ZIP = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0]);

describe("documentExtension", () => {
  it("dà l'estensione dal contenuto, non dal nome", () => {
    expect(documentExtension(Buffer.from("%PDF-1.7\n..."), "application/pdf")).toBe("pdf");
    expect(documentExtension(OLE, "application/msword")).toBe("doc");
    expect(documentExtension(OLE, "application/vnd.ms-excel")).toBe("xls");
    expect(documentExtension(ZIP, DOCX)).toBe("docx");
    expect(documentExtension(ZIP, XLSX)).toBe("xlsx");
  });

  it("rifiuta una pagina web dichiarata PDF", () => {
    expect(documentExtension(Buffer.from("<html><script>alert(1)</script>"), "application/pdf")).toBeNull();
    expect(documentExtension(ZIP, "application/pdf")).toBeNull();
    expect(documentExtension(Buffer.alloc(0), "application/pdf")).toBeNull();
  });
});

describe("isMarkupImage", () => {
  it("riconosce SVG e HTML spacciati per foto", () => {
    expect(isMarkupImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>'), "image/png")).toBe(true);
    expect(isMarkupImage(Buffer.from("\uFEFF  <?xml version='1.0'?><svg/>"), "image/jpeg")).toBe(true);
    expect(isMarkupImage(Buffer.from([0xff, 0xd8, 0xff, 0xe0]), "image/svg+xml")).toBe(true);
  });

  it("lascia passare le foto vere", () => {
    expect(isMarkupImage(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]), "image/jpeg")).toBe(false);
    expect(isMarkupImage(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]), "image/png")).toBe(false);
  });
});
