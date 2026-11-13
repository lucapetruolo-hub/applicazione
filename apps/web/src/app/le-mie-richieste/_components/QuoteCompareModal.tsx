"use client";

import { useMinuteClock } from "@/lib/useMinuteClock";
import { useEffect, useRef } from "react";
import type { ClientGuidedRequest } from "@professionisti/api-client";
import { cancellationPhase, cancellationTerms, formatEurRange, paymentChoiceIsOnline, jobPaymentChoiceCopy, quoteComparisonHighlights, quotePriceTotals } from "@professionisti/shared";
import { Avatar, Badge, Icon, Text, XStack, YStack, brand } from "@professionisti/ui";
import { closeOnBackdrop } from "@/lib/closeOnBackdrop";
import { selectablePaymentChoices } from "@/components/PaymentChoice";
import { formatQuoteDateRange } from "./QuoteCard";

/**
 * Confronto dei preventivi fianco a fianco (docs/changelog/2026-11-08-confronto-preventivi.md):
 * una tabella vera (intestazioni di riga e di colonna per il lettore di
 * schermo) con prezzo, data, pagamento, preavviso, recensioni, verifica e
 * voci. "Vedi e accetta" chiude e porta al preventivo: si accetta sempre dal
 * percorso di sempre, mai da qui.
 */

type Quote = ClientGuidedRequest["quotes"][number];
type SentTo = ClientGuidedRequest["sentTo"][number];

export function QuoteCompareModal({
  quotes,
  sentTo,
  onlineAvailable,
  onPick,
  onClose,
}: {
  quotes: readonly Quote[];
  sentTo: readonly SentTo[];
  onlineAvailable: boolean;
  onPick: (quoteId: string) => void;
  onClose: () => void;
}) {
  // Ora aggiornata ogni minuto: le frasi su annullare cambiano da sole (docs/changelog/2026-11-13-annullare-pagina-aperta.md).
  const now = useMinuteClock();
  const closeRef = useRef<HTMLButtonElement>(null);
  const { cheapestId, soonestId } = quoteComparisonHighlights(quotes);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [onClose]);

  const verified = (q: Quote) => sentTo.find((p) => p.id === q.professionalProfileId)?.verified ?? false;

  return (
    <div role="presentation" className="quote-compare-overlay" onClick={closeOnBackdrop(onClose)}>
      <div role="dialog" aria-modal="true" aria-labelledby="quote-compare-title" className="quote-compare-dialog">
        <XStack justifyContent="space-between" alignItems="center" gap="$3" paddingBottom="$3">
          <Text id="quote-compare-title" render="h2" fontFamily="$heading" fontWeight="800" fontSize={20} color={brand.inchiostro} margin={0}>
            Confronta i preventivi
          </Text>
          <button ref={closeRef} type="button" className="quote-compare-close" onClick={onClose} aria-label="Chiudi il confronto">
            <Icon name="x" size={20} color={brand.grafite} />
          </button>
        </XStack>

        {quotes.length > 2 ? (
          <p className="quote-compare-swipe">
            Scorri di lato per vederli tutti
          </p>
        ) : null}
        {/* Si scorre di lato con tre preventivi o più: raggiungibile col Tab per scorrerla con le frecce (WCAG 2.1.1, axe scrollable-region-focusable). */}
        {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
        <div className="quote-compare-scroll" role="region" aria-label="Tabella dei preventivi" tabIndex={0}>
          <table className="quote-compare">
            <thead>
              <tr>
                <td className="quote-compare-corner" />
                {quotes.map((q) => (
                  <th key={q.id} scope="col">
                    <span className="quote-compare-pro">
                      <Avatar name={q.businessName} imageUrl={q.imageUrl} size={40} />
                      <span className="quote-compare-name">{q.businessName}</span>
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">Prezzo</th>
                {quotes.map((q) => {
                  const t = quotePriceTotals(q.items);
                  return (
                    <td key={q.id}>
                      <span className="quote-compare-big">{t.totalMinEurCents > 0 || t.totalMaxEurCents > 0 ? formatEurRange(t.totalMinEurCents || null, t.totalMaxEurCents || null) : "Da definire"}</span>
                      {q.id === cheapestId ? <span className="quote-compare-tag">Prezzo più basso</span> : null}
                    </td>
                  );
                })}
              </tr>
              <tr>
                <th scope="row">Quando</th>
                {quotes.map((q) => (
                  <td key={q.id}>
                    {formatQuoteDateRange(q.estimatedStartDate, q.estimatedEndDate)}
                    {q.status === "MODIFICATION_REQUESTED" ? <span className="quote-compare-note">Hai proposto un&apos;altra data</span> : null}
                    {q.id === soonestId ? <span className="quote-compare-tag">Data più vicina</span> : null}
                  </td>
                ))}
              </tr>
              <tr>
                <th scope="row">Pagamento</th>
                {quotes.map((q) => {
                  const choices = selectablePaymentChoices(q.paymentOptions, onlineAvailable);
                  return (
                    <td key={q.id}>
                      {choices.length === 0 ? (
                        "Da accordare in chat"
                      ) : choices.length === 1 ? (
                        jobPaymentChoiceCopy(choices[0]!, q.depositPercent, true).title
                      ) : (
                        <ul className="quote-compare-list">
                          {choices.map((c) => (
                            <li key={c}>{jobPaymentChoiceCopy(c, q.depositPercent, true).title}</li>
                          ))}
                        </ul>
                      )}
                    </td>
                  );
                })}
              </tr>
              <tr>
                <th scope="row">Se annulli</th>
                {/* Anche cosa succede all'acconto: è una differenza vera tra due preventivi
                    (tabella dei casi, docs/changelog/2026-11-13-annullare-una-fonte.md). */}
                {quotes.map((q) => {
                  const onlineOffered = selectablePaymentChoices(q.paymentOptions, onlineAvailable).some(paymentChoiceIsOnline);
                  const start = q.status === "MODIFICATION_REQUESTED" && q.clientProposedDate ? q.clientProposedDate : q.estimatedStartDate;
                  const end = q.status === "MODIFICATION_REQUESTED" && q.clientProposedDate ? q.clientProposedEndDate : q.estimatedEndDate;
                  const terms = cancellationTerms({
                    phase: cancellationPhase(start, end, q.cancellationNoticeHours, now),
                    start,
                    hours: q.cancellationNoticeHours,
                    money: !onlineOffered ? { kind: "none" } : q.lateCancelKeepsDeposit ? { kind: "kept" } : { kind: "refunded" },
                    stage: "offer",
                    audience: "client",
                    onlineIsOption: onlineOffered,
                  });
                  return (
                    <td key={q.id}>
                      {terms.notice?.text ?? "Data passata"}
                      {terms.money ? (
                        <span className="quote-compare-note" style={terms.money.tone === "warning" ? { color: brand.ottoneScuro, fontWeight: 600 } : undefined}>
                          {terms.money.text}
                        </span>
                      ) : null}
                    </td>
                  );
                })}
              </tr>
              <tr>
                <th scope="row">Recensioni</th>
                {quotes.map((q) => (
                  <td key={q.id}>
                    {q.reviews && q.reviews.count > 0 && q.reviews.rating != null ? (
                      <span className="quote-compare-rating">
                        <Icon name="star" size={14} color={brand.ottone} />
                        {q.reviews.rating.toLocaleString("it-IT", { maximumFractionDigits: 1 })} ({q.reviews.count})
                      </span>
                    ) : (
                      "Ancora nessuna"
                    )}
                  </td>
                ))}
              </tr>
              <tr>
                <th scope="row">Verificato</th>
                {quotes.map((q) => (
                  <td key={q.id}>{verified(q) ? <Badge variant="verificato">Verificato</Badge> : "Non ancora"}</td>
                ))}
              </tr>
              <tr>
                <th scope="row">Voci</th>
                {quotes.map((q) => (
                  <td key={q.id}>
                    <ul className="quote-compare-list">
                      {q.items.map((it) => (
                        <li key={it.id}>
                          {it.name}
                          {it.priceMinEurCents != null || it.priceMaxEurCents != null ? <span className="quote-compare-muted"> · {formatEurRange(it.priceMinEurCents, it.priceMaxEurCents)}</span> : null}
                        </li>
                      ))}
                    </ul>
                    {q.notes ? <span className="quote-compare-note">“{q.notes}”</span> : null}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="quote-compare-corner" />
                {quotes.map((q) => (
                  <td key={q.id}>
                    <button type="button" className="quote-compare-pick" onClick={() => onPick(q.id)} aria-label={`Vedi e accetta il preventivo di ${q.businessName}`}>
                      Vedi e accetta
                    </button>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        <YStack paddingTop="$3">
          <Text fontSize={13} color={brand.grafite70}>
            Prezzi e date sono scritti da ciascun professionista.
          </Text>
        </YStack>
      </div>
    </div>
  );
}
