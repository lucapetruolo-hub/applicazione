import { afterEach, describe, expect, it, vi } from "vitest";
import { BadRequestException } from "@nestjs/common";
import { StaticMapService, parseStaticMapQuery, staticMapGoogleParams } from "./static-map.service";

describe("immagine fissa della mappa (§265)", () => {
  it("inquadra il luogo cercato insieme ai segnaposto", () => {
    const params = staticMapGoogleParams(parseStaticMapQuery({ size: "600x400", m: "41.9,12.5;41.95,12.45", c: "41.9028,12.4964" }));
    expect(params.get("size")).toBe("600x400");
    expect(params.get("markers")).toContain("41.9,12.5|41.95,12.45");
    expect(params.get("visible")).toBe("41.9028,12.4964|41.9,12.5|41.95,12.45");
    expect(params.get("zoom")).toBeNull();
  });

  it("raggruppa i segnaposto che si coprirebbero, con il numero (collaudo 08/11, E6-08)", () => {
    // Tre professionisti a 100 m l'uno dall'altro e uno a 5 km, zoom di città.
    const params = staticMapGoogleParams(
      parseStaticMapQuery({ size: "600x400", m: "41.9,12.5;41.9008,12.5008;41.9,12.5012;41.945,12.5", c: "41.92,12.5", z: "12" }),
    );
    const markers = params.getAll("markers");
    expect(markers).toHaveLength(2);
    expect(markers).toContainEqual(expect.stringContaining("41.945,12.5"));
    expect(markers).toContainEqual(expect.stringMatching(/size:normal\|color:0x189A63\|label:3\|41\.9,12\.5$/));
    // Molto lontani tra loro restano separati anche senza zoom chiesto.
    const apart = staticMapGoogleParams(parseStaticMapQuery({ size: "600x400", m: "41.9,12.5;45.46,9.19" }));
    expect(apart.getAll("markers")).toHaveLength(1);
    expect(apart.get("markers")).toContain("41.9,12.5|45.46,9.19");
  });

  it("disegna i due raggi come cerchi attorno al centro", () => {
    const params = staticMapGoogleParams(parseStaticMapQuery({ size: "400x360", m: "41.9,12.5", c: "41.9,12.5", z: "9", r: "10,20" }));
    expect(params.getAll("path")).toHaveLength(2);
    expect(params.get("zoom")).toBe("9");
    expect(params.get("center")).toBe("41.9,12.5");
  });

  it("rifiuta parametri fuori misura", () => {
    expect(() => parseStaticMapQuery({ size: "2000x400", m: "41.9,12.5" })).toThrow(BadRequestException);
    expect(() => parseStaticMapQuery({ size: "400x400", m: "abc" })).toThrow(BadRequestException);
    expect(() => parseStaticMapQuery({ size: "400x400" })).toThrow(BadRequestException);
    expect(() => parseStaticMapQuery({ size: "400x400", m: "41.9,12.5", r: "10" })).toThrow(BadRequestException);
  });

  describe("immagini già preparate", () => {
    afterEach(() => {
      vi.unstubAllGlobals();
      delete process.env.GOOGLE_MAPS_API_KEY;
    });

    it("chiede a Google una sola volta al giorno la stessa mappa", async () => {
      process.env.GOOGLE_MAPS_API_KEY = "chiave";
      const fetchMock = vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/png" } }));
      vi.stubGlobal("fetch", fetchMock);
      const service = new StaticMapService();
      const input = parseStaticMapQuery({ size: "400x300", m: "41.9,12.5" });
      await service.image(input, 0);
      const again = await service.image(input, 60_000);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect([...again.buffer]).toEqual([1, 2, 3]);
      await service.image(input, 25 * 60 * 60 * 1000);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });
});
