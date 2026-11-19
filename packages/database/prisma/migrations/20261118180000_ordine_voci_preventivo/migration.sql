-- Ordine fisso delle voci del preventivo (docs/changelog/2026-11-18-ordine-voci-preventivo.md).
-- AlterTable
ALTER TABLE "quote_items" ADD COLUMN     "position" SERIAL NOT NULL;

-- Stessa cosa per le voci scritte a fine lavoro.
-- AlterTable
ALTER TABLE "booking_final_items" ADD COLUMN     "position" SERIAL NOT NULL;
