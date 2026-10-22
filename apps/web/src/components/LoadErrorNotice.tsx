"use client";

import { useEffect, useRef, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button, Text, XStack, YStack, brand } from "@professionisti/ui";

/** Dopo quanto riprovare da solo: il server gratuito si risveglia in circa mezzo minuto. */
const AUTO_RETRY_MS = 15_000;

/**
 * Dati non caricati perché l'API non risponde (es. server che si sta
 * risvegliando): prima la ricerca sembrava "nessun professionista" e il
 * profilo "pagina non trovata" (docs/CHANGELOG.md §284). Riprova da sola
 * una volta, poi resta il pulsante "Riprova".
 */
export function LoadErrorNotice({
  title,
  onRetry,
  backHref,
  backLabel,
}: {
  title: string;
  /** Pagine client: ricarica i dati. Senza, si ricarica la pagina dal server. */
  onRetry?: () => void;
  backHref?: string;
  backLabel?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const autoRetried = useRef(false);

  function retry() {
    if (onRetry) onRetry();
    else startTransition(() => router.refresh());
  }

  useEffect(() => {
    if (autoRetried.current) return;
    autoRetried.current = true;
    const timer = setTimeout(retry, AUTO_RETRY_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <YStack role="status" gap="$3" backgroundColor={brand.calce} borderWidth={1} borderColor={brand.filetto} borderRadius="$4" padding="$4">
      <XStack alignItems="center" gap="$3">
        <span aria-hidden style={{ display: "inline-flex", flexShrink: 0, width: 48, height: 48, borderRadius: 999, alignItems: "center", justifyContent: "center", background: brand.filetto }}>
          <RefreshCw size={22} strokeWidth={1.75} color={brand.grafite70} />
        </span>
        <YStack gap="$1" flex={1} minWidth={0}>
          <Text fontFamily="$heading" fontWeight="800" fontSize="$6" color={brand.grafite}>
            {title}
          </Text>
          <Text color={brand.grafite70} fontSize="$3">
            Riprova tra qualche secondo.
          </Text>
        </YStack>
      </XStack>
      <XStack alignItems="center" gap="$4" flexWrap="wrap">
        <Button variant="primary" onPress={retry} disabled={isPending}>
          {isPending ? "Caricamento…" : "Riprova"}
        </Button>
        {backHref && backLabel ? (
          <Link href={backHref} style={{ color: brand.cianografiaScuro, fontWeight: 700, fontSize: 15, padding: "10px 0" }}>
            {backLabel}
          </Link>
        ) : null}
      </XStack>
    </YStack>
  );
}
