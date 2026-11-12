import { BadRequestException, Inject, Injectable, Logger, NotFoundException, type OnApplicationBootstrap } from "@nestjs/common";
import Stripe from "stripe";
import type { PrismaClient } from "@professionisti/database";
import { checkIban, maskIban, type PayoutIbanInput, type PayoutIbanStripeCheck } from "@professionisti/shared";
import { PRISMA } from "../prisma/prisma.module";
import { AuditLogService } from "../audit-log/audit-log.service";
import { NotificationsService } from "../notifications/notifications.service";
import { encryptFiscal, reencryptLegacyFiscal } from "../common/fiscal-crypto";

/** Ricontrollo con Stripe al massimo ogni 10 minuti (esito non definitivo) o ogni giorno (esito già positivo). */
const RECHECK_PENDING_MS = 10 * 60 * 1000;
const RECHECK_MATCH_MS = 24 * 60 * 60 * 1000;

export type PayoutAccountView = {
  maskedIban: string;
  holderName: string;
  stripeCheck: PayoutIbanStripeCheck | null;
  stripeCheckedAt: string | null;
  updatedAt: string;
  /**
   * Ultime 4 cifre del conto su Stripe, solo quando non corrisponde: la
   * pagina le mostra accanto all'avviso (docs/changelog/2026-11-12-notifiche-positive-verdi.md).
   */
  stripeLast4: string | null;
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
 * Un momento in cui Stripe non risponde (o non mostra i conti) non cancella
 * l'ultimo esito vero: altrimenti al giro dopo "IBAN diverso" sembrava una
 * novità e arrivava di nuovo la notifica
 * (docs/changelog/2026-11-12-notifiche-positive-verdi.md). Vale solo per
 * il ricontrollo dello stesso IBAN: quando il professionista ne scrive uno
 * nuovo, l'esito riparte da capo.
 */
export function keepKnownCheck(previous: string | null, fresh: PayoutIbanStripeCheck): PayoutIbanStripeCheck {
  if (fresh === "UNAVAILABLE" && (previous === "MATCH" || previous === "MISMATCH")) return previous;
  return fresh;
}

/**
 * IBAN per la DAC7 (decisione D4 di Luca, docs/CHANGELOG.md §246): lo scrive
 * solo chi attiva i pagamenti online, perché Stripe non ce lo dà in chiaro.
 * Controllato (mod-97), salvato cifrato, mai restituito intero: al
 * professionista torna solo mascherato. Confrontato con le ultime 4 cifre
 * del conto indicato a Stripe; un esito diverso non blocca i pagamenti, lo
 * segnala al professionista (e al file DAC7).
 */
@Injectable()
export class PayoutAccountService implements OnApplicationBootstrap {
  private readonly logger = new Logger(PayoutAccountService.name);
  private readonly stripe: Stripe | null;

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly auditLogService: AuditLogService,
    private readonly notificationsService: NotificationsService,
  ) {
    this.stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;
  }

  /**
   * Appena si imposta `FISCAL_DATA_KEY`, gli IBAN cifrati prima con la chiave
   * derivata da `JWT_SECRET` vengono ricifrati con quella nuova (controllo
   * sicurezza, docs/CHANGELOG.md §292). Senza la variabile non fa nulla; un
   * errore qui non deve mai fermare l'avvio.
   */
  async onApplicationBootstrap(): Promise<void> {
    if (!process.env.FISCAL_DATA_KEY?.trim()) return;
    try {
      const accounts = await this.prisma.professionalPayoutAccount.findMany({ select: { id: true, ibanEncrypted: true } });
      let updated = 0;
      for (const account of accounts) {
        const reencrypted = reencryptLegacyFiscal(account.ibanEncrypted);
        if (!reencrypted) continue;
        await this.prisma.professionalPayoutAccount.update({ where: { id: account.id }, data: { ibanEncrypted: reencrypted } });
        updated += 1;
      }
      if (updated > 0) this.logger.log(`IBAN ricifrati con FISCAL_DATA_KEY: ${updated}.`);
    } catch (err) {
      this.logger.error(`Ricifratura degli IBAN non riuscita: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private async myFiscalProfile(userId: string) {
    const profile = await this.prisma.professionalProfile.findUnique({ where: { userId }, select: { id: true } });
    if (!profile) throw new NotFoundException("Completa prima il tuo profilo professionista.");
    return this.prisma.professionalFiscalProfile.findUnique({ where: { professionalProfileId: profile.id }, include: { payoutAccount: true } });
  }

  private view(
    account: { ibanCountry: string; ibanLast4: string; holderName: string; stripeCheck: string | null; stripeCheckedAt: Date | null; updatedAt: Date },
    stripeLast4: string | null = null,
  ): PayoutAccountView {
    return {
      stripeLast4: account.stripeCheck === "MISMATCH" ? stripeLast4 : null,
      maskedIban: maskIban(account.ibanCountry, account.ibanLast4),
      holderName: account.holderName,
      stripeCheck: (account.stripeCheck as PayoutIbanStripeCheck | null) ?? null,
      stripeCheckedAt: account.stripeCheckedAt?.toISOString() ?? null,
      updatedAt: account.updatedAt.toISOString(),
    };
  }

  /** Esito del confronto e ultime 4 cifre del conto su Stripe (per dirle al professionista). */
  private async stripeComparison(
    stripeAccountId: string | null,
    iban: { country: string; last4: string },
  ): Promise<{ check: PayoutIbanStripeCheck; stripeLast4: string | null }> {
    if (!this.stripe || !stripeAccountId) return { check: "UNAVAILABLE", stripeLast4: null };
    try {
      const accounts = await readStripeBankAccounts(this.stripe, stripeAccountId);
      return { check: compareWithStripe(iban, accounts), stripeLast4: accounts[0]?.last4 ?? null };
    } catch (err) {
      this.logger.warn(`Conti Stripe di ${stripeAccountId} non leggibili: ${err instanceof Error ? err.message : String(err)}`);
      return { check: "UNAVAILABLE", stripeLast4: null };
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
      const fresh = await this.stripeComparison(fiscal.stripeConnectAccountId, { country: account.ibanCountry, last4: account.ibanLast4 });
      const check = keepKnownCheck(account.stripeCheck, fresh.check);
      const updated = await this.prisma.professionalPayoutAccount.update({ where: { id: account.id }, data: { stripeCheck: check, stripeCheckedAt: new Date() } });
      return this.view(updated, fresh.stripeLast4);
    }
    // Conto diverso: le cifre di Stripe si leggono ogni volta (non le salviamo).
    if (account.stripeCheck === "MISMATCH") {
      const fresh = await this.stripeComparison(fiscal.stripeConnectAccountId, { country: account.ibanCountry, last4: account.ibanLast4 });
      return this.view(account, fresh.stripeLast4);
    }
    return this.view(account);
  }

  /**
   * Ricontrollo quando Stripe avvisa che l'account è cambiato (webhook
   * `account.updated`, docs/CHANGELOG.md §247): se il conto non corrisponde
   * più, il professionista lo sa subito invece che alla prossima visita.
   */
  async recheckForStripeAccount(stripeAccountId: string): Promise<void> {
    const fiscal = await this.prisma.professionalFiscalProfile.findUnique({
      where: { stripeConnectAccountId: stripeAccountId },
      include: { payoutAccount: true, professionalProfile: { select: { userId: true } } },
    });
    const account = fiscal?.payoutAccount;
    if (!fiscal || !account) return;
    const fresh = await this.stripeComparison(stripeAccountId, { country: account.ibanCountry, last4: account.ibanLast4 });
    const check = keepKnownCheck(account.stripeCheck, fresh.check);
    const { stripeLast4 } = fresh;
    // Durante l'attivazione Stripe manda più `account.updated` quasi insieme:
    // lette in parallelo, ognuna vedeva ancora l'esito vecchio e mandava la
    // sua notifica (IBAN segnalato due volte, docs/changelog/2026-11-12-notifiche-positive-verdi.md).
    // Il cambio di esito si scrive solo se nel frattempo nessuno l'ha già
    // scritto: Postgres mette in fila le due scritture e la seconda non
    // trova più la riga da cambiare, quindi avvisa una volta sola.
    const changed = await this.prisma.professionalPayoutAccount.updateMany({
      where: { id: account.id, OR: [{ stripeCheck: null }, { stripeCheck: { not: check } }] },
      data: { stripeCheck: check, stripeCheckedAt: new Date() },
    });
    if (changed.count === 0) {
      await this.prisma.professionalPayoutAccount.update({ where: { id: account.id }, data: { stripeCheckedAt: new Date() } });
      return;
    }
    const userId = fiscal.professionalProfile.userId;
    if (check === "MISMATCH") {
      await this.notificationsService.notify(userId, "PAYOUT_IBAN_MISMATCH", { ibanLast4: account.ibanLast4, stripeLast4 });
    } else if (check === "MATCH" && account.stripeCheck === "MISMATCH") {
      // Il professionista ha sistemato il conto su Stripe: lo sa anche lui.
      await this.notificationsService.notify(userId, "PAYOUT_IBAN_MATCHED", { ibanLast4: account.ibanLast4 });
    }
  }

  async saveMine(userId: string, input: PayoutIbanInput): Promise<PayoutAccountView> {
    // Primo passo di "Attiva i pagamenti online", prima di Stripe
    // (docs/CHANGELOG.md §250): l'account Stripe può non esistere ancora.
    const fiscal =
      (await this.myFiscalProfile(userId)) ??
      (await this.prisma.professionalFiscalProfile.create({
        data: { professionalProfileId: (await this.prisma.professionalProfile.findUniqueOrThrow({ where: { userId }, select: { id: true } })).id },
        include: { payoutAccount: true },
      }));
    const result = checkIban(input.iban);
    if (!result.ok) throw new BadRequestException(result.message);

    const country = result.iban.slice(0, 2);
    const last4 = result.iban.slice(-4);
    const { check, stripeLast4 } = await this.stripeComparison(fiscal.stripeConnectAccountId, { country, last4 });
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
    return this.view(account, stripeLast4);
  }
}
