import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import Stripe from "stripe";
import type { PrismaClient } from "@professionisti/database";
import { PRISMA } from "../prisma/prisma.module";
import { AuditLogService } from "../audit-log/audit-log.service";

/**
 * Rimborsi (CLAUDE.md §88) — richiedibile da cliente o professionista su un
 * JobPayment esistente. L'approvazione è sempre un'azione admin (mai
 * automatica): per un JobPayment MANOVIA con Stripe configurato tenta un
 * vero `stripe.refunds.create`; per DIRECT non c'è alcun movimento reale da
 * annullare su Stripe (il denaro non è mai passato dalla piattaforma), la
 * "elaborazione" è solo un cambio di stato che documenta l'accordo preso
 * fuori piattaforma.
 */
@Injectable()
export class RefundsService {
  private readonly stripe: Stripe | null;

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly auditLogService: AuditLogService,
  ) {
    this.stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;
  }

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

    let stripeRefundId: string | undefined;
    if (refund.jobPayment.paymentMethod === "MANOVIA" && refund.jobPayment.stripePaymentIntentId) {
      if (!this.stripe) {
        throw new BadRequestException("Rimborso Stripe non configurato su questo ambiente (STRIPE_SECRET_KEY mancante).");
      }
      const stripeRefund = await this.stripe.refunds.create({
        payment_intent: refund.jobPayment.stripePaymentIntentId,
        amount: refund.amountEurCents,
      });
      stripeRefundId = stripeRefund.id;
    }

    const processed = await this.prisma.refund.update({
      where: { id: refundId },
      data: { status: "PROCESSED", processedAt: new Date(), stripeRefundId },
    });
    await this.prisma.jobPayment.update({ where: { id: refund.jobPaymentId }, data: { status: "REFUNDED" } });
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
