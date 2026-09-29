"use client";

import Link from "next/link";
import { Surface, Text, YStack, brand, radiusDoc } from "@professionisti/ui";
import { formatIssueDeadline } from "@/lib/leadDeadline";

/**
 * Banner fisso in Home quando c'è una misura in corso per segnalazioni
 * accolte (docs/CHANGELOG.md §167): nessuna nuova richiesta (3ª segnalazione
 * in 30 giorni) o profilo più in basso (2ª). Rimanda alle segnalazioni, dove
 * si può fare ricorso.
 */
export function IssueSanctionBanner({ demotedUntil, requestsBlockedUntil }: { demotedUntil?: string | null; requestsBlockedUntil?: string | null }) {
  if (!demotedUntil && !requestsBlockedUntil) return null;
  const blocked = !!requestsBlockedUntil;
  return (
    <Surface borderRadius={radiusDoc} padding="$4" gap="$2" borderLeftWidth={4} borderLeftColor={blocked ? brand.urgenza : brand.ottone} role="status">
      <YStack gap="$1">
        <Text fontFamily="$heading" fontWeight="800" fontSize="$6" color={brand.grafite}>
          {blocked ? "Non puoi ricevere nuove richieste" : "Il tuo profilo è più in basso"}
        </Text>
        <Text color={brand.grafite70}>
          {blocked
            ? `Per le segnalazioni accolte negli ultimi 30 giorni, fino a ${formatIssueDeadline(requestsBlockedUntil!)} il profilo non compare nelle ricerche e non ricevi nuove richieste. I lavori già accettati restano attivi.`
            : `Per le segnalazioni accolte negli ultimi 30 giorni, fino a ${formatIssueDeadline(demotedUntil!)} il profilo compare più in basso nelle ricerche e riceve meno richieste. Un'altra segnalazione accolta blocca le nuove richieste per 14 giorni.`}
        </Text>
      </YStack>
      <Link href="/dashboard/richieste" style={{ fontWeight: 700, color: brand.grafite, alignSelf: "flex-start" }}>
        Vedi le segnalazioni e fai ricorso
      </Link>
    </Surface>
  );
}
