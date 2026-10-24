import { describe, expect, it } from "vitest";
import { professionalIdFromSlug, professionalPath, trafficSourceFromReferrer } from "@professionisti/shared";

// Funzioni condivise della SEO (docs/CHANGELOG.md §295-§296), provate qui perché
// packages/shared non ha una propria suite di test.
describe("trafficSourceFromReferrer", () => {
  const own = "applicazione-web.vercel.app";
  it("riconosce Google in ogni dominio nazionale", () => {
    expect(trafficSourceFromReferrer("https://www.google.it/", own)).toBe("GOOGLE");
    expect(trafficSourceFromReferrer("https://www.google.com/search?q=x", own)).toBe("GOOGLE");
    expect(trafficSourceFromReferrer("https://www.google.co.uk/", own)).toBe("GOOGLE");
  });
  it("separa altri motori, social, diretto e altri siti", () => {
    expect(trafficSourceFromReferrer("https://www.bing.com/", own)).toBe("OTHER_SEARCH");
    expect(trafficSourceFromReferrer("https://l.instagram.com/?u=x", own)).toBe("SOCIAL");
    expect(trafficSourceFromReferrer("", own)).toBe("DIRECT");
    expect(trafficSourceFromReferrer(`https://${own}/cerca`, own)).toBe("DIRECT");
    expect(trafficSourceFromReferrer("https://www.paginegialle.it/", own)).toBe("OTHER");
    expect(trafficSourceFromReferrer("non-un-indirizzo", own)).toBe("OTHER");
  });
  it("non scambia per Google un sito che lo contiene nel nome", () => {
    expect(trafficSourceFromReferrer("https://notgoogle.it/", own)).toBe("OTHER");
  });
});

describe("indirizzo del profilo", () => {
  const id = "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed";
  it("mette nome e città prima dell'id, senza accenti né punti", () => {
    expect(professionalPath({ id, businessName: "Idraulica Città S.R.L.", city: "Latina" })).toBe(
      `/professionista/idraulica-citta-srl-latina-${id}`,
    );
  });
  it("non ripete la città se è già nel nome", () => {
    expect(professionalPath({ id, businessName: "Pulizie Latina", city: "Latina" })).toBe(`/professionista/pulizie-latina-${id}`);
  });
  it("ritrova l'id dal nuovo indirizzo e dal vecchio", () => {
    expect(professionalIdFromSlug(`mario-rossi-latina-${id}`)).toBe(id);
    expect(professionalIdFromSlug(id)).toBe(id);
  });
});
