"use client";

import { useState } from "react";
import {
  JOB_PAYMENT_STAGE_LABEL,
  ONLINE_APP_FEE_PERCENT,
  type JobPaymentSummary,
} from "@professionisti/shared";
import { Button, Text, YStack, brand } from "@professionisti/ui";
import { formatIssueDeadline } from "@/lib/leadDeadline";

function eur(cents: number): string {
  return `€${(cents / 100).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Pagamento di un lavoro (docs/CHANGELOG.md §168). Lato cliente: metodo
 * scelto, acconto e saldo da pagare con Stripe, custodia fino alla
 * conferma; col pagamento diretto, che i problemi si risolvono col
 * professionista. Lato professionista: cosa ha pagato il cliente, quanto
 * riceverà (meno commissione e costo Stripe) e quando.
 */
export function JobPaymentStatus({
  payment,
  audience,
  businessName,
  onPay,
}: {
  payment: JobPaymentSummary;
  audience: "client" | "professional";
  /** Nome dell'altra parte: il professionista per il cliente. */
  businessName?: string;
  /** Solo cliente: apre il checkout Stripe dell'acconto o del saldo. */
  onPay?: (part: "deposit" | "balance") => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pay(part: "deposit" | "balance") {
    if (!onPay) return;
    setError(null);
    setBusy(true);
    try {
      await onPay(part);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Errore imprevisto, riprova.",
      );
    } finally {
      setBusy(false);
    }
  }

  const box = (children: React.ReactNode) => (
    <YStack
      gap="$1"
      padding="$3"
      borderRadius="$3"
      backgroundColor={brand.gesso}
      borderWidth={1}
      borderColor={brand.filetto}
    >
      {children}
    </YStack>
  );

  if (payment.method === "DIRECT") {
    return box(
      <>
        <Text fontSize="$2" fontWeight="700" color={brand.grafite}>
          Pagamento diretto al professionista
        </Text>
        <Text fontSize="$2" color={brand.grafite70}>
          {audience === "client"
            ? `Paghi ${businessName ?? "il professionista"} come vi accordate. Eventuali problemi vanno risolti direttamente con lui: possiamo mettervi in contatto, ma non rimborsiamo e non decidiamo sulle contestazioni.`
            : "Il cliente ti paga come vi accordate. Eventuali problemi si risolvono direttamente tra voi, senza il nostro team."}
        </Text>
      </>,
    );
  }

  const stage = payment.stage;
  const collected = payment.paidEurCents - payment.refundedEurCents;
  const lines: string[] = [];
  if (payment.depositEurCents !== null) {
    lines.push(
      `Acconto: ${eur(payment.depositEurCents)}${payment.paidEurCents > 0 ? " (pagato)" : ""}`,
    );
  }
  if (payment.finalAmountEurCents !== null)
    lines.push(`Importo finale: ${eur(payment.finalAmountEurCents)}`);
  if (payment.paidEurCents > 0)
    lines.push(`Pagato online: ${eur(payment.paidEurCents)}`);
  if (payment.refundedEurCents > 0)
    lines.push(`Rimborsato al cliente: ${eur(payment.refundedEurCents)}`);

  let note: string;
  if (audience === "client") {
    note =
      stage === "AWAITING_DEPOSIT"
        ? "Paga l'acconto per completare la prenotazione con il pagamento online."
        : stage === "DEPOSIT_PAID"
          ? "Il saldo si paga quando il professionista chiude il lavoro con l'importo finale."
          : stage === "AWAITING_BALANCE"
            ? payment.balanceUnpaid
              ? "Il saldo non risulta pagato: pagalo ora. Il nostro team è stato avvisato."
              : `Saldo da pagare: ${eur(payment.balanceDueEurCents)}.${payment.releaseDueAt ? ` Pagalo entro ${formatIssueDeadline(payment.releaseDueAt)}.` : ""}`
            : stage === "PAID"
              ? `Teniamo noi i soldi: passano al professionista dopo la tua conferma del lavoro${payment.releaseDueAt ? `, o da soli il ${formatIssueDeadline(payment.releaseDueAt)}` : ""}. Se qualcosa non va, segnalalo prima: ti assistiamo e, se la segnalazione è accolta, ti rimborsiamo.`
              : stage === "RELEASED"
                ? payment.balanceUnpaid
                  ? `Il saldo (${eur(payment.balanceDueEurCents)}) non risulta pagato: pagalo ora. Il nostro team è stato avvisato e può sospendere l'account.`
                  : "Pagamento concluso e passato al professionista. Con il pagamento online hai comunque la nostra assistenza sulle segnalazioni."
                : "Ti abbiamo rimborsato sul metodo di pagamento usato.";
  } else {
    const payout =
      payment.payoutEurCents !== undefined
        ? ` Riceverai ${eur(payment.payoutEurCents)} (commissione Manovia ${ONLINE_APP_FEE_PERCENT}%: ${eur(payment.appFeeEurCents ?? 0)}, costo Stripe: ${eur(payment.stripeFeeEurCents ?? 0)}).`
        : "";
    note =
      stage === "AWAITING_DEPOSIT"
        ? "Il cliente ha scelto il pagamento online e deve ancora pagare l'acconto."
        : stage === "DEPOSIT_PAID"
          ? `Acconto pagato (${eur(collected)}). Il saldo lo paga il cliente quando chiudi il lavoro con l'importo finale.`
          : stage === "AWAITING_BALANCE"
            ? `In attesa del saldo del cliente.${payout} Se entro 7 giorni non paga, ricevi quanto già pagato e il nostro team lo sollecita.`
            : stage === "PAID"
              ? `Pagato dal cliente, in custodia fino alla sua conferma${payment.releaseDueAt ? ` o fino al ${formatIssueDeadline(payment.releaseDueAt)}` : ""}.${payout} Con una segnalazione aperta l'accredito aspetta la decisione. Per riceverlo devi aver attivato i pagamenti in Dati fiscali e pagamenti.`
              : stage === "RELEASED"
                ? `Accreditato sul tuo conto Stripe${payment.payoutEurCents !== undefined ? `: ${eur(payment.payoutEurCents)}` : ""}.${payment.balanceUnpaid ? " Il cliente non ha pagato il saldo: se ne occupa il nostro team." : ""}`
                : "Il pagamento è stato rimborsato al cliente.";
  }

  return box(
    <>
      <Text fontSize="$2" fontWeight="700" color={brand.grafite}>
        Pagamento online con Stripe
        {stage ? ` · ${JOB_PAYMENT_STAGE_LABEL[stage]}` : ""}
      </Text>
      {lines.length > 0 ? (
        <Text fontSize="$2" color={brand.grafite}>
          {lines.join(" · ")}
        </Text>
      ) : null}
      <Text fontSize="$2" color={brand.grafite70}>
        {note}
      </Text>
      {audience === "client" &&
      onPay &&
      (stage === "AWAITING_DEPOSIT" || payment.balanceDueEurCents > 0) ? (
        <Button
          variant="primary"
          size="$2"
          height={36}
          alignSelf="flex-start"
          disabled={busy}
          opacity={busy ? 0.6 : 1}
          onPress={() =>
            pay(stage === "AWAITING_DEPOSIT" ? "deposit" : "balance")
          }
        >
          {busy
            ? "Apertura del pagamento..."
            : stage === "AWAITING_DEPOSIT"
              ? `Paga l'acconto (${eur(payment.depositEurCents ?? 0)})`
              : `Paga il saldo (${eur(payment.balanceDueEurCents)})`}
        </Button>
      ) : null}
      {error ? (
        <Text fontSize="$2" color={brand.urgenza}>
          {error}
        </Text>
      ) : null}
    </>,
  );
}
