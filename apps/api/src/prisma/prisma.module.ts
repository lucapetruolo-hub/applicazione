import { Global, Module } from "@nestjs/common";
import { prisma, type PrismaClient } from "@professionisti/database";
import { fiscalEncryptionExtension } from "../common/fiscal-encryption.extension";

export const PRISMA = "PRISMA";

// Client con il codice fiscale cifrato in automatico (docs/CHANGELOG.md §290):
// le estensioni cambiano solo come si leggono e scrivono quei campi, i tipi
// restano quelli di PrismaClient.
const prismaWithEncryption = prisma.$extends(fiscalEncryptionExtension) as unknown as PrismaClient;

@Global()
@Module({
  providers: [{ provide: PRISMA, useValue: prismaWithEncryption }],
  exports: [PRISMA],
})
export class PrismaModule {}
