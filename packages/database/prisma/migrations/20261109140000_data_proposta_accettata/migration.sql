-- Il professionista ha accettato la data proposta dal cliente: il preventivo
-- torna da accettare con quella data (collaudo 08/11, E1-02).
ALTER TABLE "quotes" ADD COLUMN "proposedDateAcceptedAt" TIMESTAMP(3);
