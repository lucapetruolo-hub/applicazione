import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import Stripe from "stripe";
import type { PrismaClient } from "@professionisti/database";
import { checkIban, maskIban, type PayoutIbanInput, type PayoutIbanStripeCheck } from "@professionisti/shared";
import { PRISMA } from "../prisma/prisma.module";
import { AuditLogService } from "../audit-log/audit-log.service";
import { encryptFiscal } from "../common/fiscal-crypto";

/** Ricontrollo con Stripe al massimo ogni 10 minuti (esito non definitivo) o ogni giorno (esito già positivo). */
const RECHECK_PENDING_MS = 10 * 60 * 1000;
const RECHECK_MATCH_MS = 24 * 60 * 60 * 1000;

export type PayoutAccountView = {
  maskedIban: string;
  holderName: string;
  stripeCheck: PayoutIbanStripeCheck | null;
  stripeCheckedAt: string | null;
  updatedAt: string;
};

/**
 * Paese e ultime 4 cifre dei conti bancari che il professionista ha indicato
 * a Stripe. Possibile solo con account creati dalla piattaforma (non con
 * Standard collegato via OAuth, piano DAC7 sez. 4). Un solo punto che parla
 * con Stripe, così il thread Stripe può cambiarlo senza toccare il resto.
 */
export async function readStripeBankAccounts(stripe: Stripe, accountId: string): Promise<{ country: string; last4: string }[]> {
  const list = await stripe.accounts.listExternalAccounts(accountId, { object: "bank_account", limit: 10 });
  return list.data
    .filter((item): item is Stripe.BankAccount => item.object === "bank_account")
    .map((item) => ({ country: (item.country ?? "").toUpperCase(), last4: item.last4 }));
}

export function compareWithStripe(iban: { country: string; last4: string }, stripeAccounts: { country: string; last4: string }[] | null): PayoutIbanStripeCheck {
  if (!stripeAccounts || stripeAccounts.length === 0) return "UNAVAILABLE";
  return stripeAccounts.some((acc) => acc.last4 === iban.last4 && acc.country === iban.country) ? "MATCH" : "MISMATCH";
}

/**
 * IBAN per la DAC7 (decisione D4 di Luca, docs/CHANGELOG.md §243): lo scrive
 * solo chi attiva i pagamenti online, perché Stripe non ce lo dà in chiaro.
 * Controllato (mod-97), salvato cifrato, mai restituito intero: al
 * professionista torna solo mascherato. Confrontato con le ultime 4 cifre
 * del conto indicato a Stripe; un esito diverso non blocca i pagamenti, lo
 * segnala al professionista (e al file DAC7).
 */
@Injectable()
export class PayoutAccountService {
  private readonly logger = new Logger(PayoutAccountService.name);
  private readonly stripe: Stripe | null;

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly auditLogService: AuditLogService,
  ) {
    this.stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;
  }

  private async myFiscalProfile(userId: string) {
    const profile = await this.prisma.professionalProfile.findUnique({ where: { userId }, select: { id: true } });
    if (!profile) throw new NotFoundException("Completa prima il tuo profilo professionista.");
    return this.prisma.professionalFiscalProfile.findUnique({ where: { professionalProfileId: profile.id }, include: { payoutAccount: true } });
  }

  private view(account: { ibanCountry: string; ibanLast4: string; holderName: string; stripeCheck: string | null; stripeCheckedAt: Date | null; updatedAt: Date }): PayoutAccountView {
    return {
      maskedIban: maskIban(account.ibanCountry, account.ibanLast4),
      holderName: account.holderName,
      stripeCheck: (account.stripeCheck as PayoutIbanStripeCheck | null) ?? null,
      stripeCheckedAt: account.stripeCheckedAt?.toISOString() ?? null,
      updatedAt: account.updatedAt.toISOString(),
    };
  }

  private async stripeCheck(stripeAccountId: string | null, iban: { country: string; last4: string }): Promise<PayoutIbanStripeCheck> {
    if (!this.stripe || !stripeAccountId) return "UNAVAILABLE";
    try {
      return compareWithStripe(iban, await readStripeBankAccounts(this.stripe, stripeAccountId));
    } catch (err) {
      this.logger.warn(`Conti Stripe di ${stripeAccountId} non leggibili: ${err instanceof Error ? err.message : String(err)}`);
      return "UNAVAILABLE";
    }
  }

  async getMine(userId: string): Promise<PayoutAccountView | null> {
    const fiscal = await this.myFiscalProfile(userId);
    const account = fiscal?.payoutAccount;
    if (!fiscal || !account) return null;
    // Il professionista può aver appena cambiato il conto su Stripe: si
    // ricontrolla qui invece di aspettare un webhook.
    const age = account.stripeCheckedAt ? Date.now() - account.stripeCheckedAt.getTime() : Infinity;
    if (age > (account.stripeCheck === "MATCH" ? RECHECK_MATCH_MS : RECHECK_PENDING_MS)) {
      const check = await this.stripeCheck(fiscal.stripeConnectAccountId, { country: account.ibanCountry, last4: account.ibanLast4 });
      const updated = await this.prisma.professionalPayoutAccount.update({ where: { id: account.id }, data: { stripeCheck: check, stripeCheckedAt: new Date() } });
      return this.view(updated);
    }
    return this.view(account);
  }

  async saveMine(userId: string, input: PayoutIbanInput): Promise<PayoutAccountView> {
    const fiscal = await this.myFiscalProfile(userId);
    if (!fiscal?.stripeConnectAccountId) {
      throw new BadRequestException("L'IBAN serve solo per i pagamenti online: attivali prima con Stripe.");
    }
    const result = checkIban(input.iban);
    if (!result.ok) throw new BadRequestException(result.message);

    const country = result.iban.slice(0, 2);
    const last4 = result.iban.slice(-4);
    const check = await this.stripeCheck(fiscal.stripeConnectAccountId, { country, last4 });
    const data = {
      ibanEncrypted: encryptFiscal(result.iban),
      ibanCountry: country,
      ibanLast4: last4,
      holderName: input.holderName.trim(),
      stripeCheck: check,
      stripeCheckedAt: new Date(),
    };
    const account = await this.prisma.professionalPayoutAccount.upsert({
      where: { fiscalProfileId: fiscal.id },
      update: data,
      create: { fiscalProfileId: fiscal.id, ...data },
    });
    // Nel registro solo la versione mascherata: l'IBAN intero non esce mai dalla colonna cifrata.
    await this.auditLogService.record({
      entityType: "ProfessionalFiscalProfile",
      entityId: fiscal.id,
      fieldName: "payoutIban",
      oldValue: fiscal.payoutAccount ? maskIban(fiscal.payoutAccount.ibanCountry, fiscal.payoutAccount.ibanLast4) : null,
      newValue: { iban: maskIban(country, last4), holderName: data.holderName, stripeCheck: check },
      changedByUserId: userId,
      reason: "IBAN per la DAC7 indicato dal professionista.",
    });
    return this.view(account);
  }
}
