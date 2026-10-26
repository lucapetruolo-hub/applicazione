import { afterEach, describe, expect, it, vi } from "vitest";
import { AddressSuggestionsService, placeFromGoogle } from "./address-suggestions.service";

describe("suggerimenti di indirizzo dal server (§264)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.GOOGLE_MAPS_API_KEY;
  });

  it("ricava via, civico, CAP, comune e provincia", () => {
    const place = placeFromGoogle({
      formattedAddress: "Via Appia Nuova, 120, 00183 Roma RM, Italia",
      location: { latitude: 41.88, longitude: 12.51 },
      addressComponents: [
        { longText: "120", shortText: "120", types: ["street_number"] },
        { longText: "Via Appia Nuova", shortText: "Via Appia Nuova", types: ["route"] },
        { longText: "Roma", shortText: "Roma", types: ["locality", "political"] },
        { longText: "Roma", shortText: "Roma", types: ["administrative_area_level_3", "political"] },
        { longText: "Città Metropolitana di Roma Capitale", shortText: "RM", types: ["administrative_area_level_2", "political"] },
        { longText: "00183", shortText: "00183", types: ["postal_code"] },
      ],
    });
    expect(place).toEqual({
      address: "Via Appia Nuova, 120, 00183 Roma RM",
      latitude: 41.88,
      longitude: 12.51,
      comune: "Roma",
      locality: "Roma",
      street: "Via Appia Nuova",
      houseNumber: "120",
      postalCode: "00183",
      province: "RM",
    });
  });

  it("chiede a Google solo indirizzi in Italia e restituisce testo principale e secondario", async () => {
    process.env.GOOGLE_MAPS_API_KEY = "k";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        suggestions: [{ placePrediction: { placeId: "abc", structuredFormat: { mainText: { text: "Via Roma, 5" }, secondaryText: { text: "Bari BA" } } } }],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const result = await new AddressSuggestionsService().suggest({ q: "via roma 5", session: "sess-12345" });
    expect(result).toEqual([{ id: "abc", main: "Via Roma, 5", secondary: "Bari BA" }]);
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body as string);
    expect(body.includedRegionCodes).toEqual(["it"]);
    expect(body.sessionToken).toBe("sess-12345");
  });

  it("senza chiave o con testo troppo corto non chiama Google", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const service = new AddressSuggestionsService();
    await expect(service.suggest({ q: "vi", session: "sess-12345" })).resolves.toEqual([]);
    await expect(service.suggest({ q: "via roma", session: "sess-12345" })).rejects.toThrow("non disponibili");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("dice se i suggerimenti funzionano senza chiamare Google (§324)", async () => {
    const service = new AddressSuggestionsService();
    expect(service.available()).toBe(false);
    process.env.GOOGLE_MAPS_API_KEY = "k";
    expect(service.available()).toBe(true);
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 403, text: async () => "API key not valid" });
    vi.stubGlobal("fetch", fetchMock);
    await expect(service.suggest({ q: "via roma", session: "sess-12345" })).rejects.toThrow("non disponibili");
    expect(service.available()).toBe(false);
    expect(service.available(Date.now() + 6 * 60_000)).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  describe("CAP di via e civico (§357)", () => {
    const reply = (place: object) => ({ ok: true, json: async () => ({ places: [place] }) });
    const comp = (text: string, types: string[]) => ({ longText: text, shortText: text, types });

    it("trova il CAP con il testo nel corpo della richiesta, non nell'indirizzo", async () => {
      process.env.GOOGLE_MAPS_API_KEY = "k";
      const fetchMock = vi.fn().mockResolvedValue(reply({ types: ["street_address"], addressComponents: [comp("Roma", ["administrative_area_level_3"]), comp("00187", ["postal_code"])] }));
      vi.stubGlobal("fetch", fetchMock);
      expect(await new AddressSuggestionsService().postalCodeFor({ street: "Via Cesare Battisti", houseNumber: "12", city: "Roma" })).toBe("00187");
      expect(String(fetchMock.mock.calls[0]![0])).toBe("https://places.googleapis.com/v1/places:searchText");
      expect(JSON.parse(String(fetchMock.mock.calls[0]![1].body)).textQuery).toBe("Via Cesare Battisti 12, Roma");
    });

    it("nessun CAP per un altro comune, senza chiave o se Google non risponde", async () => {
      process.env.GOOGLE_MAPS_API_KEY = "k";
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply({ types: ["street_address"], addressComponents: [comp("Fonte Nuova", ["administrative_area_level_3"]), comp("00013", ["postal_code"])] })));
      const service = new AddressSuggestionsService();
      expect(await service.postalCodeFor({ street: "Via Roma", houseNumber: "1", city: "Roma" })).toBeNull();
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("rete")));
      expect(await service.postalCodeFor({ street: "Via Roma", houseNumber: "1", city: "Roma" })).toBeNull();
      delete process.env.GOOGLE_MAPS_API_KEY;
      expect(await service.postalCodeFor({ street: "Via Roma", houseNumber: "1", city: "Roma" })).toBeNull();
    });
  });
});
