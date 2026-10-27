"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { formatEurCents, ONLINE_APP_FEE_PERCENT, onlineFeeExample } from "@professionisti/shared";
import { Icon, Text, XStack, YStack, brand } from "@professionisti/ui";
import { useOnlinePayments } from "@/lib/onlinePayments";

const EXAMPLE = onlineFeeExample();

/**
 * "Scopri di più" sui pagamenti da /per-professionisti (docs/CHANGELOG.md
 * §174, richiesta dell'utente): spiega al professionista come viene pagato.
 * Stesse regole dei Termini (punto 5) e di /dashboard/fiscale (§168):
 * acconto 20% del massimo, saldo a lavoro chiuso, soldi bloccati fino alla
 * conferma o 7 giorni, accredito meno la trattenuta unica del 7% + IVA, con
 * commissioni Stripe comprese (§372), con un esempio in euro; pagamento diretto
 * senza commissione. Finché Stripe non è attivo la pagina
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
    <Text fontSize={16} color={brand.grafite70} lineHeight={24}>
      {children}
    </Text>
  );
}

function Point({ n, title, children, list }: { n: number; title: string; children: ReactNode; list?: string[] }) {
  return (
    <YStack gap="$1" paddingLeft="$3" borderLeftWidth={3} borderLeftColor={brand.filetto}>
      <Text fontWeight="700" color={brand.grafite}>
        {n}. {title}
      </Text>
      <P>{children}</P>
      {list ? (
        <YStack tag="ul" margin={0} padding={0} gap="$1">
          {list.map((item) => (
            <XStack key={item} tag="li" gap="$2" alignItems="flex-start">
              <YStack paddingTop={3} flexShrink={0}>
                <Icon name="check" size={16} color={brand.cianografiaScuro} strokeWidth={2} />
              </YStack>
              <Text fontSize={16} color={brand.grafite70} lineHeight={24} flex={1}>
                {item}
              </Text>
            </XStack>
          ))}
        </YStack>
      ) : null}
    </YStack>
  );
}

/** Le commissioni Stripe una per una, già dentro la trattenuta (richiesta di Luca, docs/CHANGELOG.md §372). */
const STRIPE_FEES = ["Commissione Stripe per il pagamento: la paghiamo noi", "Commissione Stripe per i bonifici verso la tua banca: la paghiamo noi"];

const SUMMARY = [
  "Nel preventivo scegli tu i modi: online con carta, direttamente a te, o tutti e due.",
  "Online il cliente paga un acconto quando accetta e il saldo a lavoro chiuso, sul tuo conto Stripe.",
  `Online tratteniamo il ${ONLINE_APP_FEE_PERCENT}% + IVA, commissioni Stripe comprese; il pagamento diretto non ha commissioni.`,
];

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
              <Text fontSize={16} color={brand.grafite} flex={1} lineHeight={24}>
                Il pagamento online è in arrivo: per ora i clienti ti pagano direttamente. Qui sotto trovi come funzionerà.
              </Text>
            </XStack>
          ) : null}
        </YStack>

        {/* Tre righe in cima e i dettagli sotto (docs/CHANGELOG.md §349): la
            regola dell'utente è il minimo indispensabile prima. */}
        <YStack tag="ul" margin={0} padding="$4" gap="$2" borderRadius={20} backgroundColor={brand.calce} borderWidth={1} borderColor={brand.filetto}>
          {SUMMARY.map((line) => (
            <XStack key={line} tag="li" gap="$2" alignItems="flex-start">
              <YStack paddingTop={3} flexShrink={0}>
                <Icon name="check" size={16} color={brand.cianografiaScuro} strokeWidth={2} />
              </YStack>
              <Text fontSize={16} color={brand.grafite} lineHeight={24} flex={1}>
                {line}
              </Text>
            </XStack>
          ))}
        </YStack>

        <Block title="Pagamento online">
          <Point n={1} title="Acconto">
            Nel preventivo scegli tu come farti pagare, anche più modi insieme: tutto diretto, acconto online e saldo online, oppure
            acconto online e saldo diretto. La percentuale dell&apos;acconto la decidi tu (da 1 a 100% dell&apos;importo massimo del
            preventivo, 20% se non la cambi). Accettando il preventivo il cliente sceglie tra i modi che hai offerto e paga l&apos;acconto
            con carta tramite Stripe.
          </Point>
          <Point n={2} title="Saldo">
            Quando chiudi il lavoro indichi l&apos;importo finale e il cliente paga la differenza, online o direttamente a te secondo il
            modo scelto. Se l&apos;acconto supera l&apos;importo finale, la parte in più torna al cliente.
          </Point>
          <Point n={3} title="Soldi bloccati, poi il bonifico">
            Quello che il cliente paga online arriva subito sul tuo conto Stripe, ma resta bloccato: non lo teniamo noi. Lo sblocchiamo
            quando il cliente conferma che il lavoro è finito, oppure 7 giorni dopo la chiusura se non conferma e non segnala problemi, e
            parte il bonifico verso la tua banca. Con una segnalazione aperta resta bloccato finché non si chiude.
          </Point>
          <Point n={4} title="Costi" list={STRIPE_FEES}>
            Da quanto il cliente paga online tratteniamo il {ONLINE_APP_FEE_PERCENT}% più l&apos;IVA, tutto compreso. Su un lavoro da{" "}
            {formatEurCents(EXAMPLE.amountEurCents)} tratteniamo{" "}
            {formatEurCents(EXAMPLE.feeEurCents)} ({formatEurCents(EXAMPLE.taxableEurCents)} + {formatEurCents(EXAMPLE.vatEurCents)} di IVA) e
            ti arrivano {formatEurCents(EXAMPLE.netEurCents)}. Ogni mese ti mandiamo la fattura delle trattenute. Su quanto ti paga
            direttamente non c&apos;è commissione. Il cliente non paga costi in più.
          </Point>
          <P>
            Per offrire l&apos;acconto online attiva i pagamenti in Dati fiscali e pagamenti, nella tua area: Stripe ti chiede i dati e
            il conto bancario su cui ricevere i bonifici.
          </P>
        </Block>

        <Block title="Pagamento diretto">
          <P>
            Vieni pagato direttamente dal cliente, senza commissioni.
          </P>
        </Block>

        <Text fontSize={13} color={brand.grafite70}>
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
