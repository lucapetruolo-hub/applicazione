-- Correzioni del collaudo sui soldi online (docs/changelog/2026-10-30-collaudo-soldi-online.md).
-- Una sola pagina di pagamento dell'acconto per preventivo (collaudo I-02).
ALTER TABLE "quotes" ADD COLUMN "depositCheckoutSessionId" TEXT;

-- Rimborso concordato in chat su una segnalazione (collaudo F-03).
ALTER TABLE "job_issues" ADD COLUMN "refundOfferEurCents" INTEGER;
ALTER TABLE "job_issues" ADD COLUMN "refundOfferedAt" TIMESTAMP(3);
ALTER TABLE "job_issues" ADD COLUMN "agreedRefundEurCents" INTEGER;
