import { afterEach, describe, expect, it, vi } from "vitest";
import { GeocodingService } from "./geocoding.service";

describe("GeocodingService (Google Geocoding)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("senza GOOGLE_MAPS_API_KEY non chiama Google e ricade sul centro del comune", async () => {
    vi.stubEnv("GOOGLE_MAPS_API_KEY", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await new GeocodingService().geocodeAddress("Via Roma 1, Roma, Italia")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("restituisce le coordinate del primo risultato", async () => {
    vi.stubEnv("GOOGLE_MAPS_API_KEY", "test-key");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: "OK", results: [{ geometry: { location: { lat: 41.9, lng: 12.49 } } }] }),
    });
    vi.stubGlobal("fetch", fetchMock);
    expect(await new GeocodingService().geocodeAddress("Via Roma 1, Roma, Italia")).toEqual({ latitude: 41.9, longitude: 12.49 });
    const url = new URL(String(fetchMock.mock.calls[0]![0]));
    expect(url.searchParams.get("components")).toBe("country:IT");
    expect(url.searchParams.get("key")).toBe("test-key");
  });

  it("indirizzo non trovato o chiave rifiutata → null, mai un errore", async () => {
    vi.stubEnv("GOOGLE_MAPS_API_KEY", "test-key");
    for (const status of ["ZERO_RESULTS", "REQUEST_DENIED"]) {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status, results: [] }) }));
      expect(await new GeocodingService().geocodeAddress("Via Inesistente 999")).toBeNull();
    }
  });
});
