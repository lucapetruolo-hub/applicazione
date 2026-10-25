"use client";

import { Icon, Section, Text, XStack, YStack } from "@professionisti/ui";
import { useOnlinePayments } from "@/lib/onlinePayments";

const POINTS: { title: string; text: string; online?: boolean }[] = [
  {
    title: "Preventivo strutturato",
    text: "Manodopera, materiali e tempi sempre separati: mai una cifra unica senza dettaglio.",
  },
  {
    title: "Recensioni solo da lavori conclusi",
    text: "Nessuna recensione libera: solo chi ha prenotato il lavoro sul sito può lasciarne una.",
  },
  {
    title: "Contatti privati",
    text: "Telefono e indirizzo restano nascosti finché non decidi tu di accettare un preventivo.",
  },
  {
    // Documento e selfie con Didit (docs/CHANGELOG.md §253), non
    // l'assicurazione RC (resta "dichiarata" sul profilo).
    title: "Badge Verificato",
    text: "Abbiamo controllato l'identità del professionista con documento e selfie.",
  },
  {
    title: "Pagamento online protetto",
    text: "Acconto subito e saldo a lavoro finito: i soldi restano bloccati fino alla tua conferma o per 7 giorni dalla fine del lavoro.",
    online: true,
  },
  {
    title: "Assistenza e rimborso",
    text: "Con il pagamento online, se qualcosa va storto ti assistiamo e, se la segnalazione è accolta, ti rimborsiamo.",
    online: true,
  },
];

/**
 * Perché fidarsi, in un blocco solo (docs/CHANGELOG.md §346). Prima erano tre
 * tessere con l'icona in un cerchio ("La trasparenza che non trovi in giro")
 * più una scheda "Come ti proteggiamo" con cinque punti e due chip "In
 * arrivo": lo stesso messaggio tre volte (col piè di pagina) e due garanzie
 * promesse per il futuro in mezzo a quelle vere, che facevano dubitare
 * anche delle altre. Ora un elenco con le spunte; i due punti sul pagamento
 * online compaiono solo quando Stripe è attivo (`useOnlinePayments`, §170).
 * Ogni punto riflette lo stato reale del sito: recensioni solo da lavori
 * confermati (CLAUDE.md §8), contatti privati fino all'accettazione (§5
 * punto 9), identità con documento e selfie (§253), pagamento online con
 * acconto e saldo bloccati e rimborso sulle segnalazioni accolte (§168).
 * Unico blocco scuro della pagina, per spezzare il ritmo dello scroll.
 */
export function QualitySection() {
  const onlinePayments = useOnlinePayments();
  const points = POINTS.filter((point) => !point.online || onlinePayments);
  return (
    <Section tone="dark" title="La trasparenza che non trovi in giro" maxWidth={1080}>
      <YStack width="100%" gap="$4" $gtMd={{ flexDirection: "row", flexWrap: "wrap" }} data-stagger="">
        {points.map((point) => (
          <XStack key={point.title} alignItems="flex-start" gap="$3" $gtMd={{ flexBasis: "48%", flexGrow: 0 }}>
            <YStack width={26} height={26} borderRadius={13} backgroundColor="rgba(255,255,255,0.14)" alignItems="center" justifyContent="center" flexShrink={0} marginTop={1}>
              <Icon name="check" size={15} strokeWidth={2.5} color="white" />
            </YStack>
            <Text fontSize={16} color="rgba(255,255,255,0.78)" lineHeight={24} flex={1} minWidth={0}>
              <Text fontFamily="$body" fontWeight="700" color="white">
                {point.title}.
              </Text>{" "}
              {point.text}
            </Text>
          </XStack>
        ))}
      </YStack>
    </Section>
  );
}
