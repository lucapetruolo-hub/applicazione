"use client";

import { useOnlinePayments } from "@/lib/onlinePayments";

/**
 * Riga in testa al punto 5 dei Termini (docs/CHANGELOG.md §170): finché il
 * pagamento online non è attivo, il punto vale solo per il pagamento diretto.
 * Il resto del testo resta com'è, perché è quello da far verificare
 * all'avvocato e vale dal giorno in cui Stripe viene attivato.
 */
export function OnlinePaymentsTermsNote() {
  const onlinePayments = useOnlinePayments();
  if (onlinePayments) return null;
  return (
    <strong style={{ display: "block", marginBottom: 8 }}>
      Il pagamento online non è ancora attivo: fino alla sua attivazione tutti i lavori si pagano direttamente al
      professionista, con le regole del pagamento diretto descritte qui sotto.
    </strong>
  );
}
