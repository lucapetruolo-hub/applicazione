import { describe, expect, it } from "vitest";
import { findComuneByName } from "@professionisti/shared";
import { selectSearchArea, type SearchAreaCandidate } from "./search-area";

const milano = findComuneByName("Milano")!;
const monza = findComuneByName("Monza")!;
const bergamo = findComuneByName("Bergamo")!;
const torino = findComuneByName("Torino")!;
const roma = findComuneByName("Roma")!;

function at(id: string, comune: { lat: number; lon: number }): SearchAreaCandidate {
  return { id, latitude: comune.lat, longitude: comune.lon };
}

describe("selectSearchArea (ricerca per luogo con raggio)", () => {
  it("include i professionisti dei comuni vicini, non solo quello cercato", () => {
    const result = selectSearchArea(milano, [at("milano", milano), at("monza", monza), at("roma", roma)], 25);
    expect([...result.keys()].sort()).toEqual(["milano", "monza"]);
    expect(result.get("milano")).toBe(0);
    expect(result.get("monza")!).toBeGreaterThan(10);
  });

  it("se nel raggio non c'è nessuno, restituisce il professionista più vicino", () => {
    const result = selectSearchArea(milano, [at("bergamo", bergamo), at("torino", torino), at("roma", roma)], 25);
    expect([...result.keys()]).toEqual(["bergamo"]);
    expect(result.get("bergamo")!).toBeGreaterThan(25);
  });

  it("allargando, include tutti quelli alla stessa distanza del più vicino", () => {
    const result = selectSearchArea(milano, [at("bg1", bergamo), at("bg2", bergamo), at("torino", torino)], 25);
    expect([...result.keys()].sort()).toEqual(["bg1", "bg2"]);
  });

  it("ignora chi non ha coordinate", () => {
    expect(selectSearchArea(milano, [{ id: "x", latitude: 0, longitude: 0 }], 25).size).toBe(0);
  });
});
