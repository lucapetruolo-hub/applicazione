import { z } from "zod";
import "./zod";
import { onlineDepositEurCents, type JobPaymentChoice } from "./onlinePayments";
import { formatEur } from "./professionals";

/**
 * Tetto ai pagamenti online (decisione di Luca del 28/10/2026,
 * docs/changelog/2026-10-28-tetto-pagamenti-online.md): al massimo 2.000 € a
 * lavoro chiesti online (acconto e saldo; il pagamento diretto resta libero),
 * finché il professionista non ha 10 lavori pagati online e chiusi senza
 * contestazioni in banca, con il primo di almeno 120 giorni fa: circa il
 * tempo in cui un cliente può ancora contestare con la sua banca. Una
 * contestazione persa fa ripartire il conto. L'admin può togliere il tetto a
 * mano.
 */
export const ONLINE_LIMIT_EUR_CENTS = 200_000;
export const ONLINE_LIMIT_FREE_JOBS = 10;
export const ONLINE_LIMIT_FREE_DAYS = 120;

/**
 * Tetto del professionista in centesimi, null = nessun tetto. `cleanJobs`:
 * lavori pagati online, con i soldi già passati a lui e senza contestazioni,
 * pagati dopo l'ultima contestazione persa; `firstCleanJobAt`: il primo.
 */
export function onlineLimitEurCents(input: { cleanJobs: number; firstCleanJobAt: Date | null; removedByAdmin: boolean; now?: Date }): number | null {
  if (input.removedByAdmin) return null;
  const now = input.now ?? new Date();
  const enoughDays = !!input.firstCleanJobAt && now.getTime() - input.firstCleanJobAt.getTime() >= ONLINE_LIMIT_FREE_DAYS * 86_400_000;
  return input.cleanJobs >= ONLINE_LIMIT_FREE_JOBS && enoughDays ? null : ONLINE_LIMIT_EUR_CENTS;
}

/** Quanto passa online con un modo di pagamento: tutto con ONLINE, l'acconto con MIXED, niente con DIRECT. */
export function quoteOnlineAmountEurCents(choice: JobPaymentChoice, depositPercent: number, totalMaxEurCents: number): number {
  if (choice === "ONLINE") return totalMaxEurCents;
  if (choice === "MIXED") return onlineDepositEurCents(totalMaxEurCents, depositPercent);
  return 0;
}

/** Frase per il professionista quando un modo online supera il tetto, null se va bene. */
export function onlineLimitProblem(input: {
  paymentOptions: JobPaymentChoice[];
  depositPercent: number;
  totalMaxEurCents: number;
  limitEurCents: number | null;
}): string | null {
  const limit = input.limitEurCents;
  if (limit === null) return null;
  const over = input.paymentOptions.filter((choice) => quoteOnlineAmountEurCents(choice, input.depositPercent, input.totalMaxEurCents) > limit);
  if (over.length === 0) return null;
  const amount = formatEur(limit);
  if (over.includes("ONLINE") && !over.includes("MIXED")) {
    return `Online puoi chiedere fino a ${amount} per lavoro: scegli "Acconto online e saldo diretto" oppure il pagamento diretto.`;
  }
  return `Online puoi chiedere fino a ${amount} per lavoro: abbassa l'acconto online o scegli il pagamento diretto.`;
}

/** Frase per chi chiude un lavoro pagato tutto online con un importo sopra il tetto. */
export function onlineLimitCompletionProblem(limitEurCents: number): string {
  const amount = formatEur(limitEurCents);
  return `Questo lavoro si paga online e online puoi incassare fino a ${amount}. Indica ${amount} e fatti pagare il resto direttamente dal cliente.`;
}

/** Riga per il modulo del preventivo, sotto i modi di pagamento. */
export function onlineLimitHint(limitEurCents: number | null): string | null {
  if (limitEurCents === null) return null;
  return `Online puoi chiedere fino a ${formatEur(limitEurCents)} per lavoro. Il limite sparisce dopo ${ONLINE_LIMIT_FREE_JOBS} lavori pagati online.`;
}

/** Admin → Pagamenti: togliere o rimettere il tetto a un professionista. */
export const setOnlineLimitSchema = z.object({ removed: z.boolean() });
export type SetOnlineLimitInput = z.infer<typeof setOnlineLimitSchema>;

export type AdminOnlineLimitRow = {
  professionalProfileId: string;
  businessName: string;
  city: string;
  /** null = nessun tetto. */
  limitEurCents: number | null;
  cleanJobs: number;
  firstCleanJobAt: string | null;
  removedByAdminAt: string | null;
};
