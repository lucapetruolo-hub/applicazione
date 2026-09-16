"use client";

import { useRouter } from "next/navigation";
import { Button, Icon, Section, Text, XStack, YStack, brand } from "@professionisti/ui";
import type { ProfessionalEntityTypeValue } from "@professionisti/shared";
import { useAuth } from "@/lib/AuthContext";

const CHOICES: {
  value: ProfessionalEntityTypeValue;
  icon: "user-round" | "briefcase" | "building-2";
  label: string;
  description: string;
}[] = [
  {
    value: "PRIVATE_INDIVIDUAL",
    icon: "user-round",
    label: "Privato",
    description: "Persona fisica, senza Partita IVA.",
  },
  {
    value: "SOLE_PROPRIETOR",
    icon: "briefcase",
    label: "Professionista",
    description: "Persona fisica con Partita IVA (libero professionista, ditta individuale).",
  },
  {
    value: "BUSINESS",
    icon: "building-2",
    label: "Azienda",
    description: "Impresa o società con personalità giuridica propria (es. SRL, SPA).",
  },
];

/**
 * Schermata mostrata subito dopo la registrazione di un nuovo account
 * professionista — richiesta esplicita dell'utente: "fagli aprire subito
 * la schermata dove chiede come vuole fornire i servizi... e adattare i
 * dati da chiedere nella pagina successiva in base alla scelta". La scelta
 * qui NON viene mai salvata direttamente da questa pagina — solo passata
 * come query param a /dashboard/fiscale (CLAUDE.md §88), che la
 * pre-seleziona: `ProfessionalFiscalProfile` è agganciato 1:1 a
 * `ProfessionalProfile`, che non esiste ancora per un account appena
 * registrato (creato solo al primo salvataggio di /dashboard/profilo) —
 * un salvataggio qui fallirebbe sempre con 404. Il salvataggio vero
 * avviene solo al click su "Salva dati fiscali" in quella pagina, quando
 * (o se) il profilo pubblico esiste già.
 *
 * Deliberatamente SKIPPABILE ("Scegli più tardi"): coerente con il
 * principio già stabilito ovunque in questo file per i dati fiscali
 * ("il software non deve mai decidere se una persona ha bisogno di una
 * Partita IVA", CLAUDE.md §88) — questa schermata guida, non blocca.
 * Raggiunta una sola volta, subito dopo la registrazione (mai un nudge
 * ricorrente ad ogni login: `afterAuth` in /registrati la usa solo per un
 * account appena creato, `isNewUser`).
 */
export default function DashboardTipoAttivitaPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  if (!isLoading && !user) {
    router.replace("/accedi?redirect=/dashboard/tipo-attivita");
    return null;
  }
  if (!isLoading && user && !user.isProfessional) {
    router.replace("/dashboard");
    return null;
  }

  function choose(value: ProfessionalEntityTypeValue) {
    router.push(`/dashboard/fiscale?entityType=${value}`);
  }

  return (
    <Section title="Come fornirai i tuoi servizi?" maxWidth={640}>
      <YStack gap="$5">
        <Text fontSize={14} color={brand.grafite70}>
          Ci serve per sapere quali dati fiscali chiederti nella pagina successiva — nulla qui è definitivo, potrai cambiare idea in qualunque
          momento da &quot;Dati fiscali e pagamenti&quot;. Nessun dato è obbligatorio per iniziare a usare la piattaforma.
        </Text>

        <YStack gap="$3">
          {CHOICES.map((choice) => (
            <XStack
              key={choice.value}
              alignItems="center"
              gap="$3"
              padding="$4"
              backgroundColor={brand.calce}
              borderWidth={1}
              borderColor={brand.filetto}
              borderRadius="$4"
              cursor="pointer"
              onPress={() => choose(choice.value)}
              accessibilityRole="button"
            >
              <XStack width={44} height={44} borderRadius="$3" backgroundColor={brand.cianografiaVelo} alignItems="center" justifyContent="center" flexShrink={0}>
                <Icon name={choice.icon} size={20} color={brand.cianografia} strokeWidth={1.5} />
              </XStack>
              <YStack flex={1} flexBasis={0} minWidth={0} gap="$1">
                <Text fontWeight="700" color={brand.grafite}>
                  {choice.label}
                </Text>
                <Text fontSize="$2" color={brand.grafite70}>
                  {choice.description}
                </Text>
              </YStack>
              <Icon name="chevron-right" size={18} color={brand.grafite70} />
            </XStack>
          ))}
        </YStack>

        <XStack justifyContent="center">
          <Button variant="ghost" onPress={() => router.push("/dashboard/profilo")}>
            Scegli più tardi
          </Button>
        </XStack>
      </YStack>
    </Section>
  );
}
