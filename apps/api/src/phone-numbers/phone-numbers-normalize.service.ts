import { Inject, Injectable, Logger, type OnApplicationBootstrap } from "@nestjs/common";
import type { PrismaClient } from "@professionisti/database";
import { normalizePhoneNumber } from "@professionisti/shared";
import { PRISMA } from "../prisma/prisma.module";

/** Già nel formato "+39 3331234567": niente da fare. */
const NORMALIZED = /^\+\d{1,4} \d+$/;

/** Nuovo valore da salvare, o `null` se il numero è già a posto (o non si può sistemare). */
export function phoneToNormalize(value: string | null): string | null {
  if (!value || NORMALIZED.test(value)) return null;
  const normalized = normalizePhoneNumber(value);
  return normalized && normalized !== value ? normalized : null;
}

/**
 * Porta nel formato unico "+39 3331234567" i numeri salvati prima di
 * docs/CHANGELOG.md §214 (account, richieste, lavori). Gira a ogni avvio
 * come `CategoriesSeedService`, ma tocca solo i numeri non ancora a posto,
 * quindi dopo il primo giro non fa nulla. Due account con lo stesso numero
 * scritto in modi diversi non vengono uniti: il secondo resta com'è e
 * finisce nel log, da sistemare a mano.
 */
@Injectable()
export class PhoneNumbersNormalizeService implements OnApplicationBootstrap {
  private readonly logger = new Logger(PhoneNumbersNormalizeService.name);

  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  async onApplicationBootstrap() {
    try {
      await this.normalizeAll();
    } catch (error) {
      // Mai bloccare l'avvio dell'API per questo.
      this.logger.error(`Sistemazione dei numeri di telefono non riuscita: ${error instanceof Error ? error.message : error}`);
    }
  }

  async normalizeAll() {
    let changed = 0;
    const users = await this.prisma.user.findMany({ where: { phone: { not: null } }, select: { id: true, phone: true } });
    for (const user of users) {
      const next = phoneToNormalize(user.phone);
      if (!next) continue;
      const taken = await this.prisma.user.findFirst({ where: { phone: next, id: { not: user.id } }, select: { id: true } });
      if (taken) {
        this.logger.warn(`Numero di telefono dell'account ${user.id} uguale a quello dell'account ${taken.id}: lasciato com'è.`);
        continue;
      }
      await this.prisma.user.update({ where: { id: user.id }, data: { phone: next } });
      changed++;
    }

    const requests = await this.prisma.guidedRequest.findMany({ where: { recipientPhone: { not: null } }, select: { id: true, recipientPhone: true } });
    for (const request of requests) {
      const next = phoneToNormalize(request.recipientPhone);
      if (!next) continue;
      await this.prisma.guidedRequest.update({ where: { id: request.id }, data: { recipientPhone: next } });
      changed++;
    }

    const bookings = await this.prisma.booking.findMany({ where: { recipientPhone: { not: null } }, select: { id: true, recipientPhone: true } });
    for (const booking of bookings) {
      const next = phoneToNormalize(booking.recipientPhone);
      if (!next) continue;
      await this.prisma.booking.update({ where: { id: booking.id }, data: { recipientPhone: next } });
      changed++;
    }

    if (changed > 0) this.logger.log(`Numeri di telefono portati nel formato "+39 …": ${changed}.`);
  }
}
