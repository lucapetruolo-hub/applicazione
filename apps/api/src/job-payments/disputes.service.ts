import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { PrismaClient } from "@professionisti/database";
import { PRISMA } from "../prisma/prisma.module";
import { AuditLogService } from "../audit-log/audit-log.service";

/** Contestazioni su un JobPayment (CLAUDE.md §88) — sempre risolte da un admin, mai automaticamente. */
@Injectable()
export class DisputesService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly auditLogService: AuditLogService,
  ) {}

  async open(userId: string, bookingId: string, reason: string) {
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

    const dispute = await this.prisma.dispute.create({
      data: { jobPaymentId: booking.jobPayment.id, openedById: userId, reason },
    });
    await this.prisma.jobPayment.update({ where: { id: booking.jobPayment.id }, data: { status: "DISPUTED" } });
    await this.auditLogService.record({
      entityType: "Dispute",
      entityId: dispute.id,
      newValue: { reason, jobPaymentId: booking.jobPayment.id },
      changedByUserId: userId,
    });
    return dispute;
  }

  async listAll() {
    return this.prisma.dispute.findMany({
      orderBy: { createdAt: "desc" },
      include: { jobPayment: { include: { booking: { include: { professionalProfile: true } } } } },
    });
  }

  async resolve(disputeId: string, status: "RESOLVED_CLIENT" | "RESOLVED_PROFESSIONAL" | "CLOSED", resolutionNote: string | undefined, adminUserId: string) {
    const dispute = await this.prisma.dispute.findUnique({ where: { id: disputeId } });
    if (!dispute) throw new NotFoundException("Contestazione non trovata.");
    if (dispute.status !== "OPEN" && dispute.status !== "UNDER_REVIEW") {
      throw new BadRequestException("Questa contestazione è già stata chiusa.");
    }

    const updated = await this.prisma.dispute.update({
      where: { id: disputeId },
      data: { status, resolutionNote: resolutionNote || null, resolvedAt: new Date() },
    });
    await this.auditLogService.record({
      entityType: "Dispute",
      entityId: disputeId,
      fieldName: "status",
      oldValue: dispute.status,
      newValue: status,
      changedByUserId: adminUserId,
      reason: resolutionNote,
    });
    return updated;
  }
}
