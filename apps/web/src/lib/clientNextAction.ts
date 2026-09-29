import type { ClientBooking, ClientGuidedRequest } from "@professionisti/api-client";
import type { RequestStage } from "@/lib/requestStage";

/**
 * L'unica cosa che il cliente deve fare ora su una richiesta, come "I miei
 * ordini" di Amazon (docs/CHANGELOG.md §147). `null` quando la mossa spetta
 * al professionista o la richiesta è chiusa: niente pulsante, per non
 * inventare un'azione che non c'è.
 */
export function clientNextAction(
  stage: RequestStage,
  request: Pick<ClientGuidedRequest, "quotes">,
  booking: Pick<ClientBooking, "status" | "scheduledAt" | "hasReview" | "clientConfirmedCompletedAt" | "issue" | "canReview"> | null,
  now: number = Date.now(),
): string | null {
  if (stage === "in_attesa") {
    const sent = request.quotes.filter((q) => q.status === "SENT").length;
    return sent > 1 ? `Confronta i ${sent} preventivi` : "Guarda il preventivo";
  }
  // Segnalazione di un problema (docs/CHANGELOG.md §164): mentre è in esame
  // non c'è nulla da fare; dopo la decisione resta solo la recensione.
  if (booking?.issue) return booking.canReview ? "Lascia una recensione" : null;
  if (stage === "accettata" && booking?.status === "CONFIRMED" && !booking.clientConfirmedCompletedAt && new Date(booking.scheduledAt).getTime() < now) {
    return "Conferma che il lavoro è terminato";
  }
  if (stage === "completata" && booking?.canReview) return "Lascia una recensione";
  return null;
}
