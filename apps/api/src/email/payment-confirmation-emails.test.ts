import { describe, expect, it } from "vitest";
import { notificationTopicOf } from "@professionisti/shared";
import { renderEmail } from "./email-layout";
import { formatCard } from "./email-format";
import { notificationEmail, type NotificationEmailContext } from "./templates/notification-emails";

/**
 * Conferme di pagamento al cliente, riepilogo nelle email dell'abbonamento e
 * piede con Termini e Privacy (docs/changelog/2026-11-03-conferme-pagamento-e-abbonamento.md).
 */
const ctx: NotificationEmailContext = {
  name: "Anna",
  category: "Idraulico",
  city: "Roma",
  businessName: "Idraulica Rossi",
  when: new Date("2026-11-10T09:00:00.000Z"),
  proposedWhen: null,
};

describe("carta nelle email", () => {
  it("marca e ultime 4 cifre, con Apple Pay se usato", () => {
    expect(formatCard("visa", "4242")).toBe("Visa •••• 4242");
    expect(formatCard("mastercard", "5772", "apple_pay")).toBe("Apple Pay (Mastercard •••• 5772)");
    expect(formatCard("sconosciuta", "1111")).toBe("Carta •••• 1111");
    expect(formatCard("visa", null)).toBe("");
  });
});

describe("Pagamento confermato al cliente", () => {
  const base = {
    bookingId: "bk-1",
    guidedRequestId: "gr-1",
    amountEurCents: 8000,
    paidTotalEurCents: 8000,
    remainingEurCents: null,
    balanceDirect: false,
    cardBrand: "visa",
    cardLast4: "4242",
    paidAt: "2026-11-03T10:09:00.000Z",
    paymentRef: "pi_123",
  };

  it("acconto: importo, professionista, carta, data, numero e cosa succede ora", () => {
    const email = renderEmail(notificationEmail("JOB_PAYMENT_CONFIRMED", { ...base, part: "deposit" }, ctx)!);
    expect(email.subject).toBe("Pagamento confermato: acconto di €80");
    expect(email.text).toContain("Professionista: Idraulica Rossi");
    expect(email.text).toContain("Acconto pagato: €80");
    expect(email.text).toContain("Da pagare ancora: il saldo, a lavoro finito");
    expect(email.text).toContain("Metodo di pagamento: Visa •••• 4242");
    expect(email.text).toMatch(/Data del pagamento: .*11:09/);
    expect(email.text).toContain("Numero del pagamento: pi_123");
    expect(email.text).toContain("La ricevuta o la fattura la fa il professionista");
    expect(email.text).toContain("/le-mie-richieste?tab=lavori&open=gr-1");
  });

  it("saldo: totale pagato e niente da pagare se è tutto saldato", () => {
    const email = renderEmail(notificationEmail("JOB_PAYMENT_CONFIRMED", { ...base, part: "balance", amountEurCents: 12000, paidTotalEurCents: 20000, remainingEurCents: 0 }, ctx)!);
    expect(email.subject).toBe("Pagamento confermato: saldo di €120");
    expect(email.text).toContain("Saldo pagato: €120");
    expect(email.text).toContain("Pagato in tutto: €200");
    expect(email.text).not.toContain("Da pagare ancora");
  });

  it("saldo addebitato da solo: stesso riepilogo", () => {
    const email = renderEmail(notificationEmail("JOB_BALANCE_AUTO_CHARGED", { ...base, part: "balance", amountEurCents: 12000, paidTotalEurCents: 20000, remainingEurCents: 0 }, ctx)!);
    expect(email.subject).toBe("Saldo del lavoro pagato: €120");
    expect(email.text).toContain("Metodo di pagamento: Visa •••• 4242");
  });

  it("sta nell'argomento dei pagamenti dei lavori (CLAUDE.md §5 punto 13)", () => {
    expect(notificationTopicOf("JOB_PAYMENT_CONFIRMED")).toBe("lavori");
  });
});

describe("email dell'abbonamento", () => {
  it("pagamento: totale con l'IVA, carta, data, prossimo addebito e come cambiare carta o annullare", () => {
    const email = renderEmail(
      notificationEmail(
        "SUBSCRIPTION_PAID",
        { tierLabel: "Plus", upgradeFee: false, amountEurCents: 7198, invoice: true, netEurCents: 5900, vatEurCents: 1298, cardBrand: "mastercard", cardLast4: "5772", paidAt: "2026-11-03T10:00:00.000Z", nextChargeAt: "2026-12-03T10:00:00.000Z" },
        ctx,
      )!,
    );
    expect(email.text).toContain("Abbonamento: Plus");
    expect(email.text).toContain("Totale pagato: €71,98 (di cui IVA €12,98)");
    expect(email.text).toContain("Metodo di pagamento: Mastercard •••• 5772");
    expect(email.text).toMatch(/Prossimo addebito: .*3 dicembre/);
    expect(email.text).toContain("Puoi cambiare la carta o annullare quando vuoi dalla pagina Abbonamento");
    expect(email.text).toContain("/dashboard/abbonamento");
    expect(email.text).toContain("/dashboard/documenti");
  });

  it("rinnovo annullato: dice quando finisce invece del prossimo addebito", () => {
    const email = renderEmail(notificationEmail("SUBSCRIPTION_RENEWED", { tierLabel: "Base", amountEurCents: 2318, date: "2026-12-03T10:00:00.000Z", endsAt: "2026-12-03T10:00:00.000Z" }, ctx)!);
    expect(email.text).not.toContain("Prossimo addebito");
    expect(email.text).toMatch(/Finisce il: .*3 dicembre/);
    expect(email.text).toContain("Hai annullato il rinnovo");
  });

  it("rinnovo senza dati in più: resta il prossimo rinnovo dalla data", () => {
    const email = renderEmail(notificationEmail("SUBSCRIPTION_RENEWED", { tierLabel: "Base", amountEurCents: 2318, date: "2026-12-03T10:00:00.000Z" }, ctx)!);
    expect(email.text).toContain("Totale pagato: €23,18");
    expect(email.text).toMatch(/Prossimo addebito: .*3 dicembre/);
  });
});

describe("piede delle email", () => {
  it("ha sempre Termini e Privacy", () => {
    const email = renderEmail({ kind: "account", subject: "Prova", title: "Titolo", paragraphs: ["Testo"] });
    expect(email.html).toContain("/termini");
    expect(email.html).toContain("/privacy");
    expect(email.text).toContain("Termini:");
    // Ragione sociale ancora da compilare in COMPANY: non compare il segnaposto.
    expect(email.text).not.toContain("DA COMPILARE");
  });
});

describe("quando partono le conferme di pagamento", () => {
  it("non aspettano il riassunto della sera", async () => {
    const { NOTIFICATION_DIGEST_TYPES } = await import("@professionisti/shared");
    expect(NOTIFICATION_DIGEST_TYPES.has("JOB_BALANCE_AUTO_CHARGED")).toBe(false);
    expect(NOTIFICATION_DIGEST_TYPES.has("JOB_PAYMENT_CONFIRMED")).toBe(false);
  });
});
