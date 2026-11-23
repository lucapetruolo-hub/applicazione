# Termoidraulico: scelta dei mestieri, "Impianti gas" e abilitazioni DM 37/08

**Richiesta** (Luca, 23/11/2026, thread "Far iscrivere i termoidraulici"): come
si iscrive un termoidraulico, e se conviene una specializzazione sotto
Idraulico. Proposta: niente mestiere né specializzazione "Termoidraulico"
(le richieste sulle caldaie vanno a "Climatizzazione e caldaie" per i confini
del DM 37/2008, e la decisione "niente Termoidraulico nella ricerca" resta),
ma i due mestieri Idraulico + Climatizzazione e caldaie resi più evidenti.
Luca ha approvato le migliorie 1, 2 e 3; no alla scritta automatica
"Termoidraulico" sul profilo (chi vuole la mette nel nome dell'attività).

**Decisione**:
1. La specializzazione "Caldaie" sotto Idraulico diventa "Impianti gas"
   (`impianti-gas`): prometteva lavori che il sito manda a Climatizzazione e
   caldaie. La migrazione `20261123120000_abilitazioni_impianti` la toglie dai
   profili che l'avevano; la vecchia `/cerca/idraulico/<città>/caldaie` porta
   con un 308 a `/cerca/climatizzazione/<città>` (`MOVED_SUB_TAGS`). Nel menu
   Servizi Idraulico ora dice "Perdite, scarichi, impianti sanitari".
2. Nella scelta dei mestieri (registrazione, profilo, Admin) una riga sopra le
   schede: "Fai il termoidraulico o l'impiantista? Scegli «Idraulico» e
   «Climatizzazione e caldaie»" con "Scegli tutti e due" (o "Aggiungi" quello
   che manca). Sparisce quando sono scelti tutti e due, quando non c'è posto o
   quando compare il riquadro "Lavori anche su caldaie e riscaldamento?"
   (`COMBINED_TRADES` in `packages/shared/src/categories.ts`).
3. Abilitazioni DM 37/2008 come caselle in "Esperienza e affidabilità"
   (`InstallerQualificationsPicker`), solo quelle dei mestieri scelti:
   Elettricista a, b; Idraulico d, e; Climatizzazione c, e. Campo
   `ProfessionalProfile.installerQualifications`; il server tiene solo le
   lettere dei mestieri scelti, anche quando non arrivano nel salvataggio
   (togliendo un mestiere spariscono le sue). Sul profilo pubblico:
   "Abilitazioni impianti (DM 37/08): riscaldamento e clima, acqua e sanitari
   e gas", con la riga già esistente "... le scrive il professionista" (mai
   "verificate"). Lettere f (ascensori) e g (antincendio) fuori: nessun
   mestiere del sito.

**Verifica**: test di `packages/shared` (nuovo `installerQualifications.test.ts`),
test dell'API su seo/professionals/admin/profile-invites, typecheck di API e
sito, `pnpm --filter @professionisti/web lint`; prova a mano sul sito in locale
con foto da telefono e computer (anteprime/termoidraulico/ nei file del
progetto); 308 della vecchia pagina provato.

## Secondo giro (23/11/2026, sera)

**Richiesta** (Luca): migliorie 1 e 3 della lista dopo la PR #466, e la riga
"Fai il termoidraulico o l'impiantista?" in fondo alle schede.

**Decisione**:
- Menu Servizi: Climatizzazione dice "Caldaie, condizionatori e pompe di
  calore" (prima solo "Installazione e manutenzione caldaie").
- Con la lettera A spuntata, "Certificazione impianto" è la prima prestazione
  suggerita all'elettricista (`SERVICES_BY_QUALIFICATION`,
  `qualificationServicesFor` in `installerQualifications.ts`).
- La riga del termoidraulico sta sotto le schede dei mestieri, sopra il
  riquadro del mestiere vicino.
- Scartata da Luca: numero del patentino F-gas con link al registro.

**Verifica**: test di `packages/shared`, typecheck e lint del sito, foto da
telefono e computer.
