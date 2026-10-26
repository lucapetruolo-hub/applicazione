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

  describe("CAP (§352)", () => {
    const reply = (result: object | null) => ({ ok: true, json: async () => (result ? { status: "OK", results: [result] } : { status: "ZERO_RESULTS", results: [] }) });
    const comp = (long: string, types: string[], short = long) => ({ long_name: long, short_name: short, types });

    it("trova il CAP di via e civico nella città giusta", async () => {
      vi.stubEnv("GOOGLE_MAPS_API_KEY", "test-key");
      const fetchMock = vi.fn().mockResolvedValue(
        reply({ geometry: { location: { lat: 41.89, lng: 12.48 } }, types: ["street_address"], address_components: [comp("Roma", ["administrative_area_level_3"]), comp("00187", ["postal_code"])] }),
      );
      vi.stubGlobal("fetch", fetchMock);
      expect(await new GeocodingService().postalCodeFor({ street: "Via Cesare Battisti", houseNumber: "12", city: "Roma" })).toBe("00187");
      expect(new URL(String(fetchMock.mock.calls[0]![0])).searchParams.get("address")).toBe("Via Cesare Battisti 12, Roma");
    });

    it("nessun CAP se il risultato è di un altro comune o senza chiave", async () => {
      vi.stubEnv("GOOGLE_MAPS_API_KEY", "test-key");
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply({ geometry: { location: { lat: 0, lng: 0 } }, types: ["street_address"], address_components: [comp("Fonte Nuova", ["administrative_area_level_3"]), comp("00013", ["postal_code"])] })));
      expect(await new GeocodingService().postalCodeFor({ street: "Via Roma", houseNumber: "1", city: "Roma" })).toBeNull();
      vi.stubEnv("GOOGLE_MAPS_API_KEY", "");
      expect(await new GeocodingService().postalCodeFor({ street: "Via Roma", houseNumber: "1", city: "Roma" })).toBeNull();
    });

    it("controllo: CAP della città, di un'altra provincia, o dubbio", async () => {
      vi.stubEnv("GOOGLE_MAPS_API_KEY", "test-key");
      const service = new GeocodingService();
      const roma = { geometry: { location: { lat: 0, lng: 0 } }, address_components: [comp("Roma", ["locality"]), comp("Città Metropolitana di Roma Capitale", ["administrative_area_level_2"], "RM")] };
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply(roma)));
      expect(await service.postalCodeMatchesCity({ postalCode: "00187", city: "Roma" })).toBe(true);
      expect(await service.postalCodeMatchesCity({ postalCode: "00187", city: "Latina" })).toBe(false);
      const piuLocalita = { geometry: { location: { lat: 0, lng: 0 } }, postcode_localities: ["Sermoneta", "Bassiano"], address_components: [comp("Provincia di Latina", ["administrative_area_level_2"], "LT")] };
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply(piuLocalita)));
      expect(await service.postalCodeMatchesCity({ postalCode: "04013", city: "Sezze" })).toBeNull();
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply(null)));
      expect(await service.postalCodeMatchesCity({ postalCode: "99999", city: "Roma" })).toBeNull();
      const url = new URL(String((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]![0]));
      expect(url.searchParams.get("components")).toBe("postal_code:99999|country:IT");
    });
  });
});
