-- Scelta di partenza sull'acconto online se il cliente annulla dentro il preavviso
-- (docs/changelog/2026-11-11-rosso-solo-errori.md): di serie torna sempre al cliente.
ALTER TABLE "professional_profiles" ADD COLUMN "lateCancelKeepsDeposit" BOOLEAN NOT NULL DEFAULT false;
