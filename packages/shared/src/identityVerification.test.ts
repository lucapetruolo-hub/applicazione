import { test } from "node:test";
import assert from "node:assert/strict";
import { identityReasonNeedsFiscalFix } from "./identityVerification";

test("il link ai dati fiscali solo quando il motivo li riguarda", () => {
  assert.equal(identityReasonNeedsFiscalFix("Il documento non coincide con i dati fiscali (cognome). Se nei dati fiscali c'è un errore correggilo."), true);
  assert.equal(identityReasonNeedsFiscalFix("Completa nome e cognome nei dati fiscali, poi rifai la verifica."), true);
  assert.equal(identityReasonNeedsFiscalFix("Non siamo riusciti a leggere i dati del documento: rifai la foto più nitida, con buona luce e senza riflessi."), false);
  assert.equal(identityReasonNeedsFiscalFix("Il selfie non è riuscito: rifallo da solo, guardando la fotocamera, con il viso ben illuminato."), false);
  assert.equal(identityReasonNeedsFiscalFix(null), false);
});
