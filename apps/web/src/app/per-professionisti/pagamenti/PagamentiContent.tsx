"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import {
  formatEurCents,
  ONLINE_APP_FEE_PERCENT,
  ONLINE_HELD_LIMIT_EUR_CENTS,
  ONLINE_LIMIT_EUR_CENTS,
  ONLINE_LIMIT_FREE_JOBS,
  ONLINE_LIMIT_FREE_MONTHS,
  onlineFeeExample,
} from "@professionisti/shared";
import { Button, Icon, Text, XStack, YStack, brand } from "@professionisti/ui";
import { useAuth } from "@/lib/AuthContext";
import { useOnlinePayments } from "@/lib/onlinePayments";

const EXAMPLE = onlineFeeExample();

/**
 * "Scopri di più" sui pagamenti da /per-professionisti (docs/CHANGELOG.md
 * §174, richiesta dell'utente): spiega al professionista come viene pagato.
 * Stesse regole dei Termini (punto 5) e di /dashboard/fiscale (§168):
 * acconto 20% del massimo, saldo a lavoro chiuso, soldi bloccati fino alla
 * conferma o 7 giorni, accredito meno la trattenuta unica del 7% + IVA, con
 * commissioni Stripe comprese (§378), con un esempio in euro; pagamento diretto
 * senza commissione. Finché Stripe non è attivo la pagina
 * dice "in arrivo" invece di promettere un pagamento che non c'è.
 */

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    // Più spazio tra i punti: prima i blocchi di testo si toccavano.
    <YStack gap="4">
      <Text render="h2" fontFamily="heading" fontWeight="700" fontSize="6" color={brand.inchiostro}>
        {title}
      </Text>
      {children}
    </YStack>
  );
}

function P({ children }: { children: ReactNode }) {
  return (
    <Text fontSize={16} color={brand.grafite70} lineHeight="24px">
      {children}
    </Text>
  );
}

function Point({ n, title, children, list, id }: { n: number; title: string; children: ReactNode; list?: string[]; id?: string }) {
  return (
    <YStack id={id} gap="1" paddingLeft="3" borderLeftWidth={3} borderLeftColor={brand.filetto} style={id ? { scrollMarginTop: 96 } : undefined}>
      <Text fontWeight="700" color={brand.grafite}>
        {n}. {title}
      </Text>
      <P>{children}</P>
      {list ? (
        <YStack render="ul" margin={0} padding={0} gap="1">
          {list.map((item) => (
            <XStack key={item} render="li" gap="2" alignItems="flex-start">
              <YStack paddingTop={3} flexShrink={0}>
                <Icon name="check" size={16} color={brand.cianografiaScuro} strokeWidth={2} />
              </YStack>
              <Text fontSize={16} color={brand.grafite70} lineHeight="24px" flex={1}>
                {item}
              </Text>
            </XStack>
          ))}
        </YStack>
      ) : null}
    </YStack>
  );
}

/** Le commissioni Stripe una per una, già dentro la trattenuta (richiesta di Luca, docs/CHANGELOG.md §378). */
const STRIPE_FEES = ["Commissione Stripe per il pagamento: la paghiamo noi", "Commissione Stripe per i bonifici verso la tua banca: la paghiamo noi"];

// La prima riga di prima ("scegli tu i modi") è ora nell'introduzione, che
// diceva il contrario: "il cliente sceglie come pagarti"
// (docs/changelog/2026-11-12-pagina-per-professionisti.md).
const SUMMARY = [
  "Online il cliente paga un acconto quando accetta e il saldo a lavoro chiuso, sul tuo conto Stripe.",
  `Online tratteniamo il ${ONLINE_APP_FEE_PERCENT}% + IVA, commissioni Stripe comprese.`,
  "Il pagamento diretto non ha commissioni né limiti.",
];

/** Il conto di un lavoro d'esempio in tre righe, al posto dei numeri dentro il testo. */
function FeeExample() {
  const rows: { label: string; value: string; strong?: boolean }[] = [
    { label: "Il cliente paga online", value: formatEurCents(EXAMPLE.amountEurCents) },
    { label: `Trattenuta ${ONLINE_APP_FEE_PERCENT}% + IVA`, value: `− ${formatEurCents(EXAMPLE.feeEurCents)}` },
    { label: "Ti arrivano", value: formatEurCents(EXAMPLE.netEurCents), strong: true },
  ];
  return (
    <YStack render="dl" margin={0} marginTop="2" padding="4" gap="2" borderRadius={20} backgroundColor={brand.calce} borderWidth={1} borderColor={brand.filetto}>
      {rows.map((row) => (
        <XStack key={row.label} justifyContent="space-between" alignItems="baseline" gap="3" paddingTop={row.strong ? "2" : 0} borderTopWidth={row.strong ? 1 : 0} borderColor={brand.filetto}>
          <Text render="dt" fontSize={16} color={row.strong ? brand.grafite : brand.grafite70} fontWeight={row.strong ? "700" : "400"}>
            {row.label}
          </Text>
          <Text render="dd" margin={0} fontSize={16} color={row.strong ? brand.cianografiaScuro : brand.grafite} fontWeight="700" style={{ fontVariantNumeric: "tabular-nums" }}>
            {row.value}
          </Text>
        </XStack>
      ))}
    </YStack>
  );
}

/**
 * Due domande che un professionista fa prima di attivare i pagamenti online
 * (richiesta di Luca, docs/changelog/2026-11-12-pagina-per-professionisti.md),
 * con le stesse regole dei Termini (punti 5 e 6) e dei tempi mostrati nella
 * scheda del lavoro (`JobPaymentStatus`).
 */
const PAYMENT_FAQ: { question: string; answer: string }[] = [
  {
    question: "Quando arriva il bonifico?",
    answer:
      "Quando il cliente conferma che il lavoro è finito, oppure 7 giorni dopo la chiusura se non segnala problemi. Da lì il bonifico arriva sulla tua banca in 1-4 giorni lavorativi.",
  },
  {
    question: "E se il cliente contesta?",
    answer:
      "Se segnala un problema sul sito, avete 48 ore per accordarvi in chat; se non vi accordate decide il nostro team, dopo aver sentito anche te. Se invece contesta il pagamento con la sua banca, decide la banca: i soldi restano bloccati fino alla risposta e la commissione di Stripe per la contestazione è a tuo carico. Con il pagamento diretto la questione resta tra te e il cliente.",
  },
];

export function PagamentiContent() {
  const onlinePayments = useOnlinePayments();
  const { user } = useAuth();
  return (
    <YStack width="100%" alignItems="center" backgroundColor="transparent" paddingVertical="9" paddingHorizontal="4">
      <YStack width="100%" maxWidth={720} gap="6">
        <YStack gap="3">
          <Text render="h1" fontFamily="heading" fontWeight="800" fontSize="9" color={brand.inchiostro}>
            Come vieni pagato
          </Text>
          <P>
            Nel preventivo scegli tu come farti pagare: online con carta, direttamente a te, o tutti e due. Il cliente sceglie tra i
            modi che offri quando accetta.
          </P>
          {!onlinePayments ? (
            <XStack gap="3" padding="4" borderRadius="4" backgroundColor={brand.cianografiaVelo} alignItems="flex-start">
              <YStack flexShrink={0}>
                <Icon name="credit-card" size={20} color={brand.cianografiaScuro} strokeWidth={1.75} />
              </YStack>
              <Text fontSize={16} color={brand.grafite} flex={1} lineHeight="24px">
                Il pagamento online è in arrivo: per ora i clienti ti pagano direttamente. Qui sotto trovi come funzionerà.
              </Text>
            </XStack>
          ) : null}
        </YStack>

        {/* Tre righe in cima e i dettagli sotto (docs/CHANGELOG.md §349): la
            regola dell'utente è il minimo indispensabile prima. */}
        <YStack render="ul" margin={0} padding="4" gap="2" borderRadius={20} backgroundColor={brand.calce} borderWidth={1} borderColor={brand.filetto}>
          {SUMMARY.map((line) => (
            <XStack key={line} render="li" gap="2" alignItems="flex-start">
              <YStack paddingTop={3} flexShrink={0}>
                <Icon name="check" size={16} color={brand.cianografiaScuro} strokeWidth={2} />
              </YStack>
              <Text fontSize={16} color={brand.grafite} lineHeight="24px" flex={1}>
                {line}
              </Text>
            </XStack>
          ))}
        </YStack>

        <Block title="Pagamento online">
          <Point n={1} title="Acconto">
            Decidi tu quanto: da 1 a 100% dell&apos;importo massimo del preventivo (20% se non lo cambi). Il cliente lo paga con carta
            quando accetta. Il saldo può essere online o diretto.
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
            Da quanto il cliente paga online tratteniamo il {ONLINE_APP_FEE_PERCENT}% più l&apos;IVA, tutto compreso. Ogni mese ti mandiamo la
            fattura delle trattenute. Il cliente non paga costi in più.
          </Point>
          <FeeExample />
          {/* Il tetto dei professionisti nuovi, prima solo nei Termini (collaudo D-06). */}
          <Point n={5} id="limite" title="Limite per i primi lavori">
            All&apos;inizio online puoi chiedere al massimo {formatEurCents(ONLINE_LIMIT_EUR_CENTS)} a lavoro, e avere al massimo{" "}
            {formatEurCents(ONLINE_HELD_LIMIT_EUR_CENTS)} bloccati in tutto. Il limite si toglie da solo dopo {ONLINE_LIMIT_FREE_JOBS} lavori
            pagati online senza contestazioni e {ONLINE_LIMIT_FREE_MONTHS} mesi dal primo: è il tempo in cui un cliente può ancora
            contestare il pagamento con la sua banca. Il pagamento diretto non ha limiti.
          </Point>
          <P>
            Per offrire l&apos;acconto online attiva i pagamenti in Fisco e pagamenti, nella tua area: Stripe ti chiede i dati e
            il conto bancario su cui ricevere i bonifici.
          </P>
        </Block>

        <Block title="Pagamento diretto">
          <P>
            Il cliente ti paga in contanti, con bonifico o come vi accordate. Nessuna commissione e nessun limite.
          </P>
        </Block>

        <Block title="Domande frequenti">
          <YStack>
            {PAYMENT_FAQ.map((item) => (
              // "+" e "−" come nelle domande di /per-professionisti (`.pay-faq-item` in globals.css).
              <details key={item.question} className="pay-faq-item">
                <summary>{item.question}</summary>
                <Text render="p" margin={0} marginTop="2" fontSize={16} color={brand.grafite70} lineHeight="24px">
                  {item.answer}
                </Text>
              </details>
            ))}
          </YStack>
        </Block>

        <Text fontSize={13} color={brand.grafite70}>
          Le regole complete sono nei{" "}
          <Link href="/termini" style={{ color: brand.cianografiaScuro, fontWeight: 700 }}>
            Termini di servizio
          </Link>
          , al punto 5.
        </Text>

        {/* Chi ha letto fin qui può iscriversi senza tornare indietro
            (docs/changelog/2026-11-12-pagina-per-professionisti.md). */}
        <XStack gap="3" flexWrap="wrap" alignItems="center">
          <Link href={user?.isProfessional ? "/dashboard/fiscale" : "/registrati?ruolo=professionista"} style={{ textDecoration: "none" }}>
            <Button tabIndex={-1} variant="primary">
              {user?.isProfessional ? "Vai a Fisco e pagamenti" : "Iscriviti gratis"}
            </Button>
          </Link>
          <Link href="/per-professionisti" style={{ color: brand.cianografiaScuro, fontWeight: 700, textDecoration: "none", minHeight: 44, display: "inline-flex", alignItems: "center" }}>
            ← Torna alla pagina per i professionisti
          </Link>
        </XStack>
      </YStack>
    </YStack>
  );
}
