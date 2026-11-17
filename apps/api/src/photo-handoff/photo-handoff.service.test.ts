import { describe, expect, it } from "vitest";
import { HANDOFF_TTL_MS, PhotoHandoffService, validCode } from "./photo-handoff.service";

type Row = { codeHash: string; keyHash: string; photo: Uint8Array | null; mediaType: string | null; openedAt: Date | null; expiresAt: Date };

/** Tabella `photo_handoffs` finta: abbastanza Prisma per il servizio. */
function table() {
  const rows = new Map<string, Row>();
  const matches = (row: Row, where: Record<string, unknown>) =>
    Object.entries(where).every(([k, v]) => {
      const value = row[k as keyof Row];
      if (v && typeof v === "object" && "gt" in v) return (value as Date) > (v as { gt: Date }).gt;
      if (v && typeof v === "object" && "lte" in v) return (value as Date) <= (v as { lte: Date }).lte;
      return value === v;
    });
  return {
    rows,
    photoHandoff: {
      create: async ({ data }: { data: Pick<Row, "codeHash" | "keyHash" | "expiresAt"> }) => {
        rows.set(data.codeHash, { photo: null, mediaType: null, openedAt: null, ...data });
      },
      findUnique: async ({ where }: { where: { codeHash: string } }) => rows.get(where.codeHash) ?? null,
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Partial<Row> }) => {
        let count = 0;
        for (const row of rows.values()) {
          if (!matches(row, where)) continue;
          Object.assign(row, data);
          count++;
        }
        return { count };
      },
      deleteMany: async ({ where }: { where: Record<string, unknown> }) => {
        let count = 0;
        for (const [id, row] of rows) {
          if (!matches(row, where)) continue;
          rows.delete(id);
          count++;
        }
        return { count };
      },
    },
  };
}

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

describe("Scatta dal telefono (docs/changelog/2026-11-16-scatta-dal-telefono.md)", () => {
  it("la foto del telefono arriva al computer una volta sola e poi si cancella", async () => {
    const db = table();
    const service = new PhotoHandoffService(db as never);
    const { code, key, url, qrSvg } = await service.create();
    expect(validCode(code) && validCode(key)).toBe(true);
    expect(url).toContain(`/scatta/${code}`);
    expect(qrSvg).toContain("<svg");
    // Il codice vero non si salva, solo l'impronta.
    expect([...db.rows.keys()][0]).not.toBe(code);

    expect(await service.take(code, key)).toEqual({ status: "waiting" });
    expect(await service.open(code)).toBe("opened");
    expect(await service.take(code, key)).toEqual({ status: "opened" });

    expect(await service.upload(code, JPEG, "image/jpeg")).toBe("ok");
    expect(await service.upload(code, JPEG, "image/jpeg")).toBe("sent");
    expect(await service.open(code)).toBe("sent");

    const taken = await service.take(code, key);
    expect(taken.status).toBe("sent");
    expect(taken.status === "sent" && taken.photo.equals(JPEG)).toBe(true);
    expect(db.rows.size).toBe(0);
    expect(await service.take(code, key)).toEqual({ status: "expired" });
  });

  it("chi conosce solo il codice del QR non può prendere la foto", async () => {
    const service = new PhotoHandoffService(table() as never);
    const { code } = await service.create();
    await service.upload(code, JPEG, "image/jpeg");
    expect(await service.take(code, code)).toEqual({ status: "expired" });
    expect(await service.take(code, "A".repeat(22))).toEqual({ status: "expired" });
  });

  it("dopo 10 minuti il codice non vale più e la riga si toglie", async () => {
    const db = table();
    const service = new PhotoHandoffService(db as never);
    const start = new Date("2026-11-16T10:00:00Z");
    const { code, key } = await service.create(start);
    const later = new Date(start.getTime() + HANDOFF_TTL_MS + 1);
    expect(await service.upload(code, JPEG, "image/jpeg", later)).toBe("expired");
    expect(await service.open(code, later)).toBe("expired");
    expect(await service.take(code, key, later)).toEqual({ status: "expired" });
    expect(await service.removeExpired(later)).toBe(1);
    expect(db.rows.size).toBe(0);
  });

  it("chiudendo la finestra del computer il codice si cancella", async () => {
    const db = table();
    const service = new PhotoHandoffService(db as never);
    const { code, key } = await service.create();
    await service.cancel(code, "B".repeat(22));
    expect(db.rows.size).toBe(1);
    await service.cancel(code, key);
    expect(db.rows.size).toBe(0);
  });

  it("accetta solo codici della forma giusta", () => {
    expect(validCode("abc")).toBe(false);
    expect(validCode("../../etc/passwd/xxxxxx")).toBe(false);
    expect(validCode("A".repeat(22))).toBe(true);
  });
});
