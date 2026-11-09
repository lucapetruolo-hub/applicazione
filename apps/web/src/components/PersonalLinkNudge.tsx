"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { Button, Icon, Text, XStack, YStack, brand } from "@professionisti/ui";
import { personalLinkNudgeDue } from "@professionisti/shared";

/**
 * Dopo "Lavoro terminato" (docs/changelog/2026-11-08-canale-del-professionista.md):
 * è il momento in cui il professionista è più contento, quindi un piccolo
 * invito a mandare il suo link ad altri clienti. Mai a ogni lavoro (decisione
 * di Luca del 09/11/2026, "altrimenti diventa noioso"): al massimo una volta
 * ogni 30 giorni su questo dispositivo.
 */
const storageKey = (profileId: string) => `invito-link-dopo-lavoro:${profileId}`;

/** Vero se l'invito può comparire ora; se sì, segna che è comparso. */
export function takePersonalLinkNudge(profileId: string, now = Date.now()): boolean {
  try {
    const stored = window.localStorage.getItem(storageKey(profileId));
    if (!personalLinkNudgeDue(stored === null ? null : Number(stored), now)) return false;
    window.localStorage.setItem(storageKey(profileId), String(now));
    return true;
  } catch {
    // Memoria del browser bloccata: meglio non mostrarlo che mostrarlo sempre.
    return false;
  }
}

// Un solo invito per tutta l'area personale: la scheda del lavoro può
// sparire dalla lista appena chiusa, quindi l'invito non vive lì ma in
// `PersonalLinkNudgeHost`, montato nel layout di /dashboard.
let nudgeVisible = false;
const listeners = new Set<() => void>();
function setNudgeVisible(value: boolean) {
  nudgeVisible = value;
  listeners.forEach((listener) => listener());
}

/** Da chiamare dopo un "Lavoro terminato" riuscito. */
export function personalLinkNudgeAfterJob(profileId: string | null | undefined): void {
  if (profileId && takePersonalLinkNudge(profileId)) setNudgeVisible(true);
}

export function PersonalLinkNudgeHost() {
  const visible = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => nudgeVisible,
    () => false,
  );
  return visible ? <PersonalLinkNudge onClose={() => setNudgeVisible(false)} /> : null;
}

function PersonalLinkNudge({ onClose }: { onClose: () => void }) {
  return (
    <div role="status" style={{ position: "fixed", left: 16, right: 16, bottom: 16, zIndex: 60, display: "flex", justifyContent: "center", pointerEvents: "none" }}>
      <YStack
        gap="3"
        width="100%"
        maxWidth={440}
        padding="4"
        backgroundColor={brand.calce}
        style={{ borderRadius: 20, boxShadow: "0 8px 28px rgba(43,32,19,0.18)", pointerEvents: "auto" }}
      >
        <XStack gap="3" alignItems="flex-start">
          <Icon name="share-2" size={22} color={brand.cianografiaScuro} />
          <YStack gap="1" flex={1}>
            <Text fontWeight="700" color={brand.grafite}>
              Lavoro chiuso. Hai altri clienti?
            </Text>
            <Text color={brand.grafite70}>Manda loro il tuo link: i clienti che ti scrivono da lì non contano nei lavori.</Text>
          </YStack>
        </XStack>
        <XStack gap="2" justifyContent="flex-end" flexWrap="wrap">
          <Button variant="ghost" size="3" onPress={onClose}>
            Non ora
          </Button>
          <Link href="/dashboard/il-tuo-link" style={{ textDecoration: "none" }} onClick={onClose}>
            <Button tabIndex={-1} variant="primary" size="3">
              Il tuo link
            </Button>
          </Link>
        </XStack>
      </YStack>
    </div>
  );
}
