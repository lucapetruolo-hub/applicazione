import { Inject, Injectable } from "@nestjs/common";
import type { PrismaClient } from "@professionisti/database";
import { PRISMA } from "../prisma/prisma.module";

/**
 * Log di audit generico su ogni modifica a un dato finanziario/fiscale —
 * richiesta esplicita della specifica "MANOVIA" fornita dall'utente
 * (CLAUDE.md §88): "mai sovrascrivere un dato fiscale senza uno storico
 * versionato", "ogni cambio di payment_method deve produrre un audit log".
 * Punto unico di scrittura, richiamato esplicitamente da ogni service che
 * compie la modifica — stessa convenzione già in uso in tutto il progetto
 * (es. NotificationsService.notify()), mai un trigger/middleware Prisma.
 */
@Injectable()
export class AuditLogService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  async record(params: {
    entityType: string;
    entityId: string;
    fieldName?: string | null;
    oldValue?: unknown;
    newValue?: unknown;
    changedByUserId?: string | null;
    reason?: string | null;
  }): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        entityType: params.entityType,
        entityId: params.entityId,
        fieldName: params.fieldName ?? null,
        oldValue: params.oldValue === undefined ? null : serialize(params.oldValue),
        newValue: params.newValue === undefined ? null : serialize(params.newValue),
        changedByUserId: params.changedByUserId ?? null,
        reason: params.reason ?? null,
      },
    });
  }

  /** Cronologia di un'entità specifica (es. tutte le modifiche a un ProfessionalFiscalProfile). */
  async history(entityType: string, entityId: string) {
    return this.prisma.auditLog.findMany({
      where: { entityType, entityId },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
  }
}

function serialize(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
