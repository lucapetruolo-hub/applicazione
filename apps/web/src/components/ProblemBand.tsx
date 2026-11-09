"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
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
import { CATEGORY_WHO as WHO, joinWithOr, problemCategoryChoices } from "@/lib/problemChoices";

// Accesso e registrazione (con i loro controlli dei campi) caricati solo
// quando servono, al tocco di "Prendete in carico la richiesta": prima
// stavano nel JavaScript di /cerca per tutti
// (docs/changelog/2026-11-09-meno-javascript-comune.md).
const InlineAuthGate = dynamic(() => import("./InlineAuthGate").then((module) => module.InlineAuthGate), { ssr: false });

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
  topService = null,
  categoryCounts,
  otherTradesCount = 0,
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
  /** Prestazione proposta per il problema, offerta da chi è in cima ai risultati. */
  topService?: string | null;
  /** Quanti professionisti per ogni mestiere proposto (pulsanti in cima). */
  categoryCounts?: Partial<Record<ProfessionalCategorySlug, number>>;
  /** Professionisti di altri mestieri che offrono questo lavoro ("Potrebbero fare anche questo lavoro"). */
  otherTradesCount?: number;
}) {
  const choices = problemCategoryChoices(result, chosen);
  const quoteParams = new URLSearchParams({ descrizione: description });
  if (chosen) quoteParams.set("categoria", chosen);
  if (city) quoteParams.set("citta", city);
  const quoteHref = `/preventivo?${quoteParams.toString()}`;
  const shortText = description.length > 90 ? `${description.slice(0, 90)}…` : description;
  // Più mestieri e nessuna scelta del cliente: il titolo li nomina tutti, senza
  // dare per sicuro il primo (docs/changelog/2026-11-09-banda-mestieri-chiara.md).
  const undecided = choices.length > 1 && !questionDone;
  const title = undecided ? `Può servirti ${joinWithOr(choices.map((slug) => WHO[slug]))}` : chosen ? `Ti serve ${WHO[chosen]}` : null;
  const reason = result.reason && chosen === result.categories[0] ? result.reason : null;
  const reasonLine = [reason, topService ? `In cima chi fa «${topService}».` : null].filter(Boolean).join(" ");
  // Il primo mestiere senza nessuno vicino: si dice dove ce n'è, senza
  // cambiare l'ordine (un mestiere con più professionisti può essere meno adatto, Luca 9/11).
  const nearbyElsewhere =
    chosen && categoryCounts?.[chosen] === 0
      ? choices.filter((slug) => slug !== chosen && (categoryCounts?.[slug] ?? 0) > 0)
      : [];
  const showQuestion = Boolean(result.question && !questionDone);

  return (
    <YStack gap="3" width="100%" marginBottom="4">
      {result.safety ? <SafetyNotice safety={result.safety} /> : null}

      <YStack gap="3" backgroundColor={brand.calce} borderWidth={1} borderColor={brand.filetto} borderRadius="4" padding="4">
        <Text fontSize={13} color={brand.grafite70}>
          Per «{shortText}»
        </Text>
        {/* Più mestieri adatti: un pulsante ciascuno con quanti professionisti,
            il primo già scelto (docs/changelog/2026-11-09-mestieri-proposti-pulsanti.md).
            Prima gli altri erano solo nella riga piccola "Oppure:". */}
        {choices.length > 1 ? (
          <nav aria-label="Mestieri adatti al problema">
            <XStack gap="2" flexWrap="wrap">
              {choices.map((slug) => (
                <CategoryChoice
                  key={slug}
                  href={problemResultsHref(description, city, { mestiere: slug })}
                  label={categoryLabel(slug)}
                  count={categoryCounts?.[slug]}
                  selected={slug === chosen}
                />
              ))}
            </XStack>
          </nav>
        ) : null}
        {chosen ? (
          <YStack gap="2">
            <Text fontFamily="heading" fontWeight="800" fontSize="7" color={brand.grafite}>
              {title}
            </Text>
            {/* Niente "Di solito lo fa…": ripeteva il titolo. Resta solo un motivo vero. */}
            {reasonLine ? (
              <Text fontSize={16} color={brand.grafite70}>
                {reasonLine}
              </Text>
            ) : null}
            {nearbyElsewhere.length > 0 ? (
              <Text fontSize={16} color={brand.grafite}>
                Per ora nessuno vicino per {categoryLabel(chosen)}.{" "}
                {nearbyElsewhere.map((slug, index) => (
                  <span key={slug}>
                    {index > 0 ? " " : ""}
                    <Link href={problemResultsHref(description, city, { mestiere: slug })} scroll={false} style={{ color: brand.cianografiaScuro, fontWeight: 600 }}>
                      {categoryLabel(slug)}
                    </Link>
                    : {categoryCounts?.[slug] === 1 ? "1 vicino" : `${categoryCounts?.[slug]} vicini`}.
                  </span>
                ))}
              </Text>
            ) : null}
            {/* Trasparenza sull'intelligenza artificiale (AI Act art. 50, domanda 77 per
                l'avvocato; collaudo del 29/10/2026, M-11): solo quando la proposta non
                viene dal dizionario. */}
            {result.source === "ia" && chosen === result.categories[0] ? (
              <Text fontSize={13} color={brand.grafite70}>
                Proposta automatica: controlla che sia il mestiere giusto.{" "}
                <Link href="/privacy#fornitori" style={{ color: brand.cianografiaScuro }}>
                  Come funziona
                </Link>
              </Text>
            ) : null}
            {/* Non solo i mestieri proposti: anche chi, di un altro mestiere (es. un
                tuttofare), ha questo lavoro tra le prestazioni (richiesta di Luca, 9/11). */}
            {otherTradesCount > 0 ? (
              <Text fontSize={16} color={brand.grafite}>
                <a href="#anche-questo-lavoro" style={{ color: brand.cianografiaScuro, fontWeight: 600 }}>
                  {otherTradesCount === 1 ? "Più sotto anche 1 professionista" : `Più sotto anche ${otherTradesCount} professionisti`}
                </a>{" "}
                di altri mestieri che offre{otherTradesCount === 1 ? "" : "no"} questo lavoro.
              </Text>
            ) : null}
          </YStack>
        ) : result.outOfService ? (
          <Text fontFamily="heading" fontWeight="800" fontSize="7" color={brand.grafite}>
            {OUT_OF_SERVICE_LABELS[result.outOfService]}
          </Text>
        ) : (
          <Text fontFamily="heading" fontWeight="800" fontSize="7" color={brand.grafite}>
            Che lavoro ti serve?
          </Text>
        )}

        {/* La domanda nello stesso riquadro, subito sotto il titolo: la
            risposta sceglie il mestiere (docs/changelog/2026-11-09-banda-mestieri-chiara.md). */}
        {showQuestion && result.question ? (
          <YStack gap="2" borderTopWidth={1} borderColor={brand.filetto} paddingTop="3">
            <YStack gap="1">
              <Text fontWeight="700" fontSize={16} color={brand.grafite}>
                {result.question.text}
              </Text>
              <Text fontSize={16} color={brand.grafite70}>
                Rispondi e ti mostriamo chi serve.
              </Text>
            </YStack>
            <XStack gap="2" flexWrap="wrap">
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

        {!chosen && !result.outOfService ? (
          <YStack gap="2">
            <Text fontSize={16} color={brand.grafite70}>
              Non siamo sicuri di aver capito. Scegli tu il mestiere:
            </Text>
            <XStack gap="2" flexWrap="wrap">
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

      {/* Dopo la domanda: prima si sceglie la persona giusta, poi si chiede il preventivo. */}
      {chosen && chosenPros.length > 0 ? (
        <XStack gap="3" alignItems="center" flexWrap="wrap" justifyContent="space-between">
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
        <YStack gap="2">
          <XStack gap="3" alignItems="center" flexWrap="wrap" justifyContent="space-between">
            <Text fontSize={16} color={brand.grafite}>
              {/* Il numero della ricerca, non quello della lista: spostando la
                  mappa la lista cambia, la richiesta no
                  (docs/changelog/2026-11-04-esempi-cercano-subito.md). */}
              {count === 0
                ? "Per ora nessuno vicino: invia lo stesso la richiesta, ti avvisiamo appena c'è qualcuno."
                : `${count === 1 ? "1 professionista" : `${count} professionisti`} ${city ? `a ${city}` : "trovati"}. La richiesta arriva a tutti quelli che lavorano nella tua zona.`}
            </Text>
            <Link href={quoteHref} style={{ textDecoration: "none" }}>
              <Button tabIndex={-1} variant="primary">{count > 1 ? "Chiedi preventivo a tutti" : "Chiedi un preventivo"}</Button>
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

/** Pulsante di un mestiere proposto: pieno quando è quello dei risultati. */
function CategoryChoice({ href, label, count, selected }: { href: string; label: string; count?: number; selected: boolean }) {
  const countText = count === undefined ? "" : count === 1 ? "1 professionista" : `${count} professionisti`;
  return (
    <Link
      href={href}
      style={{ textDecoration: "none" }}
      scroll={false}
      aria-current={selected ? "true" : undefined}
      aria-label={countText ? `${label}, ${countText}` : label}
    >
      <XStack
        gap="2"
        alignItems="center"
        paddingHorizontal="4"
        paddingVertical="2"
        minHeight={44}
        borderRadius={999}
        borderWidth={1}
        borderColor={selected ? brand.cianografiaPieno : brand.cianografia}
        backgroundColor={selected ? brand.cianografiaPieno : `${brand.calce} hover:${brand.cianografiaVelo}`}
      >
        <Text color={selected ? "white" : brand.cianografiaScuro} fontWeight="700" fontSize={16}>
          {label}
        </Text>
        {count !== undefined ? (
          <Text color={selected ? "white" : brand.grafite70} fontSize={14} aria-hidden>
            {count}
          </Text>
        ) : null}
      </XStack>
    </Link>
  );
}

function ChoiceLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} style={{ textDecoration: "none" }} scroll={false}>
      <XStack
        paddingHorizontal="3"
        paddingVertical="2"
        borderRadius={999}
        borderWidth={1}
        borderColor={brand.cianografia}
        backgroundColor={`${brand.cianografiaVelo} hover:${brand.calce}`}
      >
        <Text color={brand.cianografiaScuro} fontWeight="600" fontSize={16}>
          {label}
        </Text>
      </XStack>
    </Link>
  );
}

export function SafetyNotice({ safety }: { safety: NonNullable<ProblemMatchResult["safety"]> }) {
  const text = PROBLEM_SAFETY_TEXTS[safety];
  return (
    <YStack
      gap="2"
      backgroundColor={brand.urgenzaVelo}
      borderWidth={1}
      borderColor={brand.urgenza}
      borderRadius="4"
      padding="4"
      role="note"
      aria-label="Prima di tutto la sicurezza"
    >
      <XStack gap="2" alignItems="center">
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
      <YStack gap="2" backgroundColor={brand.calce} borderWidth={1} borderColor={brand.filetto} borderRadius="4" padding="4">
        <Text fontSize={16} color={brand.grafite} role="status">
          {state === "sent"
            ? "Fatto: ce ne occupiamo noi. Ti scriviamo all'email del tuo account appena troviamo chi può farlo, e scegli tu a chi chiedere il preventivo."
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
    <YStack gap="3" backgroundColor={brand.calce} borderWidth={1} borderColor={brand.filetto} borderRadius="4" padding="4">
      <YStack gap="1">
        <Text fontFamily="heading" fontWeight="800" fontSize="6" color={brand.grafite}>
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
      <XStack gap="2" flexWrap="wrap">
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
