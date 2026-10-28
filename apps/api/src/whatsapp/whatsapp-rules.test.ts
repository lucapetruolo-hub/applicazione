import { describe, expect, it } from "vitest";
import { whatsappParam } from "@professionisti/shared";
import {
  inQuietHours,
  isMobileNumber,
  isStopRequest,
  maskedPhone,
  nextSendTime,
  shouldApplyStatus,
  startOfItalianDay,
  whatsappNumber,
} from "./whatsapp-rules";
import {
  professionalDayMessage,
  renderTemplateText,
  renderWhatsAppText,
  whatsappDayTime,
  whatsappName,
  whatsappTime,
} from "./whatsapp-templates";

// Gennaio: ora italiana = UTC + 1.
describe("ore di silenzio (21-8 ora italiana)", () => {
  it("le 20:59 italiane non sono silenzio, le 21:00 sì", () => {
    expect(inQuietHours(new Date("2027-01-15T19:59:00Z"))).toBe(false);
    expect(inQuietHours(new Date("2027-01-15T20:00:00Z"))).toBe(true);
  });

  it("dalle 21 il messaggio aspetta le 8 del giorno dopo", () => {
    expect(nextSendTime(new Date("2027-01-15T21:30:00Z")).toISOString()).toBe(
      "2027-01-16T07:00:00.000Z",
    );
  });

  it("alle 3 di notte aspetta le 8 dello stesso giorno", () => {
    expect(nextSendTime(new Date("2027-01-16T02:00:00Z")).toISOString()).toBe(
      "2027-01-16T07:00:00.000Z",
    );
  });

  it("di giorno parte subito", () => {
    const now = new Date("2027-01-16T10:00:00Z");
    expect(nextSendTime(now)).toBe(now);
  });

  it("con l'ora legale le 8 italiane sono le 6 UTC", () => {
    expect(nextSendTime(new Date("2027-07-01T20:00:00Z")).toISOString()).toBe(
      "2027-07-02T06:00:00.000Z",
    );
  });

  it("la mezzanotte italiana per i tetti del giorno", () => {
    expect(
      startOfItalianDay(new Date("2027-01-15T23:30:00Z")).toISOString(),
    ).toBe("2027-01-15T23:00:00.000Z");
    expect(
      startOfItalianDay(new Date("2027-01-15T10:00:00Z")).toISOString(),
    ).toBe("2027-01-14T23:00:00.000Z");
  });
});

describe("numero", () => {
  it("cellulare sì, fisso no", () => {
    expect(isMobileNumber("+39 3331234567")).toBe(true);
    expect(isMobileNumber("+39 0773123456")).toBe(false);
    expect(isMobileNumber("+39 12")).toBe(false);
    expect(isMobileNumber(null)).toBe(false);
  });

  it("solo cifre per Meta", () => {
    expect(whatsappNumber("+39 333 123 4567")).toBe("393331234567");
  });

  it("nascosto a metà quando lo mostriamo", () => {
    expect(maskedPhone("+39 3331234567")).toBe("+39 333 ••• 4567");
  });
});

describe("Non ricevere più", () => {
  it("riconosce pulsante e parole scritte", () => {
    expect(isStopRequest("Non ricevere più", null)).toBe(true);
    expect(isStopRequest("STOP", null)).toBe(true);
    expect(isStopRequest("basta!", null)).toBe(true);
    expect(isStopRequest(null, "STOP")).toBe(true);
  });

  it("una risposta qualunque non spegne nulla", () => {
    expect(isStopRequest("Grazie, a domani", null)).toBe(false);
    expect(isStopRequest("non posso fermarmi", null)).toBe(false);
  });
});

describe("stato dal webhook", () => {
  it("va solo avanti", () => {
    expect(shouldApplyStatus("SENT", "DELIVERED")).toBe(true);
    expect(shouldApplyStatus("READ", "DELIVERED")).toBe(false);
    expect(shouldApplyStatus("DELIVERED", "FAILED")).toBe(false);
    expect(shouldApplyStatus("SENT", "FAILED")).toBe(true);
    expect(shouldApplyStatus("FAILED", "READ")).toBe(false);
    expect(shouldApplyStatus("SKIPPED", "SENT")).toBe(false);
  });
});

describe("testi dei messaggi", () => {
  it("nome dell'attività al massimo 30 caratteri, senza a capo", () => {
    expect(
      whatsappName("Impresa Edile Fratelli Rossi e Figli Costruzioni").length,
    ).toBeLessThanOrEqual(30);
    expect(whatsappParam("Riga uno\nriga  due")).toBe("Riga uno riga due");
    expect(whatsappParam("   ")).toBe("-");
  });

  it("giorno e ora dall'orario di parete, senza spostamenti di fuso", () => {
    const at = new Date("2026-11-05T10:30:00Z");
    expect(whatsappTime(at)).toBe("10:30");
    expect(whatsappDayTime(at)).toBe("giovedì 5 novembre alle 10:30");
  });

  it("riepilogo del professionista: elenco numerato con l'ora in grassetto", () => {
    const job = (h: number, what: string | null, where: string | null) => ({
      scheduledAt: new Date(`2026-10-13T${String(h).padStart(2, "0")}:30:00Z`),
      what,
      where,
    });
    const two = professionalDayMessage(
      [job(8, "Perdita sotto il lavandino", "Latina"), job(11, null, "online")],
      "Professionisti",
    );
    expect(two.template.name).toBe("riepilogo_lavori_2");
    expect(renderTemplateText(two.template, two.bodyParams)).toBe(
      "Buonasera, Professionisti ti ricorda gli appuntamenti per domani, *MARTEDÌ 13 OTTOBRE*:\n\n1. *08:30* · Perdita sotto il lavandino · Latina\n2. *11:30* · online\n\nIndirizzi e contatti dei clienti sono nella tua agenda. Buon lavoro!",
    );
    const five = professionalDayMessage(
      [8, 9, 10, 11, 12].map((h) => job(h, "Perdita", "Latina")),
      "Professionisti",
    );
    expect(five.template.name).toBe("riepilogo_lavori_piu");
    expect(five.bodyParams[1]).toBe("5");
    expect(five.bodyParams.at(-1)).toBe("altri 2 appuntamenti");
    expect(
      professionalDayMessage(
        [8, 9, 10, 11].map((h) => job(h, "X", null)),
        "Professionisti",
      ).bodyParams.at(-1),
    ).toBe("un altro appuntamento");
  });

  it("promemoria con il giorno scritto per intero, mai 'domani'", () => {
    const text = renderWhatsAppText("BOOKING_REMINDER_CLIENT", [
      "giovedì 5 novembre alle 10:30",
      "Rossi Idraulica",
    ]);
    expect(text).toContain(
      "giovedì 5 novembre alle 10:30 hai l'appuntamento con Rossi Idraulica",
    );
    expect(text).not.toContain("domani");
  });
});
