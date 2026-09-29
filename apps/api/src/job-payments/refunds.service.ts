import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { PrismaClient } from "@professionisti/database";
import { PRISMA } from "../prisma/prisma.module";
import { AuditLogService } from "../audit-log/audit-log.service";
import { OnlineMoneyService } from "./online-money.service";

/**
 * Rimborsi (CLAUDE.md §88) — richiedibile da cliente o professionista su un
 * JobPayment esistente. L'approvazione è sempre un'azione admin (mai
 * automatica): per un JobPayment MANOVIA rimborsa con Stripe tramite
 * OnlineMoneyService (acconto e saldo, storno del trasferimento se già
 * passato al professionista, §168); per DIRECT non c'è alcun movimento reale da
 * annullare su Stripe (il denaro non è mai passato dalla piattaforma), la
 * "elaborazione" è solo un cambio di stato che documenta l'accordo preso
 * fuori piattaforma.
 */
@Injectable()
export class RefundsService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly auditLogService: AuditLogService,
    private readonly onlineMoneyService: OnlineMoneyService,
  ) {}

  async request(userId: string, bookingId: string, input: { amountEurCents: number; reason?: string }) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { professionalProfile: true, jobPayment: true },
    });
    if (!booking) throw new NotFoundException("Prenotazione non trovata.");
    if (booking.clientId !== userId && booking.professionalProfile.userId !== userId) {
      throw new ForbiddenException("Non hai accesso a questa prenotazione.");
    }
    if (!booking.jobPayment) {
      throw new BadRequestException("Nessun pagamento associato a questo lavoro.");
    }
    if (input.amountEurCents <= 0 || input.amountEurCents > booking.jobPayment.grossAmountEurCents) {
      throw new BadRequestException("Importo del rimborso non valido.");
    }

    const refund = await this.prisma.refund.create({
      data: {
        jobPaymentId: booking.jobPayment.id,
        amountEurCents: input.amountEurCents,
        reason: input.reason || null,
        requestedById: userId,
      },
    });
    await this.auditLogService.record({
      entityType: "Refund",
      entityId: refund.id,
      newValue: { amountEurCents: input.amountEurCents, jobPaymentId: booking.jobPayment.id },
      changedByUserId: userId,
      reason: "Richiesta di rimborso.",
    });
    return refund;
  }

  async listAll() {
    return this.prisma.refund.findMany({
      orderBy: { createdAt: "desc" },
      include: { jobPayment: { include: { booking: { include: { professionalProfile: true } } } } },
    });
  }

  /** Decisione admin (mai automatica) — per un rifiuto basta lo status, nessun movimento di denaro. */
  async decide(refundId: string, decision: "APPROVED" | "REJECTED", adminUserId: string) {
    const refund = await this.prisma.refund.findUnique({ where: { id: refundId }, include: { jobPayment: true } });
    if (!refund) throw new NotFoundException("Rimborso non trovato.");
    if (refund.status !== "REQUESTED") {
      throw new BadRequestException("Questo rimborso è già stato deciso.");
    }

    if (decision === "REJECTED") {
      const updated = await this.prisma.refund.update({ where: { id: refundId }, data: { status: "REJECTED" } });
      await this.auditLogService.record({
        entityType: "Refund",
        entityId: refundId,
        fieldName: "status",
        oldValue: "REQUESTED",
        newValue: "REJECTED",
        changedByUserId: adminUserId,
      });
      return updated;
    }

    await this.prisma.refund.update({ where: { id: refundId }, data: { status: "APPROVED" } });

    // Pagamento online (§168): rimborso Stripe spalmato su acconto e saldo;
    // se i soldi erano già passati al professionista, la sua quota viene
    // ripresa dal suo conto Stripe (storno del trasferimento).
    if (refund.jobPayment.paymentMethod === "MANOVIA") {
      await this.onlineMoneyService.refundOnline(refund.jobPaymentId, refund.amountEurCents, refund.reason ?? "Rimborso approvato dalla Finanza.", adminUserId);
    }

    const processed = await this.prisma.refund.update({
      where: { id: refundId },
      data: { status: "PROCESSED", processedAt: new Date() },
    });
    if (refund.jobPayment.paymentMethod === "DIRECT") {
      await this.prisma.jobPayment.update({ where: { id: refund.jobPaymentId }, data: { status: "REFUNDED" } });
    }
    await this.auditLogService.record({
      entityType: "Refund",
      entityId: refundId,
      fieldName: "status",
      oldValue: "APPROVED",
      newValue: "PROCESSED",
      changedByUserId: adminUserId,
      reason: refund.jobPayment.paymentMethod === "DIRECT" ? "Nessun movimento Stripe: pagamento diretto, rimborso concordato fuori piattaforma." : undefined,
    });
    return processed;
  }
}
