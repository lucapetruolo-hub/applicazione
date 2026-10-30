-- Una sola pagina di pagamento dell'acconto per preventivo (collaudo I-02,
-- docs/changelog/2026-10-30-collaudo-soldi-online.md).
ALTER TABLE "quotes" ADD COLUMN "depositCheckoutSessionId" TEXT;
