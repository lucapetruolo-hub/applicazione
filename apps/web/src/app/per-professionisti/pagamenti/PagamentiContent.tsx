"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Icon, Text, XStack, YStack, brand } from "@professionisti/ui";
import { useOnlinePayments } from "@/lib/onlinePayments";

/**
 * "Scopri di più" sui pagamenti da /per-professionisti (docs/CHANGELOG.md
 * §174, richiesta dell'utente): spiega al professionista come viene pagato.
 * Stesse regole dei Termini (punto 5) e di /dashboard/fiscale (§168):
 * acconto 20% del massimo, saldo a lavoro chiuso, custodia fino alla
 * conferma o 7 giorni, accredito meno costo Stripe e commissione del 5%;
 * pagamento diretto senza commissione. Finché Stripe non è attivo la pagina
 * dice "in arrivo" invece di promettere un pagamento che non c'è.
 */

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <YStack gap="$2">
      <Text tag="h2" fontFamily="$heading" fontWeight="700" fontSize="$6" color={brand.grafite}>
        {title}
      </Text>
      {children}
    </YStack>
  );
}

function P({ children }: { children: ReactNode }) {
  return (
    <Text fontSize="$3" color={brand.grafite70} lineHeight={24}>
      {children}
    </Text>
  );
}

function Point({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <YStack gap="$1" paddingLeft="$3" borderLeftWidth={3} borderLeftColor={brand.filetto}>
      <Text fontWeight="700" color={brand.grafite}>
        {n}. {title}
      </Text>
      <P>{children}</P>
    </YStack>
  );
}

export function PagamentiContent() {
  const onlinePayments = useOnlinePayments();
  return (
    <YStack width="100%" alignItems="center" backgroundColor="transparent" paddingVertical="$9" paddingHorizontal="$4">
      <YStack width="100%" maxWidth={720} gap="$6">
        <YStack gap="$3">
          <Text tag="h1" fontFamily="$heading" fontWeight="800" fontSize="$9" color={brand.grafite}>
            Come vieni pagato
          </Text>
          <P>
            Quando accetta il tuo preventivo, il cliente sceglie come pagarti: online con carta, tramite la piattaforma, oppure
            direttamente a te, come vi accordate.
          </P>
          {!onlinePayments ? (
            <XStack gap="$3" padding="$4" borderRadius="$4" backgroundColor={brand.cianografiaVelo} alignItems="flex-start">
              <YStack flexShrink={0}>
                <Icon name="credit-card" size={20} color={brand.cianografiaScuro} strokeWidth={1.75} />
              </YStack>
              <Text fontSize="$3" color={brand.grafite} flex={1} lineHeight={24}>
                Il pagamento online è in arrivo: per ora i clienti ti pagano direttamente. Qui sotto trovi come funzionerà.
              </Text>
            </XStack>
          ) : null}
        </YStack>

        <Block title="Pagamento online">
          <Point n={1} title="Acconto">
            Accettando il preventivo il cliente paga con carta tramite Stripe un acconto del 20% dell&apos;importo massimo del preventivo.
          </Point>
          <Point n={2} title="Saldo">
            Quando chiudi il lavoro indichi l&apos;importo finale e il cliente paga la differenza. Se l&apos;acconto supera l&apos;importo
            finale, la parte in più torna al cliente.
          </Point>
          <Point n={3} title="Accredito">
            Teniamo noi i soldi in custodia e te li accreditiamo sul tuo conto Stripe quando il cliente conferma che il lavoro è finito,
            oppure 7 giorni dopo la chiusura se non conferma e non segnala problemi. Con una segnalazione aperta restano bloccati finché
            non si chiude.
          </Point>
          <Point n={4} title="Costi">
            Dall&apos;importo togliamo il costo del servizio di pagamento Stripe e una commissione del 5%. Il cliente non paga costi in
            più.
          </Point>
          <P>
            Per ricevere gli accrediti attivi i pagamenti in Dati fiscali e pagamenti, nella tua area. Finché non lo fai, i soldi restano
            in custodia.
          </P>
        </Block>

        <Block title="Pagamento diretto">
          <P>
            Il cliente ti paga come vi accordate, fuori dalla piattaforma. Nessuna commissione. In questo caso non custodiamo i soldi e
            non decidiamo sulle contestazioni: se nasce un problema vi mettiamo in contatto per trovare una soluzione. Il cliente può
            comunque lasciarti una recensione.
          </P>
        </Block>

        <Text fontSize="$2" color={brand.grafite70}>
          Le regole complete sono nei{" "}
          <Link href="/termini" style={{ color: brand.cianografiaScuro, fontWeight: 700 }}>
            Termini di servizio
          </Link>
          , al punto 5.
        </Text>

        <Link href="/per-professionisti" style={{ color: brand.cianografiaScuro, fontWeight: 700, textDecoration: "none" }}>
          ← Torna alla pagina per i professionisti
        </Link>
      </YStack>
    </YStack>
  );
}
