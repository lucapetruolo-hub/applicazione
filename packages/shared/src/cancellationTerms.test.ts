import { test } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";
import {
  cancellationPhase,
  cancellationTerms,
  cancellationTermsText,
  freeCancellationDeadline,
  freeCancellationUntilLabel,
  isLateCancellation,
  rescheduleCancellationLine,
  type CancellationMoney,
  type CancellationPhase,
  type CancellationTermsInput,
} from "./cancellationNotice";
import { quotePaymentSplit } from "./onlinePayments";

/**
 * Prove generate dalla tabella dei casi (analisi/annullamento-acconto/tabella-casi.md,
 * docs/changelog/2026-11-13-annullare-una-fonte.md): una riga per casella,
 * con la frase esatta che leggono cliente e professionista.
 */

const START = "2026-11-20T08:00:00.000Z"; // venerdì 20 novembre, 08:00 ora italiana ("di parete")
const END = "2026-11-20T13:00:00.000Z";
// Ore vere (UTC): a novembre l'Italia è UTC+1.
const NOW: Record<CancellationPhase, Date> = {
  free: new Date("2026-11-18T10:00:00.000Z"),
  late: new Date("2026-11-19T20:00:00.000Z"),
  started: new Date("2026-11-20T09:00:00.000Z"),
  over: new Date("2026-11-20T13:00:00.000Z"),
};
const KEPT: CancellationMoney = { kind: "kept", eurCents: 2400 };
// Scheda del preventivo con più modi: l'importo cambia col modo, quindi non si dice.
const KEPT_ANY: CancellationMoney = { kind: "kept" };
const BACK_ANY: CancellationMoney = { kind: "refunded" };
const KEPT_FULL: CancellationMoney = { kind: "kept", eurCents: 115000, full: true };
const BACK: CancellationMoney = { kind: "refunded", eurCents: 2400 };
const NONE: CancellationMoney = { kind: "none" };

const clean = (text: string | null | undefined) => (text ?? null)?.replace(/ /g, " ") ?? null;

type Row = { phase: CancellationPhase; money: CancellationMoney; stage: "offer" | "booked"; audience?: "client" | "professional"; option?: boolean; notice: string | null; moneyText: string | null };

const ROWS: Row[] = [
  // A. Cliente, prima di accettare (scheda, riepilogo, confronto, PDF).
  { phase: "free", money: KEPT_ANY, stage: "offer", option: true, notice: "Avvisa almeno 24 ore prima.", moneyText: "Pagando online: annullamento gratuito fino a giovedì 19 novembre alle 08:00. Dopo, l'acconto non è rimborsabile." },
  { phase: "free", money: KEPT, stage: "offer", notice: "Avvisa almeno 24 ore prima.", moneyText: "Annullamento gratuito fino a giovedì 19 novembre alle 08:00. Dopo, l'acconto di 24,00 € non è rimborsabile." },
  { phase: "free", money: BACK_ANY, stage: "offer", option: true, notice: "Avvisa almeno 24 ore prima.", moneyText: "Pagando online, se annulli prima dell'appuntamento, l'acconto ti torna sempre sulla carta." },
  { phase: "free", money: NONE, stage: "offer", notice: "Avvisa almeno 24 ore prima.", moneyText: null },
  { phase: "late", money: KEPT_ANY, stage: "offer", option: true, notice: "Mancano meno di 24 ore all'appuntamento.", moneyText: "Pagando online, l'acconto non è rimborsabile, anche se annulli." },
  { phase: "late", money: KEPT, stage: "offer", notice: "Mancano meno di 24 ore all'appuntamento.", moneyText: "L'acconto di 24,00 € non è rimborsabile, anche se annulli." },
  { phase: "late", money: KEPT_FULL, stage: "offer", notice: "Mancano meno di 24 ore all'appuntamento.", moneyText: "Quello che paghi online (1.150,00 €) non è rimborsabile, anche se annulli." },
  { phase: "late", money: BACK_ANY, stage: "offer", option: true, notice: "Mancano meno di 24 ore all'appuntamento.", moneyText: "Pagando online, se annulli, l'acconto ti torna sulla carta." },
  { phase: "late", money: NONE, stage: "offer", notice: "Mancano meno di 24 ore all'appuntamento.", moneyText: null },
  { phase: "started", money: KEPT_ANY, stage: "offer", option: true, notice: "L'appuntamento è già iniziato: dopo aver accettato non si può più annullare.", moneyText: null },
  { phase: "started", money: NONE, stage: "offer", notice: "L'appuntamento è già iniziato: dopo aver accettato non si può più annullare.", moneyText: null },
  { phase: "over", money: KEPT_ANY, stage: "offer", option: true, notice: null, moneyText: null },
  // B. Cliente, lavoro fissato (email, pagina di conferma, scheda del lavoro).
  { phase: "free", money: KEPT, stage: "booked", notice: null, moneyText: "Annullamento gratuito fino a giovedì 19 novembre alle 08:00. Dopo, l'acconto di 24,00 € non è rimborsabile." },
  { phase: "free", money: KEPT_FULL, stage: "booked", notice: null, moneyText: "Annullamento gratuito fino a giovedì 19 novembre alle 08:00. Dopo, quello che hai pagato online (1.150,00 €) non è rimborsabile." },
  { phase: "free", money: BACK, stage: "booked", notice: "Se devi annullare, avvisa almeno 24 ore prima.", moneyText: "Se annulli prima dell'appuntamento, l'acconto di 24,00 € ti torna sempre sulla carta." },
  { phase: "free", money: NONE, stage: "booked", notice: "Se devi annullare, avvisa almeno 24 ore prima.", moneyText: null },
  { phase: "late", money: KEPT, stage: "booked", notice: "Mancano meno di 24 ore all'appuntamento.", moneyText: "L'acconto di 24,00 € non è rimborsabile, anche se annulli." },
  { phase: "late", money: BACK, stage: "booked", notice: "Mancano meno di 24 ore all'appuntamento.", moneyText: "Se annulli, l'acconto di 24,00 € ti torna sulla carta, ma il professionista vede che hai annullato all'ultimo." },
  { phase: "late", money: NONE, stage: "booked", notice: "Mancano meno di 24 ore all'appuntamento.", moneyText: "Se annulli non paghi niente, ma il professionista vede che hai annullato all'ultimo." },
  { phase: "started", money: KEPT, stage: "booked", notice: "L'appuntamento è già iniziato: non si può più annullare.", moneyText: null },
  { phase: "over", money: NONE, stage: "booked", notice: null, moneyText: null },
  // C. Professionista, lavoro fissato.
  { phase: "free", money: KEPT, stage: "booked", audience: "professional", notice: null, moneyText: "Il cliente può annullare gratis fino a giovedì 19 novembre alle 08:00. Dopo, l'acconto resta a te." },
  { phase: "free", money: NONE, stage: "booked", audience: "professional", notice: null, moneyText: "Se annulla, il cliente deve avvisarti entro giovedì 19 novembre alle 08:00." },
  { phase: "late", money: KEPT, stage: "booked", audience: "professional", notice: null, moneyText: "Il preavviso è iniziato: se il cliente annulla ora, l'acconto di 24,00 € resta a te." },
  { phase: "late", money: NONE, stage: "booked", audience: "professional", notice: null, moneyText: null },
  { phase: "started", money: KEPT, stage: "booked", audience: "professional", notice: null, moneyText: null },
];

for (const row of ROWS) {
  const name = `${row.audience ?? "client"} · ${row.stage} · ${row.phase} · ${row.money.kind}${row.option ? " (online tra i modi)" : ""}`;
  test(`tabella: ${name}`, () => {
    const phase = cancellationPhase(START, END, 24, NOW[row.phase]);
    assert.equal(phase, row.phase);
    const terms = cancellationTerms({ phase, start: START, hours: 24, money: row.money, stage: row.stage, audience: row.audience ?? "client", onlineIsOption: row.option });
    assert.equal(clean(terms.notice?.text), row.notice);
    assert.equal(clean(terms.money?.text), row.moneyText);
    // Colori decisi da Luca l'11/11: ocra solo per l'acconto non rimborsabile, mai rosso.
    if (terms.money) assert.equal(terms.money.tone, row.money.kind === "kept" && row.audience !== "professional" ? "warning" : "muted");
  });
}

test("con l'importo, anche tra più modi di pagamento (PDF)", () => {
  const terms = cancellationTerms({ phase: "free", start: START, hours: 24, money: KEPT, stage: "offer", audience: "client", onlineIsOption: true });
  assert.equal(clean(terms.money?.text), "Pagando online: annullamento gratuito fino a giovedì 19 novembre alle 08:00. Dopo, l'acconto di 24,00 € non è rimborsabile.");
});

test("una riga sola per email e PDF", () => {
  const terms = cancellationTerms({ phase: "late", start: START, hours: 24, money: KEPT, stage: "booked", audience: "client" });
  assert.equal(clean(cancellationTermsText(terms)), "Mancano meno di 24 ore all'appuntamento. L'acconto di 24,00 € non è rimborsabile, anche se annulli.");
  assert.equal(cancellationTermsText({ notice: null, money: null }), null);
});

test("confini al minuto: 24 ore e 1 minuto, 24 ore, 23 ore e 59 minuti", () => {
  // Inizio 08:00 di parete del 20/11 = 07:00 UTC. Scadenza 08:00 di parete del 19/11 = 07:00 UTC.
  assert.equal(cancellationPhase(START, END, 24, new Date("2026-11-19T06:59:00.000Z")), "free");
  assert.equal(cancellationPhase(START, END, 24, new Date("2026-11-19T07:00:00.000Z")), "free"); // "gratuito fino alle 08:00" compreso
  assert.equal(cancellationPhase(START, END, 24, new Date("2026-11-19T07:01:00.000Z")), "late");
  assert.equal(cancellationPhase(START, END, 24, new Date("2026-11-20T06:59:00.000Z")), "late");
  assert.equal(cancellationPhase(START, END, 24, new Date("2026-11-20T07:00:00.000Z")), "started");
  assert.equal(cancellationPhase(START, END, 24, new Date("2026-11-20T11:59:00.000Z")), "started");
  assert.equal(cancellationPhase(START, END, 24, new Date("2026-11-20T12:00:00.000Z")), "over");
  // 48 ore e 3 giorni.
  assert.equal(cancellationPhase(START, END, 48, new Date("2026-11-18T07:01:00.000Z")), "late");
  assert.equal(cancellationPhase(START, END, 72, new Date("2026-11-17T07:00:00.000Z")), "free");
});

test("cambio d'ora: il preavviso si conta in ore di parete italiane", () => {
  // Domenica 29 marzo 2026 alle 02:00 si va alle 03:00 (UTC+1 → UTC+2).
  const monday = "2026-03-30T10:00:00.000Z"; // lunedì 30 marzo, 10:00 di parete
  assert.equal(freeCancellationUntilLabel(monday, 24), "domenica 29 marzo alle 10:00");
  assert.equal(cancellationPhase(monday, null, 24, new Date("2026-03-29T07:59:00.000Z")), "free"); // 09:59 di parete (UTC+2)
  assert.equal(cancellationPhase(monday, null, 24, new Date("2026-03-29T08:01:00.000Z")), "late"); // 10:01 di parete
  // Domenica 25 ottobre 2026 alle 03:00 si torna alle 02:00 (UTC+2 → UTC+1).
  const sunday = "2026-10-25T10:00:00.000Z";
  assert.equal(freeCancellationUntilLabel(sunday, 24), "sabato 24 ottobre alle 10:00");
  assert.equal(cancellationPhase(sunday, null, 24, new Date("2026-10-24T07:59:00.000Z")), "free"); // 09:59 di parete (UTC+2)
  assert.equal(cancellationPhase(sunday, null, 24, new Date("2026-10-24T08:01:00.000Z")), "late");
  assert.equal(cancellationPhase(sunday, null, 24, new Date("2026-10-25T09:01:00.000Z")), "over"); // 10:01 di parete (UTC+1), senza fine
});

const instant = fc.date({ min: new Date("2026-01-01T00:00:00.000Z"), max: new Date("2027-12-31T00:00:00.000Z"), noInvalidDate: true });
const hoursArb = fc.constantFrom(24, 48, 72);
const moneyArb = fc.oneof(
  fc.constant<CancellationMoney>({ kind: "none" }),
  fc.record({ kind: fc.constant<"kept">("kept"), eurCents: fc.integer({ min: 50, max: 2_000_000 }), full: fc.boolean() }),
  fc.record({ kind: fc.constant<"refunded">("refunded"), eurCents: fc.integer({ min: 50, max: 2_000_000 }), full: fc.boolean() }),
);

test("prove a caso: mai una data già passata, e la data detta è quella dei controlli", () => {
  fc.assert(
    fc.property(instant, instant, hoursArb, moneyArb, fc.constantFrom<"offer" | "booked">("offer", "booked"), fc.constantFrom<"client" | "professional">("client", "professional"), fc.boolean(), (startAt, now, hours, money, stage, audience, option) => {
      const start = new Date(Math.floor(startAt.getTime() / 60_000) * 60_000).toISOString();
      const phase = cancellationPhase(start, null, hours, now);
      const input: CancellationTermsInput = { phase, start, hours, money, stage, audience, onlineIsOption: option };
      const text = cancellationTermsText(cancellationTerms(input)) ?? "";
      const until = freeCancellationUntilLabel(start, hours);
      if (text.includes(until)) {
        // La data compare solo se non è ancora passata.
        assert.equal(isLateCancellation(start, hours, now), false);
        assert.equal(phase, "free");
      }
      if (phase !== "free") assert.ok(!text.includes("gratuito fino a") && !text.includes("entro "), text);
      assert.equal(phase === "late" || phase === "started" || phase === "over", isLateCancellation(start, hours, now));
      assert.equal(freeCancellationDeadline(start, hours).getTime(), new Date(start).getTime() - hours * 3_600_000);
      // Mai un importo negativo o "NaN" nelle frasi.
      assert.ok(!/NaN|-\d/.test(text), text);
    }),
    { numRuns: 2000 },
  );
});

test("prove a caso: adesso + resto = massimo, e acconto mai sotto zero", () => {
  fc.assert(
    fc.property(fc.integer({ min: 0, max: 5_000_000 }), fc.integer({ min: 0, max: 5_000_000 }), fc.integer({ min: 1, max: 100 }), fc.constantFrom<"ONLINE" | "MIXED">("ONLINE", "MIXED"), (a, b, percent, choice) => {
      const totals = { totalMinEurCents: Math.min(a, b), totalMaxEurCents: Math.max(a, b) };
      const split = quotePaymentSplit(choice, totals, percent);
      if (totals.totalMaxEurCents <= 0) return assert.equal(split, null);
      assert.ok(split);
      assert.equal(split.nowEurCents + split.restMaxEurCents, totals.totalMaxEurCents);
      assert.ok(split.nowEurCents >= 0 && split.restMinEurCents >= 0 && split.restMinEurCents <= split.restMaxEurCents);
    }),
    { numRuns: 2000 },
  );
});

// Spostare un appuntamento già fissato (docs/changelog/2026-11-13-annullare-spostamento.md).
test("spostare l'appuntamento: avviso prima di accettare una data dentro il preavviso", () => {
  const line = (money: CancellationMoney, audience: "client" | "professional", phase: CancellationPhase) =>
    rescheduleCancellationLine({ start: START, end: END, hours: 24, money, audience, now: NOW[phase] });
  assert.deepEqual(clean(line(KEPT, "client", "late")?.text), "Con questa data mancano meno di 24 ore: l'acconto di 24,00 € non sarà più rimborsabile, anche se annulli.");
  assert.equal(line(KEPT, "client", "late")?.tone, "warning");
  assert.deepEqual(clean(line(KEPT_FULL, "client", "late")?.text), "Con questa data mancano meno di 24 ore: quello che hai pagato online (1.150,00 €) non sarà più rimborsabile, anche se annulli.");
  assert.deepEqual(clean(line(KEPT, "client", "free")?.text), "Con questa data puoi annullare gratis fino a giovedì 19 novembre alle 08:00.");
  assert.equal(line(BACK, "client", "free"), null);
  assert.equal(line(NONE, "client", "free"), null);
  assert.deepEqual(clean(line(BACK, "client", "late")?.text), "Con questa data mancano meno di 24 ore all'appuntamento.");
  assert.deepEqual(clean(line(NONE, "client", "started")?.text), "Con questa data mancano meno di 24 ore all'appuntamento.");
  assert.deepEqual(clean(line(KEPT, "professional", "late")?.text), "Con questa data il preavviso è già iniziato: se il cliente annulla, l'acconto di 24,00 € resta a te.");
  assert.deepEqual(clean(line(KEPT_FULL, "professional", "late")?.text), "Con questa data il preavviso è già iniziato: se il cliente annulla, quello che ha pagato online (1.150,00 €) resta a te.");
  assert.deepEqual(clean(line(KEPT, "professional", "free")?.text), "Con questa data il cliente può annullare gratis fino a giovedì 19 novembre alle 08:00.");
  assert.equal(line(KEPT, "client", "over"), null);
});
