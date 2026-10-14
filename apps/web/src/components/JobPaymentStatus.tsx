"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  BRAND,
  ONLINE_APP_FEE_PERCENT,
  type JobPaymentSummary,
} from "@professionisti/shared";
import { Icon, Text, XStack, YStack, brand, type IconName } from "@professionisti/ui";
import { CardButton } from "@/components/CardButton";
import { formatIssueDeadline } from "@/lib/leadDeadline";

function eur(cents: number): string {
  return `€${(cents / 100).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

type Tone = "action" | "blocked" | "done" | "danger" | "neutral";

/** Colore dell'icona e del titolo per ogni tono: verde solo a soldi arrivati, ottone quando serve un'azione, rosso solo sugli errori. */
const TONE: Record<Tone, { bg: string; fg: string }> = {
  action: { bg: brand.ottoneVelo, fg: "#8A6418" },
  blocked: { bg: brand.cianografiaVelo, fg: brand.cianografiaScuro },
  done: { bg: "#E6F4EC", fg: brand.verificato },
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

const CLIENT_STEPS = ["Pagato", "Bloccato", "Al professionista"];
const PROFESSIONAL_STEPS = ["Pagato", "Bloccato", "Sbloccato", "In banca"];

function clientView(payment: JobPaymentSummary): View {
  const stage = payment.stage;
  const until = payment.releaseDueAt ? formatIssueDeadline(payment.releaseDueAt) : null;
  if (stage === "AWAITING_DEPOSIT") {
    return { tone: "action", icon: "credit-card", title: "Acconto da pagare", body: "Paga l'acconto per confermare il lavoro.", step: 0 };
  }
  if (stage === "DEPOSIT_PAID") {
    return {
      tone: "blocked",
      icon: "lock",
      title: "Acconto pagato, bloccato",
      body: payment.balanceDirect
        ? "Il professionista lo riceve solo dopo che confermi il lavoro. Il saldo lo paghi direttamente a lui, a lavoro finito."
        : "Il professionista lo riceve solo dopo che confermi il lavoro. Il saldo si paga quando chiude il lavoro con l'importo finale.",
      step: 1,
    };
  }
  if (stage === "AWAITING_BALANCE") {
    return payment.balanceUnpaid
      ? { tone: "danger", icon: "credit-card", title: "Saldo non pagato", body: "Pagalo ora: il nostro team è stato avvisato.", step: 1 }
      : {
          tone: "action",
          icon: "credit-card",
          title: "Saldo da pagare",
          body: `${until ? `Pagalo entro ${until}. ` : ""}Anche il saldo resta bloccato fino alla tua conferma del lavoro.`,
          step: 1,
        };
  }
  if (stage === "PAID") {
    return {
      tone: "blocked",
      icon: "lock",
      title: "Pagato, bloccato fino alla tua conferma",
      body: `Il professionista riceve i soldi quando confermi che il lavoro è fatto${until ? `, oppure da soli il ${until}` : ""}. Se qualcosa non va segnalalo prima: ti assistiamo e, se la segnalazione è accolta, ti rimborsiamo.`,
      step: 1,
    };
  }
  if (stage === "RELEASED") {
    return payment.balanceUnpaid
      ? {
          tone: "danger",
          icon: "credit-card",
          title: "Saldo non pagato",
          body: `Il saldo (${eur(payment.balanceDueEurCents)}) non risulta pagato: pagalo ora. Il nostro team è stato avvisato e può sospendere l'account.`,
          step: 2,
        }
      : {
          tone: "done",
          icon: "check",
          title: "Pagamento concluso",
          body: "I soldi sono stati sbloccati al professionista. Con il pagamento online hai comunque la nostra assistenza sulle segnalazioni.",
          step: 3,
        };
  }
  return {
    tone: "neutral",
    icon: "rotate-ccw",
    title: "Rimborsato",
    body: `Ti abbiamo rimborsato ${eur(payment.refundedEurCents)} sul metodo di pagamento usato: di solito arriva in 5-10 giorni lavorativi.`,
    step: null,
  };
}

function professionalView(payment: JobPaymentSummary): View {
  const stage = payment.stage;
  const until = payment.releaseDueAt ? formatIssueDeadline(payment.releaseDueAt) : null;
  if (stage === "AWAITING_DEPOSIT") {
    return { tone: "neutral", icon: "clock", title: "In attesa dell'acconto", body: "Il cliente ha scelto il pagamento online e deve ancora pagare l'acconto.", step: 0 };
  }
  if (stage === "REFUNDED") {
    return { tone: "neutral", icon: "rotate-ccw", title: "Rimborsato al cliente", body: "Il pagamento è stato restituito al cliente e ripreso dal tuo conto Stripe.", step: null };
  }
  if (stage === "DEPOSIT_PAID") {
    return {
      tone: "blocked",
      icon: "lock",
      title: "Acconto ricevuto, bloccato",
      body: payment.balanceDirect
        ? "È sul tuo conto Stripe ma bloccato: lo sblocchiamo quando il cliente conferma il lavoro, o 7 giorni dopo che lo chiudi. Il saldo te lo paga il cliente direttamente."
        : "È sul tuo conto Stripe ma bloccato: lo sblocchiamo insieme al saldo quando il cliente conferma il lavoro, o 7 giorni dopo che lo chiudi.",
      step: 1,
    };
  }
  if (stage === "AWAITING_BALANCE") {
    return {
      tone: "blocked",
      icon: "clock",
      title: "In attesa del saldo",
      body: "Se il cliente non paga entro 7 giorni, ti sblocchiamo quanto ha già pagato e il nostro team lo sollecita.",
      step: 1,
    };
  }
  if (stage === "PAID") {
    return {
      tone: "blocked",
      icon: "lock",
      title: "Bloccato fino alla conferma del cliente",
      body: `Lo sblocchiamo quando il cliente conferma il lavoro${until ? `, oppure da solo il ${until}` : ""}. Con una segnalazione aperta resta bloccato finché non si chiude.`,
      step: 1,
    };
  }
  // Sbloccato: dov'è il bonifico verso la banca (docs/CHANGELOG.md §243).
  const unpaid = payment.balanceUnpaid ? " Il cliente non ha pagato il saldo: se ne occupa il nostro team." : "";
  switch (payment.payoutStatus) {
    case "FAILED":
      return {
        tone: "danger",
        icon: "landmark",
        title: "Bonifico non riuscito",
        body: `La tua banca non ha accettato il bonifico${payment.payoutFailureMessage ? ` (${payment.payoutFailureMessage.replace(/\.$/, "")})` : ""}. I soldi sono al sicuro sul tuo conto Stripe: controlla il conto bancario e il bonifico riparte da solo.`,
        step: 3,
        stepError: true,
      };
    case "WAITING_FUNDS":
      return {
        tone: "blocked",
        icon: "lock-open",
        title: "Sbloccato, bonifico in preparazione",
        body: `Il bonifico verso la tua banca parte appena Stripe rende disponibili i soldi, di solito pochi giorni dopo il pagamento.${unpaid}`,
        step: 3,
      };
    case "PAID":
      return { tone: "done", icon: "check", title: "Bonifico arrivato", body: `Il pagamento è arrivato sul tuo conto bancario.${unpaid}`, step: 4 };
    default:
      return {
        tone: "done",
        icon: "landmark",
        title: "Bonifico partito",
        body: `Arriva sul tuo conto bancario in 1-4 giorni lavorativi.${unpaid}`,
        step: 3,
      };
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
          <YStack key={label} flex={1} gap={4}>
            <YStack height={4} borderRadius={2} backgroundColor={done || current ? color : brand.filetto} opacity={current && !error ? 0.45 : 1} />
            <Text fontSize={11} lineHeight={14} fontWeight={current ? "700" : "500"} color={done || current ? brand.grafite : brand.grafite70}>
              {label}
            </Text>
          </YStack>
        );
      })}
    </XStack>
  );
}

function AmountRow({ label, value, strong, muted }: { label: string; value: string; strong?: boolean; muted?: boolean }) {
  return (
    <XStack justifyContent="space-between" gap="$3" paddingVertical={2}>
      <Text fontSize="$2" color={muted ? brand.grafite70 : brand.grafite} flexShrink={1}>
        {label}
      </Text>
      <Text fontSize="$2" fontWeight={strong ? "700" : "500"} color={muted ? brand.grafite70 : brand.grafite} style={{ fontVariantNumeric: "tabular-nums" }}>
        {value}
      </Text>
    </XStack>
  );
}

/**
 * Pagamento di un lavoro (docs/CHANGELOG.md §168, §243). Online: stato in
 * evidenza (cosa succede ai soldi adesso), passaggi pagato → bloccato →
 * sbloccato, importi e una sola azione quando serve (pagare, o sistemare i
 * dati bancari se il bonifico non riesce). Col pagamento diretto solo il
 * metodo, in una riga.
 */
export function JobPaymentStatus({
  payment,
  audience,
  onPay,
}: {
  payment: JobPaymentSummary;
  audience: "client" | "professional";
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
  // posto della spiegazione lunga su accordi e contestazioni).
  if (payment.method === "DIRECT") {
    return (
      <Text fontSize="$3" color={brand.grafite70}>
        Metodo di pagamento:{" "}
        <Text fontSize="$3" fontWeight="700" color={brand.grafite}>
          DIRETTO
        </Text>
        {audience === "client" ? " · paghi direttamente il professionista" : " · vieni pagato direttamente dal cliente"}
      </Text>
    );
  }

  const view = audience === "client" ? clientView(payment) : professionalView(payment);
  const tone = TONE[view.tone];
  const stage = payment.stage;
  const collected = payment.paidEurCents - payment.refundedEurCents;

  const rows: Array<{ label: string; value: string; strong?: boolean; muted?: boolean }> = [];
  if (audience === "client") {
    if (payment.depositEurCents !== null) rows.push({ label: payment.paidEurCents > 0 ? "Acconto pagato" : "Acconto", value: eur(payment.depositEurCents) });
    if (payment.finalAmountEurCents !== null) rows.push({ label: "Importo finale", value: eur(payment.finalAmountEurCents) });
    if (payment.paidEurCents > 0 && payment.paidEurCents !== payment.depositEurCents) rows.push({ label: "Pagato online", value: eur(payment.paidEurCents) });
    if (payment.balanceDirect && payment.directBalanceEurCents !== null) rows.push({ label: "Saldo diretto al professionista", value: eur(payment.directBalanceEurCents) });
    if (payment.balanceDueEurCents > 0) rows.push({ label: "Da pagare", value: eur(payment.balanceDueEurCents), strong: true });
    if (payment.refundedEurCents > 0) rows.push({ label: "Rimborsato", value: eur(payment.refundedEurCents) });
  } else if (stage !== "AWAITING_DEPOSIT") {
    if (collected > 0 || stage === "REFUNDED") rows.push({ label: "Pagato dal cliente online", value: eur(payment.paidEurCents) });
    if (payment.refundedEurCents > 0) rows.push({ label: "Rimborsato al cliente", value: `−${eur(payment.refundedEurCents)}` });
    if (payment.balanceDirect && payment.directBalanceEurCents !== null) rows.push({ label: "Saldo che ti paga direttamente", value: eur(payment.directBalanceEurCents), muted: true });
    if (stage !== "REFUNDED" && payment.payoutEurCents !== undefined) {
      rows.push({ label: `Commissione ${BRAND.name} ${ONLINE_APP_FEE_PERCENT}%`, value: `−${eur(payment.appFeeEurCents ?? 0)}`, muted: true });
      rows.push({ label: "Costo della carta (Stripe)", value: `−${eur(payment.stripeFeeEurCents ?? 0)}`, muted: true });
      rows.push({ label: stage === "RELEASED" ? "Ti arriva in banca" : "Ti arriverà in banca", value: eur(payment.payoutEurCents), strong: true });
    }
  }

  const canPay = audience === "client" && onPay && (stage === "AWAITING_DEPOSIT" || payment.balanceDueEurCents > 0);

  return (
    <YStack gap="$3" padding="$3" borderRadius="$3" backgroundColor={brand.calce} borderWidth={1} borderColor={brand.filetto}>
      <XStack gap="$3" alignItems="flex-start">
        <YStack width={36} height={36} borderRadius={18} backgroundColor={tone.bg} alignItems="center" justifyContent="center" flexShrink={0}>
          <Icon name={view.icon} size={18} strokeWidth={2.2} color={tone.fg} />
        </YStack>
        <YStack flex={1} gap={2}>
          <Text fontSize={12} color={brand.grafite70}>
            {payment.balanceDirect ? "Acconto online con Stripe, saldo diretto" : "Pagamento online con Stripe"}
          </Text>
          <Text fontSize="$4" fontWeight="700" color={view.tone === "danger" ? brand.urgenza : brand.grafite} lineHeight={22}>
            {view.title}
          </Text>
        </YStack>
      </XStack>

      {view.step !== null ? (
        <Steps labels={audience === "client" ? CLIENT_STEPS : PROFESSIONAL_STEPS} step={view.step} error={view.stepError} />
      ) : null}

      <Text fontSize="$2" color={brand.grafite70} lineHeight={20}>
        {view.body}
      </Text>

      {rows.length > 0 ? (
        <YStack borderTopWidth={1} borderTopColor={brand.filetto} paddingTop="$2">
          {rows.map((row) => (
            <AmountRow key={row.label} {...row} />
          ))}
        </YStack>
      ) : null}

      {canPay ? (
        <CardButton tone="primary" alignSelf="stretch" $gtXs={{ alignSelf: "flex-start" }} disabled={busy} onPress={() => pay(stage === "AWAITING_DEPOSIT" ? "deposit" : "balance")}>
          {busy
            ? "Apertura del pagamento..."
            : stage === "AWAITING_DEPOSIT"
              ? `Paga l'acconto (${eur(payment.depositEurCents ?? 0)})`
              : `Paga il saldo (${eur(payment.balanceDueEurCents)})`}
        </CardButton>
      ) : null}
      {audience === "professional" && payment.payoutStatus === "FAILED" ? (
        <CardButton tone="primary" alignSelf="stretch" $gtXs={{ alignSelf: "flex-start" }} onPress={() => router.push("/dashboard/fiscale")}>
          Controlla i dati bancari
        </CardButton>
      ) : null}
      {error ? (
        <Text fontSize="$2" color={brand.urgenza} role="alert">
          {error}
        </Text>
      ) : null}
    </YStack>
  );
}
