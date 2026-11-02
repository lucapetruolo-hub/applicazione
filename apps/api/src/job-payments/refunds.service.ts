import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { PrismaClient } from "@professionisti/database";
import { PRISMA } from "../prisma/prisma.module";
import { bookingSearchWhere, searchEurCents } from "../admin/admin-search";
import { AuditLogService } from "../audit-log/audit-log.service";
import { NotificationsService } from "../notifications/notifications.service";
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
    private readonly notificationsService: NotificationsService,
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

  /** Tutti, il più recente prima; con `q` cerca per cliente, professionista, motivo, cifra o codice. */
  async listAll(q = "") {
    const booking = bookingSearchWhere(q);
    const cents = searchEurCents(q);
    const text = { contains: q.trim(), mode: "insensitive" as const };
    return this.prisma.refund.findMany({
      where: booking ? { OR: [{ jobPayment: { booking } }, { reason: text }, { id: text }, ...(cents ? [{ amountEurCents: cents }] : [])] } : undefined,
      orderBy: { createdAt: "desc" },
      take: booking ? 200 : undefined,
      include: { jobPayment: { include: { booking: { include: { professionalProfile: true, client: { select: { name: true, surname: true, deletedAt: true } } } } } } },
    });
  }

  /**
   * Decisione admin (mai automatica). Un rifiuto ha sempre un motivo, detto
   * a chi aveva chiesto il rimborso; se Stripe non risponde dopo "Approva"
   * il rimborso torna da decidere invece di restare fermo (admin-riordino).
   */
  async decide(refundId: string, decision: "APPROVED" | "REJECTED", adminUserId: string, note?: string) {
    const refund = await this.prisma.refund.findUnique({ where: { id: refundId }, include: { jobPayment: { include: { booking: { select: { id: true, clientId: true, quote: { select: { guidedRequestId: true } } } } } } } });
    if (!refund) throw new NotFoundException("Rimborso non trovato.");
    if (refund.status !== "REQUESTED") {
      throw new BadRequestException("Questo rimborso è già stato deciso.");
    }

    if (decision === "REJECTED") {
      const reason = note?.trim();
      if (!reason) throw new BadRequestException("Scrivi il motivo del rifiuto.");
      const updated = await this.prisma.refund.update({ where: { id: refundId }, data: { status: "REJECTED" } });
      await this.auditLogService.record({
        entityType: "Refund",
        entityId: refundId,
        fieldName: "status",
        oldValue: "REQUESTED",
        newValue: "REJECTED",
        changedByUserId: adminUserId,
        reason,
      });
      await this.notificationsService.notify(refund.requestedById, "JOB_REFUND_REJECTED", {
        bookingId: refund.jobPayment.booking.id,
        guidedRequestId: refund.jobPayment.booking.quote?.guidedRequestId ?? null,
        amountEurCents: refund.amountEurCents,
        audience: refund.requestedById === refund.jobPayment.booking.clientId ? "CLIENT" : "PROFESSIONAL",
        note: reason,
      });
      return updated;
    }

    // Una sola approvazione anche con due tocchi insieme.
    const claimed = await this.prisma.refund.updateMany({ where: { id: refundId, status: "REQUESTED" }, data: { status: "APPROVED" } });
    if (claimed.count === 0) throw new BadRequestException("Questo rimborso è già stato deciso.");

    // Pagamento online (§168): rimborso Stripe spalmato su acconto e saldo;
    // se i soldi erano già passati al professionista, la sua quota viene
    // ripresa dal suo conto Stripe (storno del trasferimento).
    if (refund.jobPayment.paymentMethod === "MANOVIA") {
      // Rimborso di una segnalazione accolta passato alla Finanza: colpa del professionista (§267).
      const issue = await this.prisma.jobIssue.findUnique({ where: { bookingId: refund.jobPayment.bookingId }, select: { status: true } });
      try {
        await this.onlineMoneyService.refundOnline(refund.jobPaymentId, refund.amountEurCents, refund.reason ?? "Rimborso approvato dalla Finanza.", adminUserId, {
          professionalFault: issue?.status === "UPHELD",
        });
      } catch (err) {
        await this.prisma.refund.update({ where: { id: refundId }, data: { status: "REQUESTED" } });
        throw new BadRequestException(`Stripe non ha eseguito il rimborso (${(err as Error).message}): resta da decidere, riprova tra poco.`);
      }
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
      reason: [note?.trim(), refund.jobPayment.paymentMethod === "DIRECT" ? "Nessun movimento Stripe: pagamento diretto, rimborso concordato fuori piattaforma." : ""].filter(Boolean).join(" ") || undefined,
    });
    return processed;
  }
}
