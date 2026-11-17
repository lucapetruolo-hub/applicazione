"use client";

import { useState } from "react";
import Link from "next/link";
import {
  OUT_OF_SERVICE_LABELS,
  PROBLEM_SAFETY_TEXTS,
  PROFESSIONAL_CATEGORIES,
  SEARCH_RADIUS_KM,
  type ProblemMatchResult,
  type ProfessionalCategorySlug,
} from "@professionisti/shared";
import { Button, Icon, Text, XStack, YStack, brand } from "@professionisti/ui";
import { setRequestHints, type ChosenPro, type ProblemRequestHints } from "./ChosenProsBar";
import { ChosenProsStrip } from "./ChosenProsStrip";
import { ReportAiAnswer } from "./ReportAiAnswer";
import { CATEGORY_WHO as WHO, joinWithOr, problemCategoryChoices } from "@/lib/problemChoices";

/**
 * Banda in cima ai risultati quando il cliente descrive il problema invece
 * di scegliere il mestiere (docs/CHANGELOG.md §392, decisioni di Luca):
 * avviso di sicurezza (solo dal dizionario), "Ti serve un…", una domanda
 * con le risposte da cliccare, "Chiedi preventivo a tutti" oppure a chi si
 * sceglie con "Scegli" (fino a 5, §393); per un lavoro che nessuna categoria
 * copre, chi lo dichiara oppure la richiesta in attesa (docs/changelog/2026-11-17-richieste-in-attesa.md).
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
  onRemoveChosen,
  chosenUndo = null,
  topService = null,
  categoryCounts,
  otherTradesCount = 0,
  requestHints,
  photo,
  nearestOutsideKm = null,
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
  /** X sull'anteprima del singolo scelto (docs/changelog/2026-11-16-anteprima-scelti.md). */
  onRemoveChosen?: (id: string) => void;
  /** "Annulla" dopo la X o "Togli tutti". */
  chosenUndo?: { text: string; onUndo: () => void } | null;
  /** Prestazione proposta per il problema, offerta da chi è in cima ai risultati. */
  topService?: string | null;
  /** Quanti professionisti per ogni mestiere proposto (pulsanti in cima). */
  categoryCounts?: Partial<Record<ProfessionalCategorySlug, number>>;
  /** Professionisti di altri mestieri che offrono questo lavoro ("Potrebbero fare anche questo lavoro"). */
  otherTradesCount?: number;
  /** Nessuno nel raggio: a quanti km è il più vicino tra i risultati (null = qualcuno è vicino). */
  nearestOutsideKm?: number | null;
  /** Quando serve e comune presi dal testo, per precompilare la richiesta. */
  requestHints?: ProblemRequestHints;
  /** Ricerca partita da una foto: resta nei link dei mestieri, così vale ancora quello che si vede (es. un pericolo). */
  photo?: string;
}) {
  const resultsHref = (extra: Record<string, string>) => problemResultsHref(description, city, photo ? { ...extra, foto: photo } : extra);
  const choices = problemCategoryChoices(result, chosen);
  const quoteParams = new URLSearchParams({ descrizione: description });
  if (chosen) quoteParams.set("categoria", chosen);
  if (city) quoteParams.set("citta", city);
  setRequestHints(quoteParams, requestHints);
  const quoteHref = `/preventivo?${quoteParams.toString()}`;
  // Richiesta in attesa di un mestiere che nessuno fa vicino (docs/changelog/2026-11-17-richieste-in-attesa.md).
  const waitingHref = (trade: { key?: string; name?: string }) => {
    const params = new URLSearchParams(quoteParams);
    params.delete("categoria");
    if (trade.key) params.set("attesaChiave", trade.key);
    if (trade.name) params.set("attesa", trade.name);
    return `/preventivo?${params.toString()}`;
  };
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
  // Un mestiere che il sito non ha, proposto dall'IA (docs/changelog/2026-11-11-mestieri-che-mancano.md).
  const missingTrade = !chosen && !result.outOfService ? (result.missingTrade ?? null) : null;
  // L'IA ha dato il mestiere: dal testo, dalla foto o proponendone uno che il sito non ha
  // (non quando il cliente ha scelto a mano un mestiere fuori dalla proposta).
  const aiSuggested =
    Boolean(missingTrade) || (chosen !== null && result.categories.includes(chosen) && (result.source === "ia" || Boolean(photo)));

  // Tutti i mestieri da scegliere a mano: nella banda se non abbiamo capito, sotto
  // sotto la richiesta in attesa se l'IA propone un mestiere che il sito non ha.
  const chooseTrade = (
    <YStack gap="2">
      <Text fontSize={16} color={brand.grafite70}>
        {missingTrade ? "Se invece serve uno di questi mestieri, sceglilo:" : "Non siamo sicuri di aver capito. Scegli tu il mestiere:"}
      </Text>
      <XStack gap="2" flexWrap="wrap">
        {PROFESSIONAL_CATEGORIES.map((category) => (
          <ChoiceLink key={category.slug} href={resultsHref({ mestiere: category.slug })} label={category.label} />
        ))}
      </XStack>
    </YStack>
  );

  return (
    <YStack gap="3" width="100%" marginBottom="4">
      {result.safety ? (
        <SafetyNotice safety={result.safety} />
      ) : result.safetyHint ? (
        <SafetyHint safety={result.safetyHint} />
      ) : null}

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
                  href={resultsHref({ mestiere: slug })}
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
                    <Link href={resultsHref({ mestiere: slug })} scroll={false} style={{ color: brand.cianografiaScuro, fontWeight: 600 }}>
                      {categoryLabel(slug)}
                    </Link>
                    : {categoryCounts?.[slug] === 1 ? "1 vicino" : `${categoryCounts?.[slug]} vicini`}.
                  </span>
                ))}
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
        ) : missingTrade ? (
          <YStack gap="1">
            <Text fontFamily="heading" fontWeight="800" fontSize="7" color={brand.grafite}>
              {missingTrade}
            </Text>
            {/* Con chi lo dichiara la frase sotto la banda dice già tutto. */}
            {count === 0 ? (
              <Text fontSize={16} color={brand.grafite70}>
                Per ora non lo trovi sul sito.
              </Text>
            ) : null}
          </YStack>
        ) : (
          <Text fontFamily="heading" fontWeight="800" fontSize="7" color={brand.grafite}>
            Che lavoro ti serve?
          </Text>
        )}

        {/* Trasparenza sull'intelligenza artificiale (AI Act art. 50, domanda 77 per
            l'avvocato; collaudo del 29/10/2026, M-11): ogni volta che la proposta viene
            dall'IA, anche da una foto o con un mestiere che il sito non ha, mai col solo
            dizionario (richiesta di Luca del 13/11, docs/changelog/2026-11-13-pericoli-dalla-foto.md). */}
        {aiSuggested ? (
          <YStack gap="1">
            <Text fontSize={13} color={brand.grafite70}>
              Suggerimento dell'intelligenza artificiale: può sbagliare, controlla che sia il mestiere giusto.{" "}
              <Link href="/privacy#fornitori" style={{ color: brand.cianografiaScuro }}>
                Come funziona
              </Link>
            </Text>
            {/* "Segnala un errore" (docs/changelog/2026-11-13-segnala-risposta-ia.md). */}
            {result.reportId ? <ReportAiAnswer key={result.reportId} reportId={result.reportId} /> : null}
          </YStack>
        ) : null}

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
                  href={resultsHref({
                    mestiere: answer.category,
                  })}
                  label={answer.label}
                />
              ))}
              <ChoiceLink href={resultsHref({ domanda: "no" })} label="Non lo so" />
            </XStack>
          </YStack>
        ) : null}

        {!chosen && !result.outOfService && !missingTrade ? chooseTrade : null}
      </YStack>

      {/* Dopo la domanda: prima si sceglie la persona giusta, poi si chiede il preventivo. */}
      {chosen && (chosenPros.length > 0 || chosenUndo) ? (
        <ChosenProsStrip
          chosen={chosenPros}
          max={maxChosen}
          description={description}
          onRemove={onRemoveChosen}
          onClear={onClearChosen}
          undo={chosenUndo}
        />
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
        count > 0 && nearestOutsideKm !== null ? (
          <WaitingRequestCard
            href={waitingHref({ key: result.outOfService })}
            trade={OUT_OF_SERVICE_LABELS[result.outOfService]}
            urgent={requestHints?.timing === "TODAY"}
            city={city}
            nearestKm={nearestOutsideKm}
            count={count}
          />
        ) : count > 0 ? (
          <Text fontSize={16} color={brand.grafite}>
            Nessuna delle nostre categorie fa questo lavoro, ma questi professionisti dichiarano di farlo.
          </Text>
        ) : (
          <WaitingRequestCard href={waitingHref({ key: result.outOfService })} trade={OUT_OF_SERVICE_LABELS[result.outOfService]} urgent={requestHints?.timing === "TODAY"} />
        )
      ) : missingTrade ? (
        <>
          {count > 0 && nearestOutsideKm !== null ? (
            <WaitingRequestCard
              href={waitingHref({ name: missingTrade })}
              trade={missingTrade}
              urgent={requestHints?.timing === "TODAY"}
              city={city}
              nearestKm={nearestOutsideKm}
              count={count}
            />
          ) : count > 0 ? (
            <>
              <Text fontSize={16} color={brand.grafite}>
                Nessuno dei nostri mestieri fa questo lavoro, ma questi professionisti dichiarano di farlo.
              </Text>
              {/* Chiusi, per non spingere giù i risultati. */}
              <details>
                <summary style={{ cursor: "pointer", color: brand.cianografiaScuro, fontWeight: 600, fontSize: 16, minHeight: 44, display: "flex", alignItems: "center" }}>
                  Ti serve un altro mestiere?
                </summary>
                {chooseTrade}
              </details>
            </>
          ) : (
            <>
              <WaitingRequestCard href={waitingHref({ name: missingTrade })} trade={missingTrade} urgent={requestHints?.timing === "TODAY"} />
              {chooseTrade}
            </>
          )}
        </>
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

export function SafetyNotice({ safety, compact = false }: { safety: NonNullable<ProblemMatchResult["safety"]>; compact?: boolean }) {
  const text = PROBLEM_SAFETY_TEXTS[safety];
  // Avviso piccolo nel modulo di richiesta (richiesta di Luca del 17/11/2026,
  // docs/changelog/2026-11-17-avviso-sicurezza-richiesta-diretta.md): il
  // pericolo e cosa fare subito in due righe, i passi completi a un tocco.
  if (compact) {
    return (
      <div
        role="note"
        aria-label="Prima di tutto la sicurezza"
        style={{
          border: `1px solid ${brand.urgenza}`,
          borderRadius: 10,
          background: brand.urgenzaVelo,
          padding: "10px 12px",
          display: "flex",
          gap: 8,
          alignItems: "flex-start",
        }}
      >
        <span style={{ flexShrink: 0, marginTop: 2, display: "inline-flex" }}>
          <Icon name="triangle-alert" size={16} color={brand.urgenza} />
        </span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <Text fontSize={14} color={brand.grafite} lineHeight="20px">
            <Text fontSize={14} fontWeight="700" color={brand.grafite}>
              {text.title}
            </Text>{" "}
            {text.short}
          </Text>
          <details>
            <summary
              style={{
                cursor: "pointer",
                color: brand.cianografiaScuro,
                fontWeight: 600,
                fontSize: 14,
                minHeight: 32,
                display: "flex",
                alignItems: "center",
              }}
            >
              Tutti i passi
            </summary>
            <ul style={{ margin: "2px 0 0", paddingLeft: 18, display: "flex", flexDirection: "column", gap: 2 }}>
              {text.steps.map((step) => (
                <li key={step}>
                  <Text fontSize={14} color={brand.grafite}>
                    {step}
                  </Text>
                </li>
              ))}
            </ul>
          </details>
        </div>
      </div>
    );
  }
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

/**
 * Riga leggera quando nella foto c'è un impianto (gas, quadro elettrico, caldaia)
 * ma nessun pericolo detto: apre lo stesso avviso, senza allarmare chi non ne ha
 * bisogno (decisione di Luca del 13/11, docs/changelog/2026-11-13-pericoli-dalla-foto.md).
 */
export function SafetyHint({ safety }: { safety: NonNullable<ProblemMatchResult["safetyHint"]> }) {
  const text = PROBLEM_SAFETY_TEXTS[safety];
  return (
    <details
      style={{
        border: `1px solid ${brand.filetto}`,
        borderRadius: 10,
        padding: "10px 14px",
        background: brand.calce,
      }}
    >
      <summary style={{ cursor: "pointer", fontWeight: 600, color: brand.grafite, fontSize: 16 }}>
        Senti odore di gas, fumo o bruciato? Ecco cosa fare
      </summary>
      <YStack gap="2" marginTop="2">
        <ul style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 4 }}>
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
    </details>
  );
}

/**
 * Nessuno fa ancora questo lavoro vicino al cliente (docs/changelog/2026-11-17-richieste-in-attesa.md,
 * decisioni di Luca del 17/11/2026, al posto di "Ce ne occupiamo noi" che
 * faceva sembrare il sito chi fa il lavoro): il cliente lascia la richiesta
 * completa con lo stesso modulo di sempre e arriva da sola a chi lo fa appena
 * si iscrive nella sua zona. Per "Oggi" si dice subito che non c'è nessuno.
 */
function WaitingRequestCard({
  href,
  trade,
  urgent,
  city,
  nearestKm = null,
  count = 0,
}: {
  href: string;
  trade: string;
  urgent: boolean;
  city?: string;
  /**
   * Nessuno nel raggio ma qualcuno più lontano (decisione di Luca del
   * 17/11/2026, docs/changelog/2026-11-17-mestiere-piu-vicino.md): si dice a
   * quanti km è il più vicino e sotto ci sono tutti, dal più vicino.
   */
  nearestKm?: number | null;
  count?: number;
}) {
  const [declined, setDeclined] = useState(false);
  if (declined) {
    return (
      <YStack gap="2" backgroundColor={brand.calce} borderWidth={1} borderColor={brand.filetto} borderRadius="4" padding="4">
        <Text fontSize={16} color={brand.grafite} role="status">
          Va bene. Se ti serve altro, cerca tra tutti i professionisti qui sotto.
        </Text>
      </YStack>
    );
  }
  return (
    <YStack gap="3" backgroundColor={brand.calce} borderWidth={1} borderColor={brand.filetto} borderRadius="4" padding="4">
      <YStack gap="1">
        <Text fontFamily="heading" fontWeight="800" fontSize="6" color={brand.grafite}>
          Nessuno fa ancora questo lavoro vicino a te
        </Text>
        {nearestKm !== null ? (
          <Text fontSize={16} color={brand.grafite}>
            Nessuno lo fa entro {SEARCH_RADIUS_KM} km{city ? ` da ${city}` : ""}. Il più vicino è a circa {nearestKm} km
            {count > 1 ? `: qui sotto trovi tutti i ${count}, dal più vicino. Puoi chiedere a loro un preventivo.` : ": lo trovi qui sotto e puoi chiedergli un preventivo."}
          </Text>
        ) : null}
        <Text fontSize={16} color={brand.grafite70}>
          {nearestKm !== null ? "Oppure lascia" : urgent ? "Per oggi non possiamo trovarti nessuno. Se va bene anche nei prossimi giorni, lascia" : "Lascia"} la richiesta
          completa: la mandiamo a chi fa il lavoro di {trade.toLowerCase()} appena si iscrive nella tua zona. Il preventivo te lo fa lui, e scegli tu
          se accettarlo.
        </Text>
      </YStack>
      <XStack gap="2" flexWrap="wrap">
        <Link href={href} style={{ textDecoration: "none" }}>
          <Button tabIndex={-1} variant="primary">
            Lascia la richiesta
          </Button>
        </Link>
        <Button variant="secondary" onPress={() => setDeclined(true)}>
          No grazie
        </Button>
      </XStack>
      <details className="waiting-request-more">
        <summary>Scopri di più</summary>
        <ul>
          <li>Non sappiamo dirti quando arriva qualcuno: ti scriviamo noi appena succede.</li>
          <li>La richiesta resta valida 60 giorni. Dopo 30 giorni ti chiediamo se ti serve ancora, e puoi ritirarla quando vuoi.</li>
          <li>Il professionista vede la città, la descrizione e le foto. Telefono e indirizzo solo dopo che accetti il suo preventivo.</li>
        </ul>
      </details>
    </YStack>
  );
}
