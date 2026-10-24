import { Inject, Injectable, Logger, type OnApplicationBootstrap } from "@nestjs/common";
import { prisma as rawPrisma, type PrismaClient } from "@professionisti/database";
import { PRISMA } from "../prisma/prisma.module";
import { isEncryptedFiscal, readFiscal, reencryptLegacyFiscal } from "../common/fiscal-crypto";

/**
 * All'avvio cifra i codici fiscali salvati in chiaro prima del §287 e
 * ricifra con `FISCAL_DATA_KEY` quelli cifrati con la chiave vecchia. Legge
 * dal client senza estensione (vede il dato com'è nel database) e scrive con
 * quello dell'API, che cifra da solo. Un errore qui non ferma mai l'avvio.
 */
@Injectable()
export class FiscalEncryptionMigrationService implements OnApplicationBootstrap {
  private readonly logger = new Logger(FiscalEncryptionMigrationService.name);

  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      const updated = (await this.migrateProfiles()) + (await this.migrateRepresentatives()) + (await this.migrateTaxIdChecks());
      if (updated > 0) this.logger.log(`Codici fiscali cifrati o ricifrati: ${updated}.`);
    } catch (err) {
      this.logger.error(`Cifratura dei codici fiscali non riuscita: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private async migrateProfiles(): Promise<number> {
    const rows = await rawPrisma.professionalFiscalProfile.findMany({ where: { fiscalCodiceFiscale: { not: null } }, select: { id: true, fiscalCodiceFiscale: true } });
    let updated = 0;
    for (const row of rows) {
      const plain = toRewrite(row.fiscalCodiceFiscale);
      if (plain === null) continue;
      await this.prisma.professionalFiscalProfile.update({ where: { id: row.id }, data: { fiscalCodiceFiscale: plain } });
      updated += 1;
    }
    return updated;
  }

  private async migrateRepresentatives(): Promise<number> {
    const rows = await rawPrisma.fiscalRepresentative.findMany({ where: { codiceFiscale: { not: null } }, select: { id: true, codiceFiscale: true } });
    let updated = 0;
    for (const row of rows) {
      const plain = toRewrite(row.codiceFiscale);
      if (plain === null) continue;
      await this.prisma.fiscalRepresentative.update({ where: { id: row.id }, data: { codiceFiscale: plain } });
      updated += 1;
    }
    return updated;
  }

  private async migrateTaxIdChecks(): Promise<number> {
    const rows = await rawPrisma.taxIdCheck.findMany({ select: { id: true, value: true } });
    let updated = 0;
    for (const row of rows) {
      const plain = toRewrite(row.value);
      if (plain === null) continue;
      await this.prisma.taxIdCheck.update({ where: { id: row.id }, data: { value: plain } });
      updated += 1;
    }
    return updated;
  }
}

/** Il testo in chiaro da riscrivere (il client lo cifra), o null se il dato è già a posto. */
export function toRewrite(stored: string | null): string | null {
  if (!stored) return null;
  if (!isEncryptedFiscal(stored)) return stored;
  return reencryptLegacyFiscal(stored) === null ? null : readFiscal(stored);
}
