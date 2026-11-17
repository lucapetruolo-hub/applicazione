import { describe, expect, it } from "vitest";
import { HANDOFF_TTL_MS, PhotoHandoffService, clampMaxPhotos, validCode } from "./photo-handoff.service";

type Row = { codeHash: string; keyHash: string; openedAt: Date | null; maxPhotos: number; sentCount: number; expiresAt: Date };
type PhotoRow = { id: bigint; codeHash: string; photo: Uint8Array; mediaType: string; createdAt: Date };

function matches<T extends object>(row: T, where: Record<string, unknown>) {
  return Object.entries(where).every(([k, v]) => {
    const value = row[k as keyof T];
    if (v && typeof v === "object" && "gt" in v) return (value as Date) > (v as { gt: Date }).gt;
    if (v && typeof v === "object" && "lte" in v) return (value as Date) <= (v as { lte: Date }).lte;
    return value === v;
  });
}

function removeWhere<T extends object>(list: T[], where: Record<string, unknown>) {
  let count = 0;
  for (let i = list.length - 1; i >= 0; i--) {
    if (!matches(list[i]!, where)) continue;
    list.splice(i, 1);
    count++;
  }
  return { count };
}

/** Tabelle `photo_handoffs` e `photo_handoff_photos` finte: abbastanza Prisma per il servizio. */
function tables() {
  const rows: Row[] = [];
  const photos: PhotoRow[] = [];
  let nextId = 1n;
  return {
    rows,
    photos,
    // L'unico comando scritto a mano: prende un posto se ce n'è ancora (valori: ora, codice, ora).
    $queryRaw: async (_strings: TemplateStringsArray, now: Date, codeHash: string) => {
      const row = rows.find((r) => r.codeHash === codeHash && r.sentCount < r.maxPhotos && r.expiresAt > now);
      if (!row) return [];
      row.sentCount += 1;
      row.openedAt ??= now;
      return [{ sentCount: row.sentCount, maxPhotos: row.maxPhotos }];
    },
    photoHandoff: {
      create: async ({ data }: { data: Pick<Row, "codeHash" | "keyHash" | "expiresAt" | "maxPhotos"> }) => {
        rows.push({ openedAt: null, sentCount: 0, ...data });
      },
      findUnique: async ({ where }: { where: { codeHash: string } }) => rows.find((r) => r.codeHash === where.codeHash) ?? null,
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Partial<Row> }) => {
        let count = 0;
        for (const row of rows) {
          if (!matches(row, where)) continue;
          Object.assign(row, data);
          count++;
        }
        return { count };
      },
      deleteMany: async ({ where }: { where: Record<string, unknown> }) => removeWhere(rows, where),
    },
    photoHandoffPhoto: {
      create: async ({ data }: { data: Pick<PhotoRow, "codeHash" | "photo" | "mediaType"> }) => {
        photos.push({ id: nextId++, createdAt: new Date(), ...data });
      },
      findFirst: async ({ where }: { where: { codeHash: string } }) => photos.find((p) => p.codeHash === where.codeHash) ?? null,
      deleteMany: async ({ where }: { where: Record<string, unknown> }) => removeWhere(photos, where),
    },
  };
}

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const JPEG2 = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 4, 5, 6]);

describe("Scatta dal telefono (docs/changelog/2026-11-16-scatta-dal-telefono.md)", () => {
  it("con un codice da una foto: arriva al computer una volta sola, poi il codice si chiude", async () => {
    const db = tables();
    const service = new PhotoHandoffService(db as never);
    const { code, key, url, qrSvg, maxPhotos } = await service.create();
    expect(maxPhotos).toBe(1);
    expect(validCode(code) && validCode(key)).toBe(true);
    expect(url).toContain(`/scatta/${code}`);
    expect(qrSvg).toContain("<svg");
    // Il codice vero non si salva, solo l'impronta.
    expect(db.rows[0]!.codeHash).not.toBe(code);

    expect(await service.take(code, key)).toEqual({ status: "waiting" });
    expect(await service.open(code)).toEqual({ status: "opened", sent: 0, max: 1 });
    expect(await service.take(code, key)).toEqual({ status: "opened" });

    expect(await service.upload(code, JPEG, "image/jpeg")).toEqual({ result: "ok", sent: 1, max: 1 });
    expect(await service.upload(code, JPEG, "image/jpeg")).toEqual({ result: "full" });
    expect((await service.open(code)).status).toBe("sent");

    const taken = await service.take(code, key);
    expect(taken.status === "sent" && taken.photo.equals(JPEG)).toBe(true);
    expect(db.photos).toHaveLength(0);
    expect(await service.take(code, key)).toEqual({ status: "done" });
    expect(db.rows).toHaveLength(0);
    expect(await service.take(code, key)).toEqual({ status: "expired" });
  });

  it("più foto con lo stesso codice (docs/changelog/2026-11-17-piu-foto-dal-telefono.md): una alla volta, in ordine", async () => {
    const db = tables();
    const service = new PhotoHandoffService(db as never);
    const { code, key } = await service.create(3);
    expect(await service.upload(code, JPEG, "image/jpeg")).toEqual({ result: "ok", sent: 1, max: 3 });
    expect(await service.upload(code, JPEG2, "image/jpeg")).toEqual({ result: "ok", sent: 2, max: 3 });
    const first = await service.take(code, key);
    const second = await service.take(code, key);
    expect(first.status === "sent" && first.photo.equals(JPEG)).toBe(true);
    expect(second.status === "sent" && second.photo.equals(JPEG2)).toBe(true);
    // Ne manca ancora una: il computer aspetta.
    expect(await service.take(code, key)).toEqual({ status: "opened" });
    expect(await service.upload(code, JPEG, "image/jpeg")).toEqual({ result: "ok", sent: 3, max: 3 });
    expect(await service.upload(code, JPEG, "image/jpeg")).toEqual({ result: "full" });
    expect((await service.take(code, key)).status).toBe("sent");
    expect(await service.take(code, key)).toEqual({ status: "done" });
  });

  it("il numero di foto resta tra 1 e 10", () => {
    expect(clampMaxPhotos(undefined)).toBe(1);
    expect(clampMaxPhotos("5")).toBe(1);
    expect(clampMaxPhotos(0)).toBe(1);
    expect(clampMaxPhotos(4)).toBe(4);
    expect(clampMaxPhotos(500)).toBe(10);
    expect(clampMaxPhotos(2.5)).toBe(1);
  });

  it("chi conosce solo il codice del QR non può prendere la foto", async () => {
    const service = new PhotoHandoffService(tables() as never);
    const { code } = await service.create();
    await service.upload(code, JPEG, "image/jpeg");
    expect(await service.take(code, code)).toEqual({ status: "expired" });
    expect(await service.take(code, "A".repeat(22))).toEqual({ status: "expired" });
  });

  it("dopo 10 minuti il codice non vale più e codice e foto si tolgono", async () => {
    const db = tables();
    const service = new PhotoHandoffService(db as never);
    const start = new Date();
    const { code, key } = await service.create(2, start);
    await service.upload(code, JPEG, "image/jpeg", start);
    const later = new Date(start.getTime() + HANDOFF_TTL_MS + 60_000);
    expect(await service.upload(code, JPEG, "image/jpeg", later)).toEqual({ result: "expired" });
    expect((await service.open(code, later)).status).toBe("expired");
    expect(await service.take(code, key, later)).toEqual({ status: "expired" });
    expect(await service.removeExpired(later)).toBe(1);
    expect(db.rows).toHaveLength(0);
    expect(db.photos).toHaveLength(0);
  });

  it("chiudendo la finestra del computer il codice e le foto non prese si cancellano", async () => {
    const db = tables();
    const service = new PhotoHandoffService(db as never);
    const { code, key } = await service.create(2);
    await service.upload(code, JPEG, "image/jpeg");
    await service.cancel(code, "B".repeat(22));
    expect(db.rows).toHaveLength(1);
    await service.cancel(code, key);
    expect(db.rows).toHaveLength(0);
    expect(db.photos).toHaveLength(0);
  });

  it("accetta solo codici della forma giusta", () => {
    expect(validCode("abc")).toBe(false);
    expect(validCode("../../etc/passwd/xxxxxx")).toBe(false);
    expect(validCode("A".repeat(22))).toBe(true);
  });
});
