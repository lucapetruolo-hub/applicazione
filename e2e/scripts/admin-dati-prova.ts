// Dati di prova per l'area Admin (riordino dell'Admin, 30/10/2026): un super
// admin con la verifica in due passaggi attiva e i casi visti nel collaudo del
// 29/10 (problema senza risposta, rimborso, contestazione in banca, recensione
// finta, profilo doppio, account chiuso...). Solo su un database di prova.
//
//   DATABASE_URL=... pnpm --filter @professionisti/e2e exec tsx scripts/admin-dati-prova.ts
//
// Scrive su stdout un JSON con id dell'admin, segreto TOTP e alcuni id utili.
import bcrypt from "bcryptjs";
import { PrismaClient } from "@professionisti/database";

const prisma = new PrismaClient();
const PASSWORD = "Password123!";
const TOTP_SECRET = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";
const now = Date.now();
const hoursAgo = (h: number) => new Date(now - h * 3_600_000);
const inHours = (h: number) => new Date(now + h * 3_600_000);
let seq = 0;

async function main() {
  // Mai sul database vero: crea utenti, pagamenti e contestazioni finti.
  const url = process.env.DATABASE_URL ?? "";
  if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url)) throw new Error("Solo su un database locale (localhost).");
  const hash = await bcrypt.hash(PASSWORD, 10);
  const idraulico = await prisma.category.findFirstOrThrow({ where: { slug: "idraulico" } });
  const elettricista = await prisma.category.findFirstOrThrow({ where: { slug: "elettricista" } });

  async function user(role: "CLIENT" | "PROFESSIONAL" | "ADMIN", name: string, surname: string, extra: Record<string, unknown> = {}) {
    seq += 1;
    return prisma.user.create({
      data: {
        role,
        email: `${name.toLowerCase()}.${surname.toLowerCase().replace(/\W/g, "")}@prova.it`,
        passwordHash: hash,
        name,
        surname,
        phone: `+39333000${String(seq).padStart(4, "0")}`,
        city: "Latina",
        emailVerifiedAt: new Date(),
        legalConsentAt: new Date(),
        ...extra,
      },
    });
  }
  async function pro(name: string, surname: string, businessName: string, categoryId: string, extra: Record<string, unknown> = {}, userExtra: Record<string, unknown> = {}) {
    const u = await user("PROFESSIONAL", name, surname, userExtra);
    const profile = await prisma.professionalProfile.create({
      data: { userId: u.id, categoryId, businessName, city: "Latina", latitude: 41.4677, longitude: 12.9036, ...extra },
    });
    return { user: u, profile };
  }
  async function job(client: { id: string }, profile: { id: string; categoryId: string }, description: string, daysAgo: number, status: "CONFIRMED" | "COMPLETED" | "CANCELED" = "COMPLETED") {
    const request = await prisma.guidedRequest.create({
      data: { clientId: client.id, categoryId: profile.categoryId, description, city: "Latina", createdAt: hoursAgo(daysAgo * 24 + 48) },
    });
    const quote = await prisma.quote.create({
      data: { guidedRequestId: request.id, professionalProfileId: profile.id, estimatedStartDate: hoursAgo(daysAgo * 24), status: "ACCEPTED" },
    });
    const booking = await prisma.booking.create({
      data: {
        quoteId: quote.id,
        clientId: client.id,
        professionalProfileId: profile.id,
        scheduledAt: hoursAgo(daysAgo * 24),
        scheduledEndAt: hoursAgo(daysAgo * 24 - 2),
        status,
        serviceMode: "HOME",
        street: "Via Isonzo",
        houseNumber: "20",
        city: "Latina",
        postalCode: "04100",
        province: "LT",
      },
    });
    return { request, quote, booking };
  }

  const admin = await user("ADMIN", "Luca", "Admin", { adminRoles: ["SUPER"], adminTotpSecret: TOTP_SECRET, adminTotpEnabledAt: hoursAgo(72) });

  const marco = await pro("Marco", "Rossi", "Marco Rossi Idraulica", idraulico.id, { verified: true });
  const luigi = await pro("Luigi", "Bianchi", "Bianchi Impianti Elettrici", elettricista.id);
  // Profilo doppio (collaudo P-05): stesso telefono di Marco, pubblico.
  const doppio = await pro("Marco", "Rossi2", "Collaudo Doppio Marco", idraulico.id);
  // Chiede la verifica.
  const sara = await pro("Sara", "Neri", "Neri Pulizie", idraulico.id, { verificationRequestedAt: hoursAgo(20) });

  const paola = await user("CLIENT", "Paola", "Verdi");
  const piero = await user("CLIENT", "Piero", "Gallo");
  const rita = await user("CLIENT", "Rita", "Fontana");
  const ugo = await user("CLIENT", "Ugo", "Conti");
  const vera = await user("CLIENT", "Vera", "Russo");
  // Account nato 10 minuti prima della recensione, stesso telefono di Paola (collaudo P-04).
  const finto = await user("CLIENT", "Finto", "Cliente", { createdAt: hoursAgo(5) });
  await user("CLIENT", "Anna", "Prova", { testAccountAt: hoursAgo(30) });

  // Recensioni: vere su Marco, finta, una vuota su Luigi.
  for (const [client, rating, comment, days] of [
    [paola, 5, "Puntuale e preciso, ha sistemato la perdita in mezz'ora.", 12],
    [ugo, 4, "Lavoro fatto bene, un po' in ritardo.", 9],
    [vera, 2, "Ha lasciato sporco e il rubinetto gocciola ancora.", 6],
  ] as const) {
    const j = await job(client, marco.profile, "Perdita sotto il lavandino della cucina.", days);
    await prisma.review.create({ data: { bookingId: j.booking.id, rating, comment, createdAt: hoursAgo(days * 24 - 24) } });
  }
  const fintoJob = await job(finto, marco.profile, "Controllo caldaia.", 0.2);
  const fakeReview = await prisma.review.create({ data: { bookingId: fintoJob.booking.id, rating: 5, comment: "Il migliore idraulico di Latina!!! Consigliatissimo", createdAt: hoursAgo(4.8) } });
  const vuota = await job(paola, luigi.profile, "Presa che fa scintille in cucina.", 8);
  await prisma.review.create({ data: { bookingId: vuota.booking.id, rating: 5, comment: null } });

  // Problema sul lavoro senza risposta, passato al team (collaudo P-F1).
  const pieroJob = await job(piero, marco.profile, "Sostituzione scaldabagno.", 2, "CONFIRMED");
  await prisma.jobPayment.create({
    data: { bookingId: pieroJob.booking.id, paymentMethod: "MANOVIA", status: "CONFIRMED", grossAmountEurCents: 15000, platformFeeEurCents: 1281, netAmountEurCents: 13719, paidEurCents: 15000, onlineStage: "PAID" },
  });
  await prisma.jobIssue.create({
    data: { bookingId: pieroJob.booking.id, type: "NO_SHOW", description: "Il professionista non si è presentato e non risponde al telefono.", status: "OPEN", escalatedAt: hoursAgo(2), escalationReason: "PRO_NO_REPLY", createdAt: hoursAgo(50) },
  });
  // Problema ancora in chat (collaudo F-20).
  const veraJob = await job(vera, marco.profile, "Rubinetto del bagno che perde.", 1);
  await prisma.jobIssue.create({ data: { bookingId: veraJob.booking.id, type: "BAD_WORK", description: "Il lavoro non è andato bene: perde ancora.", status: "CHAT", createdAt: hoursAgo(20) } });
  // Ricorso del professionista su un problema accolto.
  const ugoJob = await job(ugo, luigi.profile, "Quadro elettrico che salta.", 10);
  await prisma.jobIssue.create({
    data: { bookingId: ugoJob.booking.id, type: "BAD_WORK", description: "Il quadro salta ancora.", status: "UPHELD", resolvedAt: hoursAgo(72), resolutionNote: "Accolta: lavoro da rifare.", refundPercent: 50, appealText: "Il cliente ha collegato una stufa da 3 kW, non è colpa dell'impianto.", appealedAt: hoursAgo(30), createdAt: hoursAgo(200) },
  });

  // Rimborso da decidere (collaudo P-F7: 1.999 € pagati, lavoro chiuso a 300 €).
  const ritaJob = await job(rita, marco.profile, "Rifacimento bagno, acconto.", 3);
  const ritaPay = await prisma.jobPayment.create({
    data: { bookingId: ritaJob.booking.id, paymentMethod: "MANOVIA", status: "CONFIRMED", grossAmountEurCents: 30000, platformFeeEurCents: 2562, netAmountEurCents: 27438, paidEurCents: 199900, onlineStage: "PAID" },
  });
  await prisma.refund.create({ data: { jobPaymentId: ritaPay.id, amountEurCents: 169900, reason: "Lavoro chiuso a 300 € su 1.999 € pagati", requestedById: rita.id, createdAt: hoursAgo(26) } });
  // Contestazione tra le parti.
  await prisma.dispute.create({ data: { jobPaymentId: ritaPay.id, openedById: rita.id, reason: "Non mi hanno detto quando tornano i soldi.", createdAt: hoursAgo(20) } });
  // Contestazione in banca con scadenza fra 3 giorni (collaudo F22).
  const paolaJob = await job(paola, marco.profile, "Scarico della doccia otturato.", 5);
  await prisma.jobPayment.create({
    data: {
      bookingId: paolaJob.booking.id,
      paymentMethod: "MANOVIA",
      status: "DISPUTED",
      grossAmountEurCents: 8000,
      platformFeeEurCents: 685,
      netAmountEurCents: 7315,
      paidEurCents: 8000,
      onlineStage: "PAID",
      stripeDisputeId: "dp_prova_1",
      stripeDisputeStatus: "needs_response",
      stripeDisputedAt: hoursAgo(30),
      stripeDisputeDueBy: inHours(72),
      stripeDisputeReason: "product_not_received",
      disputeProNote: "Il lavoro è stato fatto il 25/10, ho le foto prima e dopo.",
      disputeProNoteAt: hoursAgo(10),
    },
  });
  // Saldo non pagato (collaudo F13).
  const ugoSaldo = await job(ugo, marco.profile, "Impianto idraulico cucina nuova.", 4);
  await prisma.jobPayment.create({
    data: { bookingId: ugoSaldo.booking.id, paymentMethod: "MANOVIA", status: "CONFIRMED", grossAmountEurCents: 182000, platformFeeEurCents: 15540, netAmountEurCents: 166460, paidEurCents: 20000, depositEurCents: 20000, onlineStage: "DEPOSIT_PAID", balanceUnpaidAt: hoursAgo(6) },
  });

  // Segnalazione DSA sulla recensione finta e un ricorso su una decisione.
  await prisma.contentReport.create({
    data: { reporterId: luigi.user.id, targetType: "REVIEW", targetId: fakeReview.id, reason: "Recensione falsa", details: "Account creato pochi minuti prima, stesso telefono di un'altra cliente.", contentOwnerId: finto.id, createdAt: hoursAgo(3) },
  });
  await prisma.contentReport.create({
    data: {
      reporterId: paola.id,
      targetType: "PROFESSIONAL_PROFILE",
      targetId: doppio.profile.id,
      reason: "Profilo falso o copiato",
      status: "RESOLVED",
      resolvedAt: hoursAgo(40),
      resolutionNote: "Profilo copiato da un altro professionista.",
      action: "SUSPEND_PROFILE",
      ground: "TERMS",
      contentOwnerId: doppio.user.id,
      appealText: "Sono io, ho solo due attività.",
      appealedAt: hoursAgo(12),
      createdAt: hoursAgo(60),
    },
  });

  await prisma.contactMessage.createMany({
    data: [
      { role: "CLIENT", email: "giulia.m@prova.it", content: "Non riesco a cambiare la data dell'appuntamento.", createdAt: hoursAgo(8) },
      { role: "PROFESSIONAL", email: "fabio.idraulico@prova.it", content: "Quando arrivano i soldi del lavoro di lunedì?", createdAt: hoursAgo(28) },
    ],
  });
  await prisma.problemTakeover.create({ data: { userId: ugo.id, description: "In cantina c'è odore di gas e una macchia d'acqua sul muro.", city: "Latina", createdAt: hoursAgo(1) } });

  // Account chiuso (collaudo, note del coordinatore): email anonimizzata.
  const chiuso = await user("CLIENT", "Bruno", "Chiuso", { createdAt: hoursAgo(24 * 40) });
  await prisma.user.update({ where: { id: chiuso.id }, data: { deletedAt: hoursAgo(20), email: `deleted-${chiuso.id}@deleted.invalid`, name: null, surname: null, phone: null } });

  // Qualche azione nel registro.
  await prisma.auditLog.createMany({
    data: [
      { entityType: "User", entityId: finto.id, fieldName: "testAccountAt", newValue: "sì", changedByUserId: admin.id, createdAt: hoursAgo(2) },
      { entityType: "User", entityId: luigi.user.id, fieldName: "suspendedAt", newValue: "sospeso", reason: "Recensioni false", changedByUserId: admin.id, createdAt: hoursAgo(50) },
    ],
  });

  process.stdout.write(
    JSON.stringify({ adminId: admin.id, adminEmail: admin.email, totpSecret: TOTP_SECRET, marcoUserId: marco.user.id, fintoId: finto.id, fakeReviewId: fakeReview.id, chiusoId: chiuso.id, doppioUserId: doppio.user.id, saraId: sara.user.id }, null, 2) + "\n",
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
