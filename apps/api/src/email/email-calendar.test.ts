import { describe, expect, it } from "vitest";
import { bookingCalendar, bookingPeople, withCalendar } from "./booking-calendar";
import { calendarIcs, googleCalendarUrl } from "./email-calendar";

/** "Aggiungi al calendario" nei promemoria (docs/CHANGELOG.md §235). */
const event = {
  uid: "booking-1@professionisti",
  title: "Idraulico con Luigi Rossi",
  start: new Date("2026-10-15T09:00:00.000Z"),
  end: new Date("2026-10-15T11:00:00.000Z"),
  location: "Via Roma 10, 00100 Roma (RM)",
  description: "Perdita; sotto il lavandino\nurgente",
};

describe("calendario dei promemoria", () => {
  it("il file .ics tiene l'ora di parete in ora italiana", () => {
    const ics = calendarIcs(event);
    expect(ics).toContain("DTSTART;TZID=Europe/Rome:20261015T090000");
    expect(ics).toContain("DTEND;TZID=Europe/Rome:20261015T110000");
    expect(ics).toContain("UID:booking-1@professionisti");
    expect(ics).toContain("LOCATION:Via Roma 10\\, 00100 Roma (RM)");
    expect(ics).toContain("DESCRIPTION:Perdita\\; sotto il lavandino\\nurgente");
    expect(ics.split("\r\n").every((line) => Buffer.byteLength(line) <= 75)).toBe(true);
  });

  it("senza fine l'evento dura un'ora", () => {
    expect(calendarIcs({ ...event, end: null })).toContain("DTEND;TZID=Europe/Rome:20261015T100000");
  });

  it("spezza le righe lunghe", () => {
    const ics = calendarIcs({ ...event, description: "è".repeat(200) });
    expect(ics.split("\r\n").every((line) => Buffer.byteLength(line) <= 75)).toBe(true);
    expect(ics).toContain("\r\n è");
  });

  it("link a Google Calendar con le stesse ore", () => {
    const url = new URL(googleCalendarUrl(event));
    expect(url.hostname).toBe("calendar.google.com");
    expect(url.searchParams.get("dates")).toBe("20261015T090000/20261015T110000");
    expect(url.searchParams.get("ctz")).toBe("Europe/Rome");
    expect(url.searchParams.get("location")).toBe(event.location);
  });
});

describe("calendario: annullamento e prenotazioni (docs/CHANGELOG.md §235)", () => {
  const booking = {
    id: "b1",
    scheduledAt: new Date("2026-10-15T09:00:00.000Z"),
    scheduledEndAt: null,
    recipientName: "Anna",
    recipientSurname: "Bianchi",
    recipientPhone: "+39 333 1234567",
    street: "Via Roma",
    houseNumber: "10",
    addressExtra: null,
    postalCode: "00100",
    city: "Roma",
    province: "RM",
    client: {
      name: "Anna",
      surname: "Bianchi",
      phone: null,
      email: "anna@example.it",
      deletedAt: null,
      street: null,
      houseNumber: null,
      addressExtra: null,
      postalCode: null,
      city: null,
      province: null,
    },
    professionalProfile: { businessName: "Idraulica Rossi", user: { name: "Luigi", surname: "Rossi" } },
    quote: { guidedRequest: { city: "Roma", address: null, description: "Perdita", category: { label: "Idraulico" } } },
  };

  it("annullato: METHOD:CANCEL, stesso UID, nessun link Google", () => {
    const calendar = bookingCalendar(booking, "client", { canceled: true });
    expect(calendar.calendarUrl).toBeNull();
    expect(calendar.attachment.content).toContain("METHOD:CANCEL");
    expect(calendar.attachment.content).toContain("STATUS:CANCELLED");
    expect(calendar.attachment.content).toContain("UID:booking-b1@professionisti");
  });

  it("titolo diverso per cliente e professionista, telefono solo al professionista", () => {
    const client = bookingCalendar(booking, "client").attachment.content;
    const professional = bookingCalendar(booking, "professional").attachment.content;
    expect(client).toContain("SUMMARY:Idraulico con Luigi Rossi");
    // Il numero intero, non "333": SEQUENCE (dall'ora corrente) può contenerlo.
    expect(client).not.toContain("1234567");
    expect(professional).toContain("SUMMARY:Idraulico da Anna Bianchi");
    expect(professional).toContain("+39 333 1234567");
  });

  it("mai i dati di un account cancellato", () => {
    const people = bookingPeople({ ...booking, recipientPhone: null, client: { ...booking.client, phone: "+39 300", deletedAt: new Date() } });
    expect(people.clientPhone).toBeNull();
    expect(people.clientEmail).toBeNull();
  });

  it("l'email della notifica riceve la riga o la spiegazione giusta", () => {
    const base = { kind: "notification" as const, subject: "s", title: "t", paragraphs: ["p"] };
    expect(withCalendar(base, bookingCalendar(booking, "client")).details?.[0]?.label).toBe("Calendario");
    expect(withCalendar(base, bookingCalendar(booking, "client", { canceled: true })).after?.[0]).toContain("toglierlo");
  });
});
