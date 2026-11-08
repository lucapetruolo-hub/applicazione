"use client";

import { YStack } from "@professionisti/ui";
import { SkeletonBlock, SkeletonRequestList } from "./Skeleton";

/**
 * Pagina in arrivo (collaudo 08/11 E8-02, docs/changelog/2026-11-08-seo-e-velocita.md):
 * al posto del vuoto mentre si carica l'accesso o il JavaScript della pagina,
 * la sagoma della pagina con la riga "Caricamento…". Arriva già nell'HTML del
 * server, quindi su rete lenta si vede subito, prima che il JavaScript sia
 * scaricato. La riga è letta anche dal lettore di schermo.
 *
 * `list`: titolo e qualche scheda (richieste, agenda, messaggi…).
 * `form`: colonna stretta con qualche campo e il pulsante (accesso, iscrizione, pagine aperte da un'email).
 */
export function PageLoading({ variant = "list" }: { variant?: "list" | "form" }) {
  const form = variant === "form";
  return (
    <YStack width="100%" alignItems="center" paddingVertical="7" paddingHorizontal="4" minHeight="70vh" aria-busy>
      <YStack width="100%" maxWidth={form ? 480 : 960} gap="4">
        <SkeletonBlock width={form ? "70%" : "45%"} height={30} radius={8} />
        <SkeletonBlock width="80%" height={14} />
        {form ? (
          <YStack gap="4" marginTop="2">
            {[0, 1, 2].map((i) => (
              <YStack key={i} gap="2">
                <SkeletonBlock width={120} height={13} />
                <SkeletonBlock width="100%" height={46} radius={10} />
              </YStack>
            ))}
            <SkeletonBlock width="100%" height={48} radius={24} />
          </YStack>
        ) : (
          <SkeletonRequestList count={3} />
        )}
        <p role="status" className="page-loading-note">
          Caricamento…
        </p>
      </YStack>
    </YStack>
  );
}
