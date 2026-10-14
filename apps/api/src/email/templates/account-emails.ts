import { EMAIL_BRAND, frontendUrl } from "../email-brand";
import { renderEmail, type RenderedEmail } from "../email-layout";

/**
 * Email legate all'account (docs/CHANGELOG.md §185): benvenuto, conferma
 * dell'indirizzo, recupero password, invito per il profilo creato al
 * telefono, eliminazione. Sono messaggi di servizio: partono sempre, non
 * dipendono dalle preferenze di notifica.
 */

export function welcomeClientEmail(name: string | null): RenderedEmail {
  const site = frontendUrl();
  return renderEmail({
    kind: "account",
    subject: `Benvenuto su ${EMAIL_BRAND.name}`,
    preheader: "Descrivi il lavoro che ti serve e ricevi i preventivi dei professionisti della tua zona.",
    greeting: name,
    title: `Benvenuto su ${EMAIL_BRAND.name}!`,
    paragraphs: [
      "Grazie per esserti iscritto. Da oggi trovare un professionista vicino a te è più semplice: idraulici, elettricisti, imprese di pulizie e tanti altri, con recensioni scritte solo da chi ha davvero lavorato con loro.",
      "**Come funziona:** descrivi il lavoro con qualche foto, ricevi i preventivi dei professionisti della tua zona, confrontali e scegli. Puoi scrivere a ognuno in chat prima di decidere.",
      "I tuoi dati di contatto restano riservati: il professionista vede telefono e indirizzo solo dopo che hai accettato il suo preventivo.",
    ],
    cta: { label: "Chiedi un preventivo", url: `${site}/preventivo` },
    after: ["Se non ti sei iscritto tu, scrivici e chiuderemo l'account."],
  });
}

/**
 * Benvenuto del professionista: quando serve, contiene anche il link di
 * conferma dell'email (una sola email invece di due).
 */
/** Link e codice di conferma dell'email (docs/CHANGELOG.md §178, §243). */
export type EmailVerification = { link: string; hours: number; code: string; codeMinutes: number };

const COMPLETE_PROFILE_TEXT =
  "**Poi bastano pochi minuti:** completa il profilo con la tua attività, la zona in cui lavori e qualche foto. Più è completo, più richieste ricevi.";

export function welcomeProfessionalEmail(name: string | null, verify: EmailVerification | null): RenderedEmail {
  const site = frontendUrl();
  return renderEmail({
    kind: "account",
    subject: verify ? `${verify.code} è il tuo codice per ${EMAIL_BRAND.name}` : `Benvenuto su ${EMAIL_BRAND.name}`,
    preheader: verify ? `Benvenuto! Inserisci il codice ${verify.code} per confermare la tua email.` : "Completa il profilo per iniziare a ricevere richieste.",
    greeting: name,
    title: `Benvenuto su ${EMAIL_BRAND.name}!`,
    paragraphs: [
      "Grazie per esserti iscritto. Qui i clienti della tua zona ti trovano, ti chiedono un preventivo e ti scelgono anche per le recensioni dei lavori fatti.",
      // Con la conferma il codice segue subito l'invito a scriverlo; il resto va dopo il pulsante.
      ...(verify ? ["**Prima di tutto conferma il tuo indirizzo email:** scrivi questo codice sul sito, oppure premi il pulsante qui sotto."] : [COMPLETE_PROFILE_TEXT]),
    ],
    ...(verify ? { code: { label: "Il tuo codice", value: verify.code } } : {}),
    cta: verify ? { label: "Conferma la mia email", url: verify.link } : { label: "Completa il profilo", url: `${site}/dashboard/profilo` },
    after: verify
      ? [verifyValidity(verify), COMPLETE_PROFILE_TEXT, "Se non ti sei iscritto tu, ignora questo messaggio."]
      : ["Se non ti sei iscritto tu, scrivici e chiuderemo l'account."],
  });
}

function verifyValidity(verify: EmailVerification): string {
  return `Il codice vale ${verify.codeMinutes} minuti, il pulsante ${verify.hours} ore. Non dare il codice a nessuno: non te lo chiederemo mai al telefono.`;
}

/** Conferma dell'email rispedita, o dopo un cambio di indirizzo. */
export function verifyEmailEmail(name: string | null, verify: EmailVerification): RenderedEmail {
  return renderEmail({
    kind: "account",
    subject: `${verify.code} è il tuo codice per ${EMAIL_BRAND.name}`,
    preheader: `Inserisci il codice ${verify.code} per confermare la tua email.`,
    greeting: name,
    title: "Conferma il tuo indirizzo email",
    paragraphs: ["Per confermare che questo indirizzo è tuo scrivi il codice sul sito, oppure premi il pulsante qui sotto."],
    code: { label: "Il tuo codice", value: verify.code },
    cta: { label: "Conferma la mia email", url: verify.link },
    after: [verifyValidity(verify), "Se non hai chiesto tu questa email, ignorala: il tuo account non cambia."],
  });
}

export function passwordResetEmail(name: string | null, link: string, minutes: number): RenderedEmail {
  return renderEmail({
    kind: "account",
    subject: "Reimposta la tua password",
    preheader: "Hai chiesto di reimpostare la password del tuo account.",
    greeting: name,
    title: "Reimposta la tua password",
    paragraphs: ["Abbiamo ricevuto una richiesta per reimpostare la password del tuo account. Scegline una nuova con il pulsante qui sotto."],
    cta: { label: "Scegli una nuova password", url: link },
    after: [
      `Il link vale ${minutes} minuti e si può usare una volta sola.`,
      "Se non l'hai chiesto tu, ignora questa email: la tua password resta quella di prima.",
    ],
  });
}

export function passwordChangedEmail(name: string | null): RenderedEmail {
  const site = frontendUrl();
  return renderEmail({
    kind: "account",
    subject: "La tua password è stata cambiata",
    greeting: name,
    title: "Password cambiata",
    paragraphs: ["Ti confermiamo che la password del tuo account è appena stata cambiata."],
    after: [
      `Se non sei stato tu, reimpostala subito da ${site}/password-dimenticata e scrivici a ${EMAIL_BRAND.supportEmail}.`,
    ],
  });
}

export function accountDeletedEmail(name: string | null): RenderedEmail {
  return renderEmail({
    kind: "account",
    subject: "Il tuo account è stato eliminato",
    greeting: name,
    title: "Account eliminato",
    paragraphs: [
      "Come hai chiesto, abbiamo eliminato il tuo account e i tuoi dati personali. Le richieste e i lavori già fatti restano visibili alle altre persone coinvolte, con l'indicazione \"Account eliminato\".",
      "Ci dispiace vederti andare. Se un giorno vorrai tornare, potrai iscriverti di nuovo con lo stesso indirizzo.",
    ],
    after: [`Se non sei stato tu, scrivici subito a ${EMAIL_BRAND.supportEmail}.`],
  });
}

/** Profilo preparato da un operatore al telefono (docs/CHANGELOG.md §170). */
export function profileInviteEmail(name: string | null, businessName: string, url: string, days: number): RenderedEmail {
  return renderEmail({
    kind: "account",
    subject: `Il tuo profilo su ${EMAIL_BRAND.name} è pronto`,
    preheader: "Scegli la password e controlla i dati: poi il profilo comparirà nelle ricerche.",
    greeting: name,
    title: "Il tuo profilo è pronto",
    paragraphs: [
      `Come concordato al telefono, abbiamo preparato il profilo di **${businessName}**.`,
      "Apri il link, scegli la password e controlla i dati: il profilo comparirà nelle ricerche solo dopo che l'avrai salvato tu.",
    ],
    cta: { label: "Completa il tuo profilo", url },
    after: [`Il link vale ${days} giorni.`],
  });
}
