import { test } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";
import {
  APPOINTMENT_JUST_STARTED_MESSAGE,
  CANCELLATION_TERMS_EXPIRED_MESSAGE,
  buildAcceptedTerms,
  cancellationTermsChangedMessage,
  depositKeptOnLateCancel,
} from "./acceptedTerms";
import { acceptQuoteSchema } from "./onlinePaymentsSchemas";

/**
 * Testo salvato sul lavoro e controllo di "Accetta" sul server
 * (docs/changelog/2026-11-13-annullare-pagina-aperta.md).
 */

const START = "2026-11-20T08:00:00.000Z"; // venerdì 08:00 ora italiana ("di parete")
const END = "2026-11-20T13:00:00.000Z";
// Scadenza dell'annullamento gratuito: giovedì 19 alle 08:00 italiane = 07:00 UTC.
const BEFORE = new Date("2026-11-19T07:00:00.000Z");
const AFTER = new Date("2026-11-19T07:03:00.000Z");
const clean = (text: string | null) => text?.replace(/ /g, " ") ?? null;

const base = {
  start: START,
  end: END,
  hours: 24,
  lateCancelKeepsDeposit: true,
  paymentMethod: "MIXED" as const,
  totals: { totalMinEurCents: 12000, totalMaxEurCents: 12000 },
  depositPercent: 20,
  onlyPaymentOption: true,
};

test("accettato in tempo: salva le frasi lette, le cifre e le due ore", () => {
  const terms = buildAcceptedTerms({ ...base, phaseSeen: "free", seenAt: "2026-11-19T06:55:00.000Z", now: BEFORE });
  assert.equal(terms.phaseSeen, "free");
  assert.equal(terms.phaseAtAcceptance, "free");
  assert.equal(clean(terms.notice), "Avvisa almeno 24 ore prima.");
  assert.equal(clean(terms.money), "Annullamento gratuito fino a giovedì 19 novembre alle 08:00. Dopo, l'acconto di 24,00 € non è rimborsabile.");
  assert.equal(clean(terms.payment), "24,00 € adesso con la carta, il resto (96,00 €) a lavoro finito direttamente al professionista");
  assert.equal(terms.nowEurCents, 2400);
  assert.equal(terms.seenAt, "2026-11-19T06:55:00.000Z");
  assert.equal(terms.acceptedAt, BEFORE.toISOString());
  assert.equal(terms.depositRefundedIfLate, false);
  assert.equal(depositKeptOnLateCancel(true, terms), true);
});

test("letto 'gratuito fino a' e pagamento finito su Stripe dopo la scadenza: l'acconto torna anche annullando tardi", () => {
  const terms = buildAcceptedTerms({ ...base, phaseSeen: "free", now: AFTER });
  assert.equal(terms.phaseAtAcceptance, "late");
  // Si salva quello che ha letto, non la frase di adesso.
  assert.match(clean(terms.money) ?? "", /^Annullamento gratuito fino a/);
  assert.equal(terms.depositRefundedIfLate, true);
  assert.equal(depositKeptOnLateCancel(true, terms), false);
});

test("accettato già dentro il preavviso, sapendolo: l'acconto resta al professionista", () => {
  const terms = buildAcceptedTerms({ ...base, phaseSeen: "late", now: AFTER });
  assert.equal(clean(terms.money), "L'acconto di 24,00 € non è rimborsabile, anche se annulli.");
  assert.equal(terms.depositRefundedIfLate, false);
  assert.equal(depositKeptOnLateCancel(true, terms), true);
});

test("pagamento diretto: nessuna riga sui soldi, niente importo", () => {
  const terms = buildAcceptedTerms({ ...base, paymentMethod: "DIRECT", phaseSeen: "late", now: AFTER });
  assert.equal(terms.money, null);
  assert.equal(terms.nowEurCents, 0);
  assert.equal(clean(terms.notice), "Mancano meno di 24 ore all'appuntamento.");
});

test("lavori di prima (nessun testo salvato) e acconto sempre restituito", () => {
  assert.equal(depositKeptOnLateCancel(true, null), true);
  assert.equal(depositKeptOnLateCancel(false, null), false);
  assert.equal(depositKeptOnLateCancel(false, { depositRefundedIfLate: false }), false);
  assert.equal(depositKeptOnLateCancel(null, undefined), false);
});

test("controllo di Accetta: chiede di rileggere solo se il momento è peggiorato", () => {
  assert.equal(cancellationTermsChangedMessage("free", "free"), null);
  assert.equal(cancellationTermsChangedMessage("free", "late"), CANCELLATION_TERMS_EXPIRED_MESSAGE);
  assert.equal(cancellationTermsChangedMessage("free", "started"), APPOINTMENT_JUST_STARTED_MESSAGE);
  assert.equal(cancellationTermsChangedMessage("late", "late"), null);
  assert.equal(cancellationTermsChangedMessage("late", "started"), APPOINTMENT_JUST_STARTED_MESSAGE);
  assert.equal(cancellationTermsChangedMessage("started", "started"), null);
  // Pagina vecchia che diceva "mancano meno di" e intanto la data è cambiata in meglio: niente blocco.
  assert.equal(cancellationTermsChangedMessage("late", "free"), null);
});

test("la richiesta di Accetta accetta il momento letto ed è facoltativo", () => {
  assert.equal(acceptQuoteSchema.parse({ paymentMethod: "DIRECT" }).seenCancellationPhase, undefined);
  assert.equal(acceptQuoteSchema.parse({ paymentMethod: "DIRECT", seenCancellationPhase: "late", seenTermsAt: "2026-11-19T06:55:00.000Z" }).seenCancellationPhase, "late");
  assert.throws(() => acceptQuoteSchema.parse({ paymentMethod: "DIRECT", seenCancellationPhase: "over" }));
});

test("prove a caso: l'acconto torna annullando tardi solo se il cliente ha letto 'gratuito' e non ha avuto tempo", () => {
  fc.assert(
    fc.property(
      fc.constantFrom("free" as const, "late" as const, "started" as const, null),
      fc.integer({ min: -3 * 24 * 60, max: 3 * 24 * 60 }),
      fc.boolean(),
      (phaseSeen, minutes, keeps) => {
        const now = new Date(BEFORE.getTime() + minutes * 60_000);
        const terms = buildAcceptedTerms({ ...base, lateCancelKeepsDeposit: keeps, phaseSeen, now });
        const expected = keeps && phaseSeen === "free" && terms.phaseAtAcceptance !== "free";
        assert.equal(terms.depositRefundedIfLate, expected);
        assert.equal(depositKeptOnLateCancel(keeps, terms), keeps && !expected);
      },
    ),
  );
});
