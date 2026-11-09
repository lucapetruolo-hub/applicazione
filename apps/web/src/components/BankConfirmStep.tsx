"use client";

import { useEffect, useRef, useState } from "react";
import { subscriptionTierInfo, type SubscriptionTier } from "@professionisti/shared";
import { Button, Text, YStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";

const POLL_MS = 4000;
const POLL_LIMIT_MS = 15 * 60 * 1000;

/**
 * La banca chiede di confermare il pagamento del nuovo livello (3D Secure).
 * La pagina di Stripe si apre in una scheda nuova (il tocco sul link non viene
 * bloccato dal browser) e questa resta sul sito: appena il livello risulta
 * cambiato chiama `onDone`, così chi torna qui trova già tutto aggiornato
 * (controllo prima del lancio dell'8/11/2026, gruppo 2).
 */
export function BankConfirmStep({ url, tier, token, onDone }: { url: string; tier: SubscriptionTier; token: string; onDone: () => void }) {
  const [opened, setOpened] = useState(false);
  const [gaveUp, setGaveUp] = useState(false);
  const doneRef = useRef(onDone);
  useEffect(() => {
    doneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    let active = true;
    const started = Date.now();
    const timer = window.setInterval(async () => {
      if (Date.now() - started > POLL_LIMIT_MS) {
        window.clearInterval(timer);
        if (active) setGaveUp(true);
        return;
      }
      const sub = await apiClient.getMySubscription(token).catch(() => null);
      if (active && sub?.tier === tier && sub.state === "ACTIVE") {
        window.clearInterval(timer);
        doneRef.current();
      }
    }, POLL_MS);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [token, tier]);

  const label = subscriptionTierInfo(tier).label;
  return (
    <YStack gap="2" role="status" aria-live="polite">
      <Text fontWeight="700" color={brand.grafite}>
        La tua banca chiede di confermare il pagamento
      </Text>
      <Text color={brand.grafite70}>
        {opened
          ? `Conferma nella pagina che si è aperta. Quando hai finito, torna qui: il livello ${label} si attiva da solo.`
          : `Si apre la pagina sicura di Stripe in una nuova scheda. Il livello ${label} si attiva appena confermi.`}
      </Text>
      {gaveUp ? <Text color={brand.grafite70}>Non vediamo ancora la conferma. Se hai già confermato, ricarica la pagina.</Text> : null}
      <a href={url} target="_blank" rel="noreferrer" onClick={() => setOpened(true)} style={{ textDecoration: "none", alignSelf: "flex-start" }}>
        <Button tabIndex={-1} variant="acquisto">
          {opened ? "Riapri la pagina della banca" : "Conferma il pagamento"}
        </Button>
      </a>
    </YStack>
  );
}
