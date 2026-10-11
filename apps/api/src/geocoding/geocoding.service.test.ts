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

  describe("checkAddressInCity", () => {
    const result = (types: string[], comune: string) => ({
      ok: true,
      json: async () => ({
        status: "OK",
        results: [
          {
            geometry: { location: { lat: 41.1, lng: 16.8 } },
            types,
            address_components: [{ long_name: comune, short_name: comune, types: ["administrative_area_level_3", "political"] }],
          },
        ],
      }),
    });
    const input = { street: "Via Sparano da Bari", houseNumber: "10", postalCode: "70121", city: "Bari" };

    it("senza chiave non chiama Google e non blocca", async () => {
      vi.stubEnv("GOOGLE_MAPS_API_KEY", "");
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      expect(await new GeocodingService().checkAddressInCity(input)).toBe("unavailable");
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("via nel comune indicato → ok, anche con accenti diversi", async () => {
      vi.stubEnv("GOOGLE_MAPS_API_KEY", "test-key");
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(result(["street_address"], "Bari")));
      expect(await new GeocodingService().checkAddressInCity(input)).toBe("ok");
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(result(["route"], "Forlì")));
      expect(await new GeocodingService().checkAddressInCity({ ...input, city: "Forli" })).toBe("ok");
    });

    it("via di un altro comune → wrong-city; solo il comune trovato → not-found", async () => {
      vi.stubEnv("GOOGLE_MAPS_API_KEY", "test-key");
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(result(["street_address"], "Modugno")));
      expect(await new GeocodingService().checkAddressInCity(input)).toBe("wrong-city");
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(result(["locality", "political"], "Bari")));
      expect(await new GeocodingService().checkAddressInCity(input)).toBe("not-found");
      await expect(new GeocodingService().assertAddressInCity(input)).rejects.toThrow("Indirizzo non trovato");
    });

    it("Google non risponde → unavailable, il salvataggio passa", async () => {
      vi.stubEnv("GOOGLE_MAPS_API_KEY", "test-key");
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timeout")));
      expect(await new GeocodingService().checkAddressInCity(input)).toBe("unavailable");
      await expect(new GeocodingService().assertAddressInCity(input)).resolves.toBeUndefined();
    });
  });
});
