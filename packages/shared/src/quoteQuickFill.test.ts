import assert from "node:assert/strict";
import { test } from "node:test";
import type { ProfessionalLead } from "./dashboard";
import { QUICK_QUOTE_SERVICES_SHOWN, lastSimilarQuote, quickQuoteServices, quoteItemFromService, type QuickQuoteService } from "./quoteQuickFill";

const service = (id: string, name: string, extra: Partial<QuickQuoteService> = {}): QuickQuoteService => ({
  id,
  name,
  priceMinEurCents: 5000,
  priceMaxEurCents: 8000,
  priceUnit: "JOB",
  categorySlug: "idraulico",
  ...extra,
});

test("prima la prestazione adatta alla descrizione, poi quelle del mestiere, poi le altre", () => {
  const services = [
    service("1", "Tinteggiatura pareti", { categorySlug: "imbianchino" }),
    service("2", "Spurgo scarichi"),
    service("3", "Sostituzione rubinetto"),
  ];
  const result = quickQuoteServices(services, { categoryLabel: "Idraulico", description: "Il rubinetto della cucina perde" });
  assert.deepEqual(result.map((r) => r.service.id), ["3", "2", "1"]);
  assert.deepEqual(result.map((r) => r.suggested), [true, false, false]);
});

test("senza corrispondenza nessuna è segnata, e se ne mostrano al massimo 8", () => {
  const services = Array.from({ length: 12 }, (_, i) => service(String(i), `Lavoro ${i}`));
  const result = quickQuoteServices(services, { categoryLabel: "Idraulico", description: "Serve aiuto" });
  assert.equal(result.length, QUICK_QUOTE_SERVICES_SHOWN);
  assert.ok(result.every((r) => !r.suggested));
});

test("il prezzo si copia solo se è a lavoro", () => {
  assert.deepEqual(quoteItemFromService(service("1", "Spurgo")), { name: "Spurgo", priceMinEurCents: 5000, priceMaxEurCents: 8000 });
  assert.deepEqual(quoteItemFromService(service("2", "Tinteggiatura", { priceUnit: "SQUARE_METER" })), { name: "Tinteggiatura", priceMinEurCents: null, priceMaxEurCents: null });
});

function lead(id: string, category: string, quote: { sentAt: string; name: string } | null): ProfessionalLead {
  return {
    guidedRequest: { id, categoryLabel: category, description: `Richiesta ${id}` },
    quote: quote ? { sentAt: quote.sentAt, notes: null, items: [{ id: `${id}-i`, name: quote.name, priceMinEurCents: 1000, priceMaxEurCents: null }] } : null,
  } as unknown as ProfessionalLead;
}

test("l'ultimo preventivo dello stesso mestiere su un'altra richiesta", () => {
  const current = lead("c", "Idraulico", null);
  const leads = [
    current,
    lead("a", "Idraulico", { sentAt: "2026-11-01T10:00:00.000Z", name: "Vecchio" }),
    lead("b", "Idraulico", { sentAt: "2026-11-05T10:00:00.000Z", name: "Recente" }),
    lead("d", "Elettricista", { sentAt: "2026-11-07T10:00:00.000Z", name: "Altro mestiere" }),
  ];
  const similar = lastSimilarQuote(leads, current);
  assert.equal(similar?.guidedRequestId, "b");
  assert.equal(similar?.items[0]?.name, "Recente");
  assert.equal(lastSimilarQuote([current], current), null);
});
