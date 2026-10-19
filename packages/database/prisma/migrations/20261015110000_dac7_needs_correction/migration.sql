-- DAC7 (docs/CHANGELOG.md §244): anno già comunicato i cui importi sono
-- cambiati dopo l'invio (rimborso, lavoro riaperto), da correggere.
ALTER TABLE "dac7_reporting_periods" ADD COLUMN "needsCorrectionAt" TIMESTAMP(3);
