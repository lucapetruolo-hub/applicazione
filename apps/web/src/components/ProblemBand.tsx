"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  OUT_OF_SERVICE_LABELS,
  PROBLEM_SAFETY_TEXTS,
  PROFESSIONAL_CATEGORIES,
  type ProblemMatchResult,
  type ProfessionalCategorySlug,
} from "@professionisti/shared";
import { Button, Icon, Text, XStack, YStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import type { ChosenPro } from "./ChosenProsBar";
import { InlineAuthGate } from "./InlineAuthGate";

/**
 * Banda in cima ai risultati quando il cliente descrive il problema invece
 * di scegliere il mestiere (docs/CHANGELOG.md §392, decisioni di Luca):
 * avviso di sicurezza (solo dal dizionario), "Ti serve un…", una domanda
 * con le risposte da cliccare, "Chiedi preventivo a tutti" oppure a chi si
 * sceglie con "Scegli" (fino a 5, §393); per un lavoro che nessuna categoria
 * copre, chi lo dichiara oppure "Ce ne occupiamo noi".
 */

function categoryLabel(slug: string): string {
  return PROFESSIONAL_CATEGORIES.find((category) => category.slug === slug)?.label ?? slug;
}

/** "Ti serve …" e "Di solito lo fa …": il nome della categoria non sempre regge la frase ("un Pulizie"). */
const WHO: Record<ProfessionalCategorySlug, string> = {
  idraulico: "un idraulico",
  elettricista: "un elettricista",
  imbianchino: "un imbianchino",
  pulizie: "un'impresa di pulizie",
  giardiniere: "un giardiniere",
  traslochi: "chi fa traslochi",
  fabbro: "un fabbro",
  climatizzazione: "un tecnico di caldaie e climatizzatori",
  muratore: "un muratore",
  falegname: "un falegname",
  tuttofare: "un tuttofare",
  dogsitter: "un dogsitter",
  babysitter: "una babysitter",
};

export function problemResultsHref(description: string, city: string | undefined, extra: Record<string, string> = {}): string {
  const params = new URLSearchParams({ problema: description });
  if (city) params.set("citta", city);
  for (const [key, value] of Object.entries(extra)) params.set(key, value);
  return `/cerca?${params.toString()}`;
}

export function ProblemBand({
  description,
  city,
  result,
  chosen,
  count,
  questionDone,
  chosenPros = [],
  maxChosen,
  onClearChosen,
}: {
  description: string;
  city?: string;
  result: ProblemMatchResult;
  /** Il mestiere dei risultati: il primo proposto o quello scelto dal cliente. */
  chosen: ProfessionalCategorySlug | null;
  count: number;
  /** Il cliente ha già risposto alla domanda o ha scelto il mestiere. */
  questionDone: boolean;
  /** Professionisti scelti con "Scegli" (§393): il pulsante per inviare sta nella barra in basso. */
  chosenPros?: ChosenPro[];
  /** Assente quando nei risultati non si può scegliere (meno di 2 schede). */
  maxChosen?: number;
  onClearChosen?: () => void;
}) {
  const others = result.categories.filter((slug) => slug !== chosen);
  const quoteParams = new URLSearchParams({ descrizione: description });
  if (chosen) quoteParams.set("categoria", chosen);
  if (city) quoteParams.set("citta", city);
  const quoteHref = `/preventivo?${quoteParams.toString()}`;
  const shortText = description.length > 90 ? `${description.slice(0, 90)}…` : description;

  return (
    <YStack gap="$3" width="100%" marginBottom="$4">
      {result.safety ? <SafetyNotice safety={result.safety} /> : null}

      <YStack gap="$3" backgroundColor={brand.calce} borderWidth={1} borderColor={brand.filetto} borderRadius="$4" padding="$4">
        <Text fontSize={13} color={brand.grafite70}>
          Per «{shortText}»
        </Text>
        {chosen ? (
          <YStack gap="$2">
            <Text fontFamily="$heading" fontWeight="800" fontSize="$7" color={brand.grafite}>
              Ti serve {WHO[chosen]}
            </Text>
            <Text fontSize={16} color={brand.grafite70}>
              {result.reason && chosen === result.categories[0] ? result.reason : `Di solito lo fa ${WHO[chosen]}.`}
            </Text>
          </YStack>
        ) : result.outOfService ? (
          <Text fontFamily="$heading" fontWeight="800" fontSize="$7" color={brand.grafite}>
            {OUT_OF_SERVICE_LABELS[result.outOfService]}
          </Text>
        ) : (
          <Text fontFamily="$heading" fontWeight="800" fontSize="$7" color={brand.grafite}>
            Che lavoro ti serve?
          </Text>
        )}

        {chosen && others.length > 0 ? (
          <XStack gap="$2" flexWrap="wrap" alignItems="center">
            <Text fontSize={16} color={brand.grafite70}>
              Oppure:
            </Text>
            {others.map((slug) => (
              <ChoiceLink key={slug} href={problemResultsHref(description, city, { mestiere: slug })} label={categoryLabel(slug)} />
            ))}
          </XStack>
        ) : null}

        {!chosen && !result.outOfService ? (
          <YStack gap="$2">
            <Text fontSize={16} color={brand.grafite70}>
              Non siamo sicuri di aver capito. Scegli tu il mestiere:
            </Text>
            <XStack gap="$2" flexWrap="wrap">
              {PROFESSIONAL_CATEGORIES.map((category) => (
                <ChoiceLink
                  key={category.slug}
                  href={problemResultsHref(description, city, {
                    mestiere: category.slug,
                  })}
                  label={category.label}
                />
              ))}
            </XStack>
          </YStack>
        ) : null}
      </YStack>

      {result.question && !questionDone ? (
        <YStack gap="$3" backgroundColor={brand.calce} borderWidth={1} borderColor={brand.filetto} borderRadius="$4" padding="$4">
          <YStack gap="$1">
            <Text fontWeight="700" fontSize={16} color={brand.grafite}>
              Una domanda per mandarti la persona giusta
            </Text>
            <Text fontSize={16} color={brand.grafite70}>
              {result.question.text}
            </Text>
          </YStack>
          <XStack gap="$2" flexWrap="wrap">
            {result.question.answers.map((answer) => (
              <ChoiceLink
                key={answer.label}
                href={problemResultsHref(description, city, {
                  mestiere: answer.category,
                })}
                label={answer.label}
              />
            ))}
            <ChoiceLink href={problemResultsHref(description, city, { domanda: "no" })} label="Non lo so" />
          </XStack>
        </YStack>
      ) : null}

      {/* Dopo la domanda: prima si sceglie la persona giusta, poi si chiede il preventivo. */}
      {chosen && chosenPros.length > 0 ? (
        <XStack gap="$3" alignItems="center" flexWrap="wrap" justifyContent="space-between">
          <Text fontSize={16} color={brand.grafite} role="status">
            {chosenPros.length === 1
              ? `Hai scelto ${chosenPros[0]!.businessName}: puoi aggiungerne altri, fino a ${maxChosen}.`
              : `Hai scelto ${chosenPros.length} professionisti su ${maxChosen}: la richiesta arriva solo a loro.`}
          </Text>
          <Button variant="secondary" onPress={onClearChosen}>
            Annulla la scelta
          </Button>
        </XStack>
      ) : chosen ? (
        <YStack gap="$2">
          <XStack gap="$3" alignItems="center" flexWrap="wrap" justifyContent="space-between">
            <Text fontSize={16} color={brand.grafite}>
              {count === 0
                ? "Per ora nessuno vicino: invia lo stesso la richiesta, ti avvisiamo appena c'è qualcuno."
                : count === 1
                  ? "1 professionista qui sotto."
                  : `${count} professionisti qui sotto.`}
            </Text>
            <Link href={quoteHref} style={{ textDecoration: "none" }}>
              <Button variant="primary">{count > 1 ? "Chiedi preventivo a tutti" : "Chiedi un preventivo"}</Button>
            </Link>
          </XStack>
          {maxChosen ? (
            <Text fontSize={16} color={brand.grafite70}>
              Oppure scegli tu fino a {maxChosen} professionisti con «Scegli» sulle schede.
            </Text>
          ) : null}
        </YStack>
      ) : null}

      {result.outOfService ? (
        count > 0 ? (
          <Text fontSize={16} color={brand.grafite}>
            Nessuna delle nostre categorie fa questo lavoro, ma questi professionisti dichiarano di farlo.
          </Text>
        ) : (
          <TakeoverCard description={description} city={city} outOfService={result.outOfService} />
        )
      ) : null}
    </YStack>
  );
}

function ChoiceLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} style={{ textDecoration: "none" }} scroll={false}>
      <XStack
        paddingHorizontal="$3"
        paddingVertical="$2"
        borderRadius={999}
        borderWidth={1}
        borderColor={brand.cianografia}
        backgroundColor={brand.cianografiaVelo}
        hoverStyle={{ backgroundColor: brand.calce }}
      >
        <Text color={brand.cianografiaScuro} fontWeight="600" fontSize={16}>
          {label}
        </Text>
      </XStack>
    </Link>
  );
}

function SafetyNotice({ safety }: { safety: NonNullable<ProblemMatchResult["safety"]> }) {
  const text = PROBLEM_SAFETY_TEXTS[safety];
  return (
    <YStack
      gap="$2"
      backgroundColor={brand.urgenzaVelo}
      borderWidth={1}
      borderColor={brand.urgenza}
      borderRadius="$4"
      padding="$4"
      role="note"
      aria-label="Prima di tutto la sicurezza"
    >
      <XStack gap="$2" alignItems="center">
        <Icon name="triangle-alert" size={18} color={brand.urgenza} />
        <Text fontWeight="800" fontSize={18} color={brand.grafite}>
          Prima di tutto la sicurezza
        </Text>
      </XStack>
      <ul
        style={{
          margin: 0,
          paddingLeft: 20,
          display: "flex",
          flexDirection: "column",
          gap: 4,
        }}
      >
        {text.steps.map((step) => (
          <li key={step}>
            <Text fontSize={16} color={brand.grafite}>
              {step}
            </Text>
          </li>
        ))}
      </ul>
      <Text fontSize={16} color={brand.grafite70}>
        {text.after}
      </Text>
    </YStack>
  );
}

/** "Ce ne occupiamo noi": nessuna scadenza, poi la ricerca normale (decisione di Luca). */
function TakeoverCard({ description, city, outOfService }: { description: string; city?: string; outOfService: string }) {
  const { token } = useAuth();
  const [state, setState] = useState<"idle" | "auth" | "sending" | "sent" | "declined" | "error">("idle");
  const [pendingSend, setPendingSend] = useState(false);

  const send = useCallback(
    async (authToken: string) => {
      setState("sending");
      try {
        await apiClient.createProblemTakeover(authToken, {
          description,
          city,
          outOfService,
        });
        setState("sent");
      } catch {
        setState("error");
      }
    },
    [description, city, outOfService],
  );

  // Dopo l'accesso dentro la finestra si invia da qui, con il token nuovo del contesto.
  useEffect(() => {
    if (!pendingSend || !token) return;
    // Avvia l'invio vero (chiamata all'API): solo un effetto può farlo.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPendingSend(false);
    void send(token);
  }, [pendingSend, token, send]);

  const searchAll = city ? `/cerca?citta=${encodeURIComponent(city)}` : "/cerca";

  if (state === "sent" || state === "declined") {
    return (
      <YStack gap="$2" backgroundColor={brand.calce} borderWidth={1} borderColor={brand.filetto} borderRadius="$4" padding="$4">
        <Text fontSize={16} color={brand.grafite} role="status">
          {state === "sent"
            ? "Fatto: ce ne occupiamo noi. Ti scriviamo all'email del tuo account appena troviamo chi può farlo."
            : "Va bene. Se ti serve altro, cerca tra tutti i professionisti."}
        </Text>
        <Link href={searchAll} style={{ alignSelf: "flex-start" }}>
          <Text color={brand.cianografiaScuro} fontWeight="600" fontSize={16}>
            Vedi tutti i professionisti
          </Text>
        </Link>
      </YStack>
    );
  }

  return (
    <YStack gap="$3" backgroundColor={brand.calce} borderWidth={1} borderColor={brand.filetto} borderRadius="$4" padding="$4">
      <YStack gap="$1">
        <Text fontFamily="$heading" fontWeight="800" fontSize="$6" color={brand.grafite}>
          Ce ne occupiamo noi
        </Text>
        <Text fontSize={16} color={brand.grafite70}>
          Per ora nessun professionista del sito fa questo lavoro qui. Se vuoi, cerchiamo noi qualcuno e ti scriviamo.
        </Text>
      </YStack>
      {state === "error" ? (
        <Text fontSize={16} color={brand.urgenza} role="alert">
          Non siamo riusciti a inviare la richiesta. Riprova.
        </Text>
      ) : null}
      <XStack gap="$2" flexWrap="wrap">
        <Button variant="primary" disabled={state === "sending"} onPress={() => (token ? void send(token) : setState("auth"))}>
          {state === "sending" ? "Invio in corso..." : "Prendete in carico la richiesta"}
        </Button>
        <Button variant="secondary" onPress={() => setState("declined")}>
          No grazie, non serve
        </Button>
      </XStack>
      {state === "auth" ? (
        <InlineAuthGate
          onClose={() => setState("idle")}
          onAuthenticated={() => {
            setState("idle");
            setPendingSend(true);
          }}
        />
      ) : null}
    </YStack>
  );
}
