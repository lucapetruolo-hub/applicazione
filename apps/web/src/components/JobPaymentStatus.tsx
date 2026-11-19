"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BRAND,
  ONLINE_APP_FEE_PERCENT,
  type JobPaymentSummary,
  formatEurCents,
  formatServicePriceRange,
} from "@professionisti/shared";
import { Icon, Text, XStack, YStack, brand, type IconName } from "@professionisti/ui";
import { CardButton } from "@/components/CardButton";
import { formatIssueDeadline } from "@/lib/leadDeadline";

/** Importo esatto di un pagamento, stesso formato di tutto il sito (§349). */
function eur(cents: number): string {
  return formatEurCents(cents);
}

type Tone = "action" | "blocked" | "done" | "danger" | "neutral";

/** Colore dell'icona e del titolo per ogni tono: verde solo a soldi arrivati, ottone quando serve un'azione, rosso solo sugli errori. */
const TONE: Record<Tone, { bg: string; fg: string }> = {
  action: { bg: brand.ottoneVelo, fg: "#8A6418" },
  blocked: { bg: brand.cianografiaVelo, fg: brand.cianografiaScuro },
  done: { bg: "#E8F2F2", fg: brand.verificato },
  danger: { bg: brand.urgenzaVelo, fg: brand.urgenza },
  neutral: { bg: brand.gesso, fg: brand.grafite70 },
};

type View = {
  tone: Tone;
  icon: IconName;
  title: string;
  body: string;
  /** Passo attuale nella barra (0 = nessuno completato), null per nasconderla. */
  step: number | null;
  /** Il passo attuale è in errore (bonifico non riuscito). */
  stepError?: boolean;
};

// "In attesa della tua conferma", non "Bloccato": il cliente pensava che fossero bloccati la carta o i suoi soldi (docs/changelog/2026-11-08-prova-persone-simulate.md).
const CLIENT_STEPS = ["Pagato", "In attesa della tua conferma", "Al professionista"];
const PROFESSIONAL_STEPS = ["Pagato", "Bloccato", "Sbloccato", "In banca"];

function clientView(payment: JobPaymentSummary): View {
  // Acconto e saldo online: la carta dell'acconto basta, il saldo arriva da solo a lavoro finito (§267).
  const savedCard = payment.autoChargeCard ? ` Il saldo lo addebitiamo sulla stessa carta a lavoro finito.` : "";
  const stage = payment.stage;
  // Rimborso in attesa di fondi sul conto del professionista (§270): è la cosa che il cliente aspetta.
  if (payment.refundWaitingEurCents > 0) {
    return { tone: "blocked", icon: "clock", title: "Rimborso in arrivo", body: "Ti avvisiamo appena parte verso la tua carta.", step: null };
  }
  const until = payment.releaseDueAt ? formatIssueDeadline(payment.releaseDueAt) : null;
  if (stage === "AWAITING_DEPOSIT") {
    return { tone: "action", icon: "credit-card", title: "Acconto da pagare", body: "Paga l'acconto per confermare il lavoro.", step: 0 };
  }
  if (stage === "DEPOSIT_PAID") {
    return {
      tone: "blocked",
      icon: "lock",
      title: "Acconto pagato",
      body: payment.balanceDirect
        ? "Arriva al professionista quando confermi il lavoro. Il saldo lo paghi a lui."
        : `Arriva al professionista quando confermi il lavoro.${savedCard}`,
      step: 1,
    };
  }
  // Prezzo finale sopra il minimo: 48 ore per dire di no prima della carta (docs/changelog/2026-11-13-tutto-online-forbice.md).
  if (stage === "AWAITING_BALANCE" && payment.balanceAutoChargeAt) {
    return {
      tone: "action",
      icon: "credit-card",
      title: "Controlla il prezzo finale",
      body: `Se va bene non devi fare nulla: ${formatIssueDeadline(payment.balanceAutoChargeAt)} addebitiamo ${eur(payment.balanceDueEurCents)} sulla carta dell'acconto${payment.autoChargeCard ? `: ${payment.autoChargeCard}` : ""}. Se non sei d'accordo, segnala un problema: non addebitiamo nulla.`,
      step: 1,
    };
  }
  if (stage === "AWAITING_BALANCE") {
    return payment.balanceUnpaid
      ? { tone: "danger", icon: "credit-card", title: "Saldo da pagare", body: "Pagalo ora per chiudere il lavoro.", step: 1 }
      : { tone: "action", icon: "credit-card", title: "Saldo da pagare", body: until ? `Pagalo entro ${until}.` : "Pagalo per chiudere il lavoro.", step: 1 };
  }
  if (stage === "PAID" && payment.depositKept) {
    return { tone: "neutral", icon: "lock", title: "Acconto trattenuto", body: "Hai annullato dentro il preavviso: l'acconto resta al professionista, come diceva il preventivo.", step: null };
  }
  if (stage === "PAID") {
    return {
      tone: "blocked",
      icon: "lock",
      title: "Pagato",
      body: `Arriva al professionista quando confermi il lavoro${until ? `, o da solo il ${until}` : ""}.`,
      step: 1,
    };
  }
  if (stage === "RELEASED") {
    return payment.balanceUnpaid
      ? { tone: "danger", icon: "credit-card", title: "Saldo da pagare", body: "Pagalo ora per chiudere il lavoro.", step: 2 }
      : { tone: "done", icon: "check", title: "Pagamento concluso", body: "Il professionista ha ricevuto il pagamento.", step: 3 };
  }
  return {
    tone: "neutral",
    icon: "rotate-ccw",
    title: "Rimborsato",
    body: `${eur(payment.refundedEurCents)} tornano sulla tua carta in 5-10 giorni lavorativi.`,
    step: null,
  };
}

function professionalView(payment: JobPaymentSummary): View {
  const stage = payment.stage;
  if (payment.refundWaitingEurCents > 0) {
    return {
      tone: "action",
      icon: "clock",
      title: "Rimborso in attesa",
      body: "Il saldo del tuo conto Stripe non basta: il rimborso al cliente parte da solo appena arrivano fondi.",
      step: null,
    };
  }
  const until = payment.releaseDueAt ? formatIssueDeadline(payment.releaseDueAt) : null;
  if (stage === "AWAITING_DEPOSIT") {
    return { tone: "neutral", icon: "clock", title: "In attesa dell'acconto", body: "Il cliente deve ancora pagare l'acconto.", step: 0 };
  }
  if (stage === "REFUNDED") {
    return { tone: "neutral", icon: "rotate-ccw", title: "Rimborsato al cliente", body: "Il pagamento è tornato al cliente.", step: null };
  }
  if (stage === "DEPOSIT_PAID") {
    return {
      tone: "blocked",
      icon: "lock",
      title: "Acconto ricevuto",
      body: payment.balanceDirect
        ? "Lo ricevi in banca quando il cliente conferma il lavoro. Il saldo te lo paga lui."
        : "Lo ricevi in banca col saldo, quando il cliente conferma il lavoro.",
      step: 1,
    };
  }
  if (stage === "AWAITING_BALANCE" && payment.balanceAutoChargeAt) {
    return {
      tone: "blocked",
      icon: "clock",
      title: "In attesa del saldo",
      body: `Il prezzo finale è sopra il minimo del preventivo: il cliente ha 48 ore per controllarlo. Se non segnala un problema, il saldo si addebita da solo sulla sua carta ${formatIssueDeadline(payment.balanceAutoChargeAt)}.`,
      step: 1,
    };
  }
  if (stage === "AWAITING_BALANCE") {
    return { tone: "blocked", icon: "clock", title: "In attesa del saldo", body: "Il cliente deve pagare il saldo.", step: 1 };
  }
  if (stage === "PAID" && payment.depositKept) {
    return {
      tone: "blocked",
      icon: "lock",
      title: "Acconto trattenuto",
      body: `Il cliente ha annullato dentro il preavviso: l'acconto resta a te. Lo ricevi in banca${until ? ` il ${until}` : " dopo i giorni di blocco"}.`,
      step: 1,
    };
  }
  if (stage === "PAID") {
    return {
      tone: "blocked",
      icon: "lock",
      title: "Pagato dal cliente",
      body: `Lo ricevi in banca quando il cliente conferma il lavoro${until ? `, o da solo il ${until}` : ""}.`,
      step: 1,
    };
  }
  // Sbloccato: dov'è il bonifico verso la banca (docs/CHANGELOG.md §249).
  const unpaid = payment.balanceUnpaid ? " Del saldo mancante ci occupiamo noi." : "";
  switch (payment.payoutStatus) {
    case "FAILED":
      return {
        tone: "danger",
        icon: "landmark",
        title: "Bonifico non riuscito",
        body: "La banca non l'ha accettato. Controlla il conto bancario: il bonifico riparte da solo.",
        step: 3,
        stepError: true,
      };
    case "WAITING_FUNDS":
      return { tone: "blocked", icon: "lock-open", title: "Bonifico in preparazione", body: `Parte appena Stripe rende disponibili i soldi.${unpaid}`, step: 3 };
    case "PAID":
      return { tone: "done", icon: "check", title: "Bonifico arrivato", body: `È sul tuo conto bancario.${unpaid}`, step: 4 };
    default:
      return { tone: "done", icon: "landmark", title: "Bonifico partito", body: `Arriva in banca in 1-4 giorni lavorativi.${unpaid}`, step: 3 };
  }
}

/** Barra dei passaggi del pagamento: pagato → bloccato → sbloccato (→ in banca). */
function Steps({ labels, step, error }: { labels: string[]; step: number; error?: boolean }) {
  return (
    <XStack gap={4} width="100%">
      {labels.map((label, index) => {
        const done = index < step;
        const current = index === step;
        const color = current && error ? brand.urgenza : done ? brand.cianografia : current ? brand.cianografiaScuro : brand.filetto;
        return (
          <YStack key={label} flex={1} gap={4} style={{ minWidth: "min-content" }}>
            <YStack height={4} borderRadius={2} backgroundColor={done || current ? color : brand.filetto} opacity={current && !error ? 0.45 : 1} />
            {/* Mai a capo a metà parola ("Paga-to", "professionist-a" da telefono): si va a capo solo tra le parole. */}
            <Text
              fontSize={13}
              lineHeight="16px"
              fontWeight={current ? "700" : "500"}
              color={done || current ? brand.grafite : brand.grafite70}
              style={{ overflowWrap: "normal", wordBreak: "normal", hyphens: "manual" }}
            >
              {label}
            </Text>
          </YStack>
        );
      })}
    </XStack>
  );
}

function AmountRow({ label, value, strong, muted, card, divider }: { label: string; value: string; strong?: boolean; muted?: boolean; card?: boolean; divider?: boolean }) {
  // Riga della carta: va a capo la carta, non l'etichetta corta (da telefono "Apple Pay (Mastercard •••• 5100)").
  return (
    // `divider`: riga sottile sopra, stacca quello che deve ancora arrivare dai soldi già presi.
    <XStack justifyContent="space-between" gap="3" paddingVertical={2} {...(divider ? { borderTopWidth: 1, borderTopColor: brand.filetto, marginTop: 6, paddingTop: 8 } : {})}>
      <Text fontSize={16} color={muted ? brand.grafite70 : brand.grafite} flexShrink={card ? 0 : 1}>
        {label}
      </Text>
      <Text
        fontSize={16}
        fontWeight={strong ? "700" : "500"}
        color={muted ? brand.grafite70 : brand.grafite}
        flexShrink={card ? 1 : undefined}
        textAlign="right"
        style={{ fontVariantNumeric: "tabular-nums", whiteSpace: card ? undefined : "nowrap" }}
      >
        {card ? value.replace(/ •••• /g, "\u00a0••••\u00a0") : value}
      </Text>
    </XStack>
  );
}

/**
 * Pagamento di un lavoro (docs/CHANGELOG.md §168, §249). Online: stato in
 * evidenza (cosa succede ai soldi adesso), passaggi pagato → bloccato →
 * sbloccato, importi e una sola azione quando serve (pagare, o sistemare i
 * dati bancari se il bonifico non riesce). Col pagamento diretto solo il
 * metodo, in una riga.
 */
export function JobPaymentStatus({
  payment,
  audience,
  issueOpen = false,
  onPay,
  priceRange,
}: {
  payment: JobPaymentSummary;
  /** Prezzo del preventivo accettato: il totale e quanto resta a fine lavoro, prima dell'importo finale. */
  priceRange?: { minEurCents: number; maxEurCents: number };
  audience: "client" | "professional";
  /** Segnalazione di un problema aperta sul lavoro (collaudo F-09). */
  issueOpen?: boolean;
  /** Solo cliente: apre il checkout Stripe dell'acconto o del saldo. */
  onPay?: (part: "deposit" | "balance") => Promise<void>;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pay(part: "deposit" | "balance") {
    if (!onPay) return;
    setError(null);
    setBusy(true);
    try {
      await onPay(part);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Il pagamento non è partito: riprova tra poco.");
    } finally {
      setBusy(false);
    }
  }

  // Pagamento diretto: una riga sola (richiesta esplicita dell'utente, al
  // posto della spiegazione lunga su accordi e contestazioni), con le
  // stesse parole del preventivo (docs/CHANGELOG.md §339).
  if (payment.method === "DIRECT") {
    return (
      <Text fontSize={16} color={brand.grafite70}>
        Pagamento:{" "}
        <Text fontSize={16} fontWeight="700" color={brand.grafite}>
          {audience === "client" ? "direttamente al professionista" : "direttamente dal cliente"}
        </Text>
      </Text>
    );
  }

  const baseView = audience === "client" ? clientView(payment) : professionalView(payment);
  // Con una segnalazione o una contestazione in banca aperta i soldi non
  // partono: la scheda non li promette in arrivo (collaudo F-09).
  const disputed = audience === "professional" && !!payment.bankDispute?.open;
  const held = (issueOpen || disputed) && !payment.releasedAt && payment.stage !== "REFUNDED" && payment.stage !== "AWAITING_DEPOSIT";
  const view: View = held
    ? {
        ...baseView,
        tone: "blocked",
        icon: "lock",
        body: disputed
          ? "Contestazione in banca aperta: i soldi restano fermi finché la banca non decide."
          : "C'è un problema aperto su questo lavoro: i soldi restano fermi finché non si chiude.",
      }
    : baseView;
  const tone = TONE[view.tone];
  const stage = payment.stage;
  const collected = payment.paidEurCents - payment.refundedEurCents;

  const rows: Array<{ label: string; value: string; strong?: boolean; muted?: boolean; card?: boolean; divider?: boolean }> = [];
  if (audience === "client") {
    if (payment.depositEurCents !== null) rows.push({ label: payment.paidEurCents > 0 ? "Acconto pagato" : "Acconto", value: eur(payment.depositEurCents) });
    // Saldo online ancora da pagare, prima che il professionista dica l'importo finale: "da… a…" del preventivo meno l'acconto.
    if (stage === "DEPOSIT_PAID" && !payment.balanceDirect && payment.finalAmountEurCents === null && priceRange) {
      const min = Math.max(0, priceRange.minEurCents - payment.paidEurCents);
      const max = Math.max(0, priceRange.maxEurCents - payment.paidEurCents);
      if (max > 0) rows.push({ label: "Saldo a lavoro finito", value: formatServicePriceRange(min, max) });
    }
    if (payment.finalAmountEurCents !== null) rows.push({ label: "Importo finale", value: eur(payment.finalAmountEurCents) });
    if (payment.paidEurCents > 0 && payment.paidEurCents !== payment.depositEurCents) rows.push({ label: "Pagato online", value: eur(payment.paidEurCents) });
    if (payment.balanceDirect && payment.directBalanceEurCents !== null) rows.push({ label: "Saldo diretto al professionista", value: eur(payment.directBalanceEurCents) });
    if (payment.balanceDueEurCents > 0) rows.push({ label: "Da pagare", value: eur(payment.balanceDueEurCents), strong: true });
    if (payment.refundWaitingEurCents > 0) rows.push({ label: "Rimborso in arrivo", value: eur(payment.refundWaitingEurCents), strong: true });
    if (payment.refundedEurCents > payment.refundWaitingEurCents) rows.push({ label: "Rimborsato", value: eur(payment.refundedEurCents - payment.refundWaitingEurCents) });
    // Carta usata, per riconoscere l'addebito in banca: una riga sola se acconto e saldo sono sulla stessa.
    if (payment.depositCard && payment.balanceCard && payment.depositCard !== payment.balanceCard) {
      rows.push({ label: "Carta dell'acconto", value: payment.depositCard, muted: true, card: true });
      rows.push({ label: "Carta del saldo", value: payment.balanceCard, muted: true, card: true });
    } else if (payment.depositCard || payment.balanceCard) {
      rows.push({ label: "Carta", value: (payment.depositCard ?? payment.balanceCard) as string, muted: true, card: true });
    }
  } else {
    // Lo stesso conto del riquadro in Agenda (docs/changelog/2026-11-19-pagamento-in-agenda.md):
    // quanto vale il lavoro, quanto è già arrivato online, quanto resta.
    const rangeMax = priceRange?.maxEurCents ?? 0;
    if (payment.finalAmountEurCents !== null) rows.push({ label: "Importo finale", value: eur(payment.finalAmountEurCents) });
    else if (priceRange && rangeMax > 0 && stage !== "REFUNDED") rows.push({ label: "Totale del preventivo", value: formatServicePriceRange(priceRange.minEurCents, rangeMax) });
    if (stage === "AWAITING_DEPOSIT" && payment.depositEurCents !== null) rows.push({ label: "Acconto online da pagare", value: eur(payment.depositEurCents) });
  }
  if (audience === "professional" && stage !== "AWAITING_DEPOSIT") {
    if (collected > 0 || stage === "REFUNDED") rows.push({ label: "Pagato dal cliente online", value: eur(payment.paidEurCents) });
    if (payment.refundedEurCents > 0) rows.push({ label: "Rimborsato al cliente", value: `−${eur(payment.refundedEurCents)}` });
    if (payment.refundWaitingEurCents > 0) rows.push({ label: "Di cui in attesa di fondi", value: eur(payment.refundWaitingEurCents), muted: true });
    if (payment.balanceDirect && payment.directBalanceEurCents !== null) rows.push({ label: "Saldo che ti paga direttamente", value: eur(payment.directBalanceEurCents), muted: true });
    // Presa da Stripe dal suo saldo, vinta o persa (docs/changelog/2026-11-03-commissione-contestazioni.md).
    const disputeFeeRow = { label: "Commissione di Stripe per la contestazione", value: `−${eur(payment.disputeFeeEurCents ?? 0)}`, muted: true };
    if (stage === "REFUNDED" && (payment.disputeFeeEurCents ?? 0) > 0) rows.push(disputeFeeRow);
    if (stage !== "REFUNDED" && payment.payoutEurCents !== undefined) {
      // Trattenuta unica con l'IVA, commissioni Stripe comprese (§378); a parte solo sui pagamenti di prima.
      rows.push({ label: `Trattenuta ${BRAND.name} ${ONLINE_APP_FEE_PERCENT}% + IVA`, value: `−${eur(payment.appFeeEurCents ?? 0)}`, muted: true });
      if ((payment.stripeFeeEurCents ?? 0) > 0) rows.push({ label: "Commissione Stripe per il pagamento", value: `−${eur(payment.stripeFeeEurCents ?? 0)}`, muted: true });
      if ((payment.disputeFeeEurCents ?? 0) > 0) rows.push(disputeFeeRow);
      // Ogni differenza con la sua riga, così le cifre tornano (collaudo F-21).
      if ((payment.debtRecoveredEurCents ?? 0) > 0) rows.push({ label: "Ripreso per un rimborso di un lavoro precedente", value: `−${eur(payment.debtRecoveredEurCents ?? 0)}`, muted: true });
      if ((payment.takenByStripeEurCents ?? 0) > 0) rows.push({ label: "Già preso da Stripe per un altro lavoro (rimborso o contestazione)", value: `−${eur(payment.takenByStripeEurCents ?? 0)}`, muted: true });
      rows.push({ label: stage === "RELEASED" ? "Ti arriva in banca" : held ? "Ti arriverà in banca se si chiude bene" : "Ti arriverà in banca", value: eur(payment.payoutEurCents), strong: true });
    }
    // Quello che deve ancora arrivare sta in fondo, dopo il conto dei soldi già presi: la trattenuta qui sopra riguarda solo quelli.
    if (stage === "DEPOSIT_PAID" && payment.finalAmountEurCents === null && priceRange && priceRange.maxEurCents - payment.paidEurCents > 0) {
      rows.push({
        label: "Resta a fine lavoro",
        divider: true,
        value: formatServicePriceRange(Math.max(0, priceRange.minEurCents - payment.paidEurCents), priceRange.maxEurCents - payment.paidEurCents),
      });
    }
    if (payment.balanceDueEurCents > 0 && !payment.balanceDirect) rows.push({ label: "Resta da pagare online", value: eur(payment.balanceDueEurCents), divider: true });
  }

  // Saldo in attesa delle 48 ore: niente "Paga il saldo", la carta dell'acconto basta.
  const canPay = audience === "client" && onPay && (stage === "AWAITING_DEPOSIT" || (payment.balanceDueEurCents > 0 && !payment.balanceAutoChargeAt));

  return (
    <YStack gap="3" padding="3" borderRadius="3" backgroundColor={brand.calce} borderWidth={1} borderColor={brand.filetto}>
      <XStack gap="3" alignItems="flex-start">
        <YStack width={36} height={36} borderRadius={18} backgroundColor={tone.bg} alignItems="center" justifyContent="center" flexShrink={0}>
          <Icon name={view.icon} size={18} strokeWidth={2.2} color={tone.fg} />
        </YStack>
        <YStack flex={1} gap={2}>
          <Text fontSize={13} color={brand.grafite70}>
            {payment.balanceDirect ? "Acconto online con Stripe, saldo diretto" : "Pagamento online con Stripe"}
          </Text>
          <Text fontSize={16} fontWeight="700" color={view.tone === "danger" ? brand.urgenza : brand.grafite} lineHeight="22px">
            {view.title}
          </Text>
        </YStack>
      </XStack>

      {view.step !== null ? (
        <Steps labels={audience === "client" ? CLIENT_STEPS : PROFESSIONAL_STEPS} step={view.step} error={view.stepError} />
      ) : null}

      <Text fontSize={13} color={brand.grafite70} lineHeight="20px">
        {view.body}{" "}
        <Link
          href={audience === "client" ? "/termini#pagamenti" : "/per-professionisti/pagamenti"}
          style={{ color: brand.cianografiaScuro, fontWeight: 600, whiteSpace: "nowrap" }}
        >
          Scopri di più
        </Link>
      </Text>

      {rows.length > 0 ? (
        <YStack borderTopWidth={1} borderTopColor={brand.filetto} paddingTop="2">
          {rows.map((row) => (
            <AmountRow key={row.label} {...row} />
          ))}
        </YStack>
      ) : null}

      {/* La ricevuta di Stripe non è un documento fiscale (docs/CHANGELOG.md §378): lo dice
          la casella "Ti serve la fattura?" sotto, in una frase sola (collaudo dell'8/11, E6-12). */}

      {canPay ? (
        <CardButton tone="primary" alignSelf="stretch gtXs:flex-start" disabled={busy} onPress={() => pay(stage === "AWAITING_DEPOSIT" ? "deposit" : "balance")}>
          {busy
            ? "Apertura del pagamento..."
            : stage === "AWAITING_DEPOSIT"
              ? `Paga l'acconto (${eur(payment.depositEurCents ?? 0)})`
              : `Paga il saldo (${eur(payment.balanceDueEurCents)})`}
        </CardButton>
      ) : null}
      {audience === "professional" && payment.payoutStatus === "FAILED" ? (
        <CardButton tone="primary" alignSelf="stretch gtXs:flex-start" onPress={() => router.push("/dashboard/fiscale")}>
          Controlla i dati bancari
        </CardButton>
      ) : null}
      {error ? (
        <Text fontSize={13} color={brand.urgenza} role="alert">
          {error}
        </Text>
      ) : null}
    </YStack>
  );
}
