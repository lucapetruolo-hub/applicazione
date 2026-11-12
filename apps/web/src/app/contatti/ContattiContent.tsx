"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { BRAND, COMPANY, companyDataReady, type ContactMessageInput } from "@professionisti/shared";
import { Icon, Surface, Text, XStack, YStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { TURNSTILE_PENDING_MESSAGE, TurnstileWidget, isTurnstileEnabled } from "@/components/TurnstileWidget";
import { ConsentCheckbox } from "@/components/ConsentCheckbox";

const ROLE_OPTIONS: { value: ContactMessageInput["role"]; label: string }[] = [
  { value: "CLIENT", label: "Sono un cliente" },
  { value: "PROFESSIONAL", label: "Sono un professionista" },
  { value: "OTHER", label: "Altro" },
];
// La segnalazione di un contenuto illegale (DSA art. 16 c. 1, anche senza
// account, docs/CHANGELOG.md §319) non è più una scelta di "Chi sei?": non è
// un tipo di persona. Si apre dal link sotto il modulo o da quello del piede
// (`?motivo=segnalazione`), con lo stesso modulo
// (docs/changelog/2026-11-12-contatti-sfondo-e-link-home.md).

// Prima di scrivere: le pagine che rispondono già alle domande più comuni.
const HELP_LINKS: { href: string; icon: "message-circle" | "triangle-alert" | "shield-check"; label: string }[] = [
  { href: "/faq", icon: "message-circle", label: "Domande frequenti" },
  { href: "/problemi-e-rimborsi", icon: "triangle-alert", label: "Problemi su un lavoro" },
  { href: "/sicurezza", icon: "shield-check", label: "Sicurezza e truffe" },
];

// Etichette vere legate al campo: toccando la scritta il cursore va nel campo
// e il lettore di schermo la legge una volta sola.
const labelStyle = { fontSize: 16, fontWeight: 600, color: brand.grafite70 } as const;

const fieldStyle = {
  padding: "16px 18px",
  borderRadius: 20,
  border: `1px solid ${brand.bordoCampo}`,
  fontSize: 16,
  fontFamily: "inherit",
  width: "100%",
  boxSizing: "border-box" as const,
  backgroundColor: brand.calce,
};

// Dati della società da un solo punto (`COMPANY` in packages/shared/src/brand.ts,
// D.Lgs. 70/2003 art. 7; collaudo del 29/10/2026, M-01 e M-10).
const COMPANY_ROWS: { icon: "file-text" | "map-pin" | "mail"; label: string; value: string }[] = [
  { icon: "file-text", label: "Ragione sociale", value: COMPANY.legalName },
  { icon: "map-pin", label: "Sede legale", value: COMPANY.address },
  { icon: "file-text", label: "P.IVA e codice fiscale", value: COMPANY.vatNumber },
  { icon: "file-text", label: "Registro delle imprese", value: COMPANY.rea },
  { icon: "mail", label: "PEC", value: COMPANY.pec },
];

/**
 * Pagina "Contatti" dedicata, ispirata a un riferimento screenshot
 * (MioDottore: form ruolo/email/messaggio + dati azienda) — richiesta
 * esplicita dell'utente, che ha corretto un giro precedente dove lo
 * stesso form viveva compresso dentro il footer, e successivamente
 * chiesto di avvicinare ulteriormente le proporzioni di font/campi al
 * riferimento e di correggere lo spazio vuoto sopra il titolo. Non usa
 * `Section` (packages/ui): quel wrapper condiviso ha 64/96px di padding
 * verticale pensato per pagine con più sezioni in sequenza — su questa
 * pagina, fatta di un solo blocco corto, lo stesso padding si leggeva
 * come uno spazio vuoto ingiustificato tra header e titolo (segnalato
 * dall'utente con screenshot). Layout/spaziatura costruiti su misura qui,
 * con un padding superiore molto più contenuto. Il messaggio viene
 * salvato per davvero (stesso endpoint POST /contact, nessun invio email
 * reale — Resend/Twilio restano rimandati, CLAUDE.md §9), visibile in
 * /admin. I dati aziendali restano segnaposto finché l'utente non
 * fornisce quelli reali — stessa convenzione già in uso per /privacy.
 */
/** Messaggio già avviato per chi chiede aiuto a creare il profilo, da completare col numero. */
const PROFILE_HELP_MESSAGE = "Vorrei aiuto per creare il mio profilo. Il mio mestiere è: \nMi potete chiamare al numero: ";

export default function ContattiContent({ initialReport = false, initialProfileHelp = false }: { initialReport?: boolean; initialProfileHelp?: boolean }) {
  const [role, setRole] = useState<ContactMessageInput["role"]>(initialReport ? "REPORT_ILLEGAL" : initialProfileHelp ? "PROFESSIONAL" : "CLIENT");
  const [email, setEmail] = useState("");
  // Segnalazione di un contenuto illegale: nome e indirizzo della pagina in
  // campi a sé (DSA art. 16 c. 2 lett. b-c; collaudo del 29/10/2026, M-09).
  const [reporterName, setReporterName] = useState("");
  const [contentUrl, setContentUrl] = useState("");
  const [content, setContent] = useState(initialProfileHelp ? PROFILE_HELP_MESSAGE : "");
  const [website, setWebsite] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("Inserisci un'email valida e un messaggio.");
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileReset, setTurnstileReset] = useState(0);
  const [goodFaith, setGoodFaith] = useState(false);
  const isReport = role === "REPORT_ILLEGAL";
  // Campo sbagliato: segnato, collegato al messaggio e con il fuoco sopra,
  // come in /accedi (E7-06 del controllo dell'8/11).
  const [errorField, setErrorField] = useState<"email" | "name" | "url" | "content" | null>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const urlRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLTextAreaElement>(null);

  function fail(message: string, field: "email" | "name" | "url" | "content" | null) {
    setErrorMessage(message);
    setErrorField(field);
    setStatus("error");
    const target = { email: emailRef, name: nameRef, url: urlRef, content: contentRef }[field ?? "email"];
    if (field) target.current?.focus();
  }

  /** Passa dal messaggio alla segnalazione (e ritorno), con il fuoco sul primo campo. */
  function switchReport(toReport: boolean) {
    setRole(toReport ? "REPORT_ILLEGAL" : "CLIENT");
    setStatus("idle");
    setErrorField(null);
    requestAnimationFrame(() => emailRef.current?.focus());
  }

  function fieldError(field: "email" | "name" | "url" | "content") {
    return status === "error" && errorField === field ? { "aria-invalid": true as const, "aria-describedby": "contatti-errore" } : {};
  }

  async function handleSubmit() {
    if (!email.trim() || !email.includes("@")) {
      fail("Inserisci un'email valida.", "email");
      return;
    }
    if (!content.trim()) {
      fail(isReport ? "Spiega perché il contenuto è illegale." : "Scrivi il messaggio.", "content");
      return;
    }
    if (isReport && reporterName.trim().length < 2) {
      fail("Scrivi il tuo nome e cognome.", "name");
      return;
    }
    if (isReport && !contentUrl.trim()) {
      fail("Incolla l'indirizzo della pagina con il contenuto.", "url");
      return;
    }
    if (isReport && content.trim().length < 20) {
      fail("Spiega perché il contenuto è illegale.", "content");
      return;
    }
    if (isReport && !goodFaith) {
      fail("Conferma che la segnalazione è fatta in buona fede.", null);
      return;
    }
    if (isTurnstileEnabled() && !turnstileToken) {
      fail(TURNSTILE_PENDING_MESSAGE, null);
      return;
    }
    setStatus("loading");
    try {
      await apiClient.sendContactMessage({
        role,
        email: email.trim(),
        content: content.trim(),
        ...(isReport ? { goodFaith, reporterName: reporterName.trim(), contentUrl: contentUrl.trim() } : {}),
        website,
        turnstileToken: turnstileToken ?? undefined,
      });
      setStatus("done");
    } catch (err) {
      fail(err instanceof Error ? err.message : "Invio non riuscito, riprova.", null);
      // Il token anti-bot vale una volta sola: ne serve uno nuovo per riprovare.
      setTurnstileReset((n) => n + 1);
    }
  }

  return (
    // Senza fondo pieno: dietro resta lo sfondo a velo di tutto il sito, come
    // nelle altre pagine (docs/changelog/2026-11-12-contatti-sfondo-e-link-home.md).
    <YStack width="100%" alignItems="center" paddingHorizontal="16px gtSm:40px" paddingTop="40px gtSm:56px" paddingBottom="64px gtSm:96px">
      <YStack width="100%" maxWidth={1080} gap="5">
        <YStack gap="2">
          <Text render="h1" margin={0} fontFamily="heading" fontWeight="800" color={brand.inchiostro} fontSize="34px gtSm:44px">
            Contatti
          </Text>
          <Text fontSize={18} color={brand.grafite70} maxWidth={560} lineHeight="26px">
            Scrivici per qualsiasi domanda: ti rispondiamo il prima possibile, in italiano o in inglese.
          </Text>
          {/* Punto di contatto per utenti e autorità (DSA artt. 11-12, D.Lgs. 70/2003 art. 7 c. 1 lett. c; M-10). */}
          <Text fontSize={16} color={brand.grafite70}>
            Oppure scrivi a{" "}
            <a href={`mailto:${BRAND.supportEmail}`} style={{ color: brand.cianografiaScuro, fontWeight: 600 }}>
              {BRAND.supportEmail}
            </a>
          </Text>
        </YStack>

        <nav aria-label="Prima di scrivere" className="contatti-help">
          <Text fontSize={16} color={brand.grafite70}>
            Forse la risposta è già qui:
          </Text>
          <ul>
            {HELP_LINKS.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="contatti-help-link">
                  <Icon name={item.icon} size={18} color={brand.cianografiaScuro} />
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <XStack flexWrap="wrap" gap="5" width="100%" alignItems="flex-start">
          <Surface flexGrow={2} flexShrink={1} flexBasis={340} minWidth={0} padding="4 gtSm:6" gap="4">
            <Text fontFamily="heading" fontWeight="700" fontSize={24} color={brand.grafite}>
              {isReport ? "Segnala un contenuto illegale" : "Invia un messaggio"}
            </Text>

            {status === "done" ? (
              <Text fontSize={18} color={brand.verificato} fontWeight="600">
                {isReport
                  ? "Segnalazione presa in carico. Ti scriveremo l'esito a questa email."
                  : "Messaggio inviato. Ti risponderemo il prima possibile."}
              </Text>
            ) : (
              <YStack gap="4">
                {isReport ? null : (
                <YStack gap="2">
                  <Text id="contatti-chi-sei" fontSize={16} fontWeight="600" color={brand.grafite70}>
                    Chi sei?
                  </Text>
                  {/* Scelte visibili invece di un menu a tendina (docs/CHANGELOG.md §349). */}
                  <div className="slot-pills" role="radiogroup" aria-labelledby="contatti-chi-sei">
                    {ROLE_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        role="radio"
                        aria-checked={role === option.value}
                        className={`slot-pill${role === option.value ? " is-on" : ""}`}
                        onClick={() => setRole(option.value)}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </YStack>
                )}

                <input
                  type="text"
                  name="website"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  tabIndex={-1}
                  autoComplete="off"
                  aria-hidden="true"
                  style={{ position: "absolute", left: -9999, width: 1, height: 1, opacity: 0 }}
                />

                <YStack gap="2">
                  <label htmlFor="contatti-email" style={labelStyle}>
                    La tua email
                  </label>
                  <input
                    id="contatti-email"
                    ref={emailRef}
                    {...fieldError("email")}
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (status === "error") setStatus("idle");
                    }}
                    placeholder="nome@esempio.it"
                    style={fieldStyle}
                  />
                </YStack>

                {isReport ? (
                  <>
                    <YStack gap="2">
                      <label htmlFor="contatti-nome" style={labelStyle}>
                        Nome e cognome
                      </label>
                      <input
                        id="contatti-nome"
                        ref={nameRef}
                        {...fieldError("name")}
                        value={reporterName}
                        autoComplete="name"
                        onChange={(e) => {
                          setReporterName(e.target.value);
                          if (status === "error") setStatus("idle");
                        }}
                        style={fieldStyle}
                      />
                    </YStack>
                    <YStack gap="2">
                      <label htmlFor="contatti-indirizzo" style={labelStyle}>
                        Indirizzo della pagina
                      </label>
                      <input
                        id="contatti-indirizzo"
                        ref={urlRef}
                        {...fieldError("url")}
                        type="url"
                        inputMode="url"
                        value={contentUrl}
                        onChange={(e) => {
                          setContentUrl(e.target.value);
                          if (status === "error") setStatus("idle");
                        }}
                        placeholder="Incolla il link del profilo o della recensione"
                        style={fieldStyle}
                      />
                    </YStack>
                  </>
                ) : null}

                <YStack gap="2">
                  <label htmlFor="contatti-messaggio" style={labelStyle}>
                    {isReport ? "Perché è illegale" : "Messaggio"}
                  </label>
                  <textarea
                    id="contatti-messaggio"
                    ref={contentRef}
                    {...fieldError("content")}
                    value={content}
                    onChange={(e) => {
                      setContent(e.target.value);
                      if (status === "error") setStatus("idle");
                    }}
                    placeholder={isReport ? "Indica il contenuto (per esempio la frase o la foto) e spiega perché è illegale." : "Scrivi qui la tua richiesta..."}
                    rows={7}
                    style={{ ...fieldStyle, resize: "vertical", minHeight: 160, fontFamily: "inherit" }}
                  />
                </YStack>

                {isReport ? (
                  <ConsentCheckbox checked={goodFaith} invalid={status === "error" && !goodFaith} onToggle={() => setGoodFaith((v) => !v)}>
                    Confermo in buona fede che la segnalazione è corretta e completa.{" "}
                    <Link href="/termini#segnalazioni" target="_blank" style={{ color: brand.cianografiaScuro }} onClick={(e) => e.stopPropagation()}>
                      Come gestiamo le segnalazioni
                    </Link>
                  </ConsentCheckbox>
                ) : null}

                <TurnstileWidget onTokenChange={setTurnstileToken} resetSignal={turnstileReset} />

                <button
                  onClick={handleSubmit}
                  disabled={status === "loading"}
                  style={{
                    padding: "17px 32px",
                    borderRadius: 999,
                    border: "none",
                    backgroundColor: brand.cianografiaPieno,
                    color: "white",
                    fontSize: 18,
                    fontWeight: 700,
                    cursor: status === "loading" ? "default" : "pointer",
                    opacity: status === "loading" ? 0.6 : 1,
                    width: "100%",
                  }}
                >
                  {status === "loading" ? "Invio..." : isReport ? "Invia segnalazione" : "Invia messaggio"}
                </button>

                {/* Sempre presente, così il lettore di schermo annuncia il messaggio quando compare. */}
                <div id="contatti-errore" role="alert">
                  {status === "error" ? (
                    <Text fontSize={16} color={brand.urgenza}>
                      {errorMessage}
                    </Text>
                  ) : null}
                </div>

                <Text fontSize={16} color={brand.grafite70} lineHeight="22px" paddingTop="3" borderTopWidth={1} borderTopColor={brand.filetto}>
                  {isReport ? "Non è una segnalazione? " : "Hai visto un contenuto illegale sul sito? "}
                  <button type="button" className="contatti-switch" onClick={() => switchReport(!isReport)}>
                    {isReport ? "Scrivi un messaggio" : "Segnalalo qui"}
                  </button>
                </Text>
              </YStack>
            )}
          </Surface>

          <Surface flexGrow={1} flexShrink={1} flexBasis={300} minWidth={0} padding="4 gtSm:6" gap="4">
            <Text fontFamily="heading" fontWeight="700" fontSize={24} color={brand.grafite}>
              Dati dell&apos;azienda
            </Text>
            {/* Finché la società non c'è, niente segnaposto "[DA COMPILARE]" in
                vista (come nel piede, `companyDataReady`): una riga sola.
                I dati veri si scrivono in `COMPANY` prima del lancio
                (checklist di lancio). */}
            {companyDataReady() ? (
            <YStack gap="4">
              {COMPANY_ROWS.map((row) => (
                <XStack key={row.label} gap="3" alignItems="flex-start">
                  <YStack
                    width={40}
                    height={40}
                    borderRadius={12}
                    backgroundColor={brand.cianografiaVelo}
                    alignItems="center"
                    justifyContent="center"
                    flexShrink={0}
                  >
                    <Icon name={row.icon} size={19} color={brand.cianografiaScuro} />
                  </YStack>
                  <YStack gap="1" flex={1} minWidth={0}>
                    <Text fontSize={16} fontWeight="700" color={brand.grafite70}>
                      {row.label}
                    </Text>
                    <Text fontSize={16} color={brand.grafite} lineHeight="23px">
                      {row.value}
                    </Text>
                  </YStack>
                </XStack>
              ))}
            </YStack>
            ) : (
              <Text fontSize={16} color={brand.grafite70} lineHeight="23px">
                Ragione sociale, sede, partita IVA e PEC compariranno qui all&apos;apertura del sito.
              </Text>
            )}
            <Text fontSize={16} color={brand.grafite70} lineHeight="21px" paddingTop="2" borderTopWidth={1} borderTopColor={brand.filetto}>
              Tutti i dati legali sono anche nelle{" "}
              <Link href="/note-legali" style={{ color: brand.cianografiaScuro, fontWeight: 600 }}>
                Note legali
              </Link>
              .
            </Text>
          </Surface>
        </XStack>
      </YStack>
    </YStack>
  );
}
