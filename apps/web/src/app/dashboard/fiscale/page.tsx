"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button, Field, Icon, Surface, Section, Text, XStack, YStack, brand, Badge } from "@professionisti/ui";
import type { ProfessionalFiscalProfile, FiscalVerificationStatus } from "@professionisti/api-client";
import { BRAND, checkFiscalId, fiscalFieldErrors, professionalFiscalProfileSchema, taxIdCheckMessage, type MyVerificationStatus, type TaxIdKind } from "@professionisti/shared";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { VerificationSteps } from "@/components/verification/VerificationSteps";

// Solo le 4 varianti semantiche fisse di Badge (CLAUDE.md §10: "rosso solo
// su urgenza, verde solo su verificato" — mai un colore libero), non un
// quinto colore inventato per lo stato fiscale.
const VERIFICATION_LABEL: Record<FiscalVerificationStatus, { label: string; variant: "verificato" | "urgente" | "nuovo" }> = {
  UNVERIFIED: { label: "Non ancora verificato", variant: "nuovo" },
  PENDING_VERIFICATION: { label: "In attesa di verifica", variant: "nuovo" },
  VERIFIED: { label: "Verificato", variant: "verificato" },
  REJECTED: { label: "Verifica rifiutata", variant: "urgente" },
  REQUIRES_UPDATE: { label: "Dati da aggiornare", variant: "urgente" },
};

// Etichette esatte, identiche a quelle mostrate sopra ogni campo del form
// sotto — usate per tradurre un errore di validazione in un messaggio che
// nomina il campo giusto, invece del generico messaggio Zod grezzo (es.
// "String must contain at most 2 character(s)") che il backend
// (ZodValidationPipe) restituirebbe altrimenti tale e quale.
const FISCAL_FIELD_LABELS: Record<string, string> = {
  entityType: "Tipo di attività",
  fiscalFirstName: "Nome",
  fiscalLastName: "Cognome",
  fiscalCodiceFiscale: "Codice fiscale",
  dateOfBirth: "Data di nascita",
  placeOfBirth: "Luogo di nascita (Comune e Provincia)",
  countryOfBirth: "Paese di nascita (ISO, es. IT)",
  businessName: "Ragione sociale / Nome dell'attività",
  legalForm: "Forma giuridica",
  vatNumber: "Partita IVA",
  businessRegistrationNumber: "Numero di iscrizione al Registro delle Imprese (REA / CCIAA)",
  leiCode: "Codice LEI",
  additionalEuStates: "Stati membri UE aggiuntivi con stabile organizzazione",
  taxResidenceCountry: "Paese di residenza fiscale (ISO, es. IT)",
  foreignTin: "TIN estero",
  fiscalIdIssuingCountry: "Stato di rilascio del codice fiscale / NIF / P.IVA (ISO, es. IT)",
  registeredStreet: "Via / Piazza",
  registeredHouseNumber: "Numero civico",
  registeredCity: "Città",
  registeredPostalCode: "CAP",
  registeredProvince: "Provincia",
  registeredCountry: "Paese (ISO, es. IT)",
  representative: "Legale rappresentante",
  "representative.firstName": "Nome del legale rappresentante",
  "representative.lastName": "Cognome del legale rappresentante",
  "representative.codiceFiscale": "Codice fiscale del legale rappresentante",
  "representative.role": "Ruolo del legale rappresentante",
};

function fiscalFieldLabel(path: (string | number)[]): string {
  return FISCAL_FIELD_LABELS[path.join(".")] ?? FISCAL_FIELD_LABELS[String(path[0] ?? "")] ?? "Un campo";
}

/**
 * Dati fiscali del professionista (persona fisica/impresa) + onboarding
 * Stripe Connect — CLAUDE.md §88. Pagina separata da /dashboard/profilo
 * (dati pubblici): stessa separazione rigorosa già applicata lato backend
 * (ProfessionalFiscalProfile non è mai incluso in alcun endpoint pubblico).
 *
 * NESSUN dato qui è mai obbligatorio per usare la piattaforma — coerente
 * con il principio esplicito della specifica "MANOVIA" ("il software non
 * deve mai decidere se una persona ha bisogno di una partita IVA"): questa
 * pagina raccoglie i dati necessari per la rendicontazione fiscale DAC7 e
 * per attivare i pagamenti tramite Manovia (Stripe Connect), ma un
 * professionista può continuare a lavorare con pagamenti diretti (fuori
 * piattaforma) senza compilarla.
 */
export default function DashboardFiscalePage() {
  return (
    <Suspense fallback={null}>
      <DashboardFiscaleContent />
    </Suspense>
  );
}

function DashboardFiscaleContent() {
  const { user, token, isLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  // Categoria scelta nella schermata precedente (/dashboard/tipo-attivita,
  // subito dopo la registrazione) — arriva qui via query param, mai già
  // salvata: un account appena creato non ha ancora un ProfessionalProfile
  // (creato solo al primo salvataggio di /dashboard/profilo), quindi
  // ProfessionalFiscalProfile — che vi si aggancia 1:1 — non può esistere
  // prima di allora. Il picker qui sotto arriva solo PRE-selezionato
  // (stato locale, non ancora persistito); il salvataggio vero avviene solo
  // al click su "Salva dati fiscali", quando il messaggio d'errore guida
  // esplicitamente verso /dashboard/profilo se non ancora completato.
  const prefillEntityType = searchParams.get("entityType");
  const [prefillApplied, setPrefillApplied] = useState(false);

  const [profile, setProfile] = useState<ProfessionalFiscalProfile | null | undefined>(undefined);
  const [entityType, setEntityType] = useState<"PRIVATE_INDIVIDUAL" | "SOLE_PROPRIETOR" | "BUSINESS" | "">("");
  const [fields, setFields] = useState<Record<string, string>>({});
  // Dichiarazione richiesta esplicitamente dall'utente al salvataggio:
  // pre-spuntata solo se già accettata in un salvataggio precedente (stesso
  // `useEffect` che carica il profilo sotto) — un professionista che ha
  // già dichiarato non deve ri-confermarlo ad ogni singola modifica, il
  // testo resta comunque sempre visibile accanto al bottone "Salva".
  const [declarationAccepted, setDeclarationAccepted] = useState(false);
  const [additionalEuStatesText, setAdditionalEuStatesText] = useState("");
  const [repFields, setRepFields] = useState<{ firstName: string; lastName: string; codiceFiscale: string; role: string }>({
    firstName: "",
    lastName: "",
    codiceFiscale: "",
    role: "",
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [stripeError, setStripeError] = useState<string | null>(null);
  const [stripeLoading, setStripeLoading] = useState(false);
  // Verifica in 3 passi (docs/CHANGELOG.md §243): si ricarica a ogni salvataggio.
  const [verification, setVerification] = useState<MyVerificationStatus | null>(null);
  const [verificationKey, setVerificationKey] = useState(0);

  useEffect(() => {
    if (!token) return;
    apiClient
      .myVerificationStatus(token)
      .then(setVerification)
      .catch(() => setVerification(null));
  }, [token, verificationKey]);

  useEffect(() => {
    if (!token) return;
    apiClient
      .myFiscalProfile(token)
      .then((data) => {
        setProfile(data);
        if (data) {
          setEntityType(data.entityType ?? "");
          setFields({
            fiscalFirstName: data.fiscalFirstName ?? "",
            fiscalLastName: data.fiscalLastName ?? "",
            fiscalCodiceFiscale: data.fiscalCodiceFiscale ?? "",
            dateOfBirth: data.dateOfBirth ? data.dateOfBirth.slice(0, 10) : "",
            placeOfBirth: data.placeOfBirth ?? "",
            countryOfBirth: data.countryOfBirth ?? "",
            businessName: data.businessName ?? "",
            legalForm: data.legalForm ?? "",
            vatNumber: data.vatNumber ?? "",
            businessRegistrationNumber: data.businessRegistrationNumber ?? "",
            leiCode: data.leiCode ?? "",
            taxResidenceCountry: data.taxResidenceCountry ?? "",
            foreignTin: data.foreignTin ?? "",
            fiscalIdIssuingCountry: data.fiscalIdIssuingCountry ?? "",
            registeredStreet: data.registeredStreet ?? "",
            registeredHouseNumber: data.registeredHouseNumber ?? "",
            registeredCity: data.registeredCity ?? "",
            registeredPostalCode: data.registeredPostalCode ?? "",
            registeredProvince: data.registeredProvince ?? "",
            registeredCountry: data.registeredCountry ?? "",
          });
          setAdditionalEuStatesText((data.additionalEuStates ?? []).join(", "));
          setDeclarationAccepted(!!data.fiscalDeclarationAcceptedAt);
          if (data.representative) {
            setRepFields({
              firstName: data.representative.firstName,
              lastName: data.representative.lastName,
              codiceFiscale: data.representative.codiceFiscale ?? "",
              role: data.representative.role ?? "",
            });
          }
        } else {
          setProfile(null);
        }
      })
      .catch(() => setProfile(null));
  }, [token]);

  // Applica la categoria scelta nella schermata precedente una sola volta
  // (mai su ogni render/refetch), e mai sovrascrivendo un entityType già
  // salvato per davvero — solo quando il profilo non ne aveva ancora uno.
  useEffect(() => {
    if (prefillApplied || profile === undefined) return;
    if (!profile?.entityType && (prefillEntityType === "PRIVATE_INDIVIDUAL" || prefillEntityType === "SOLE_PROPRIETOR" || prefillEntityType === "BUSINESS")) {
      setEntityType(prefillEntityType);
    }
    setPrefillApplied(true);
  }, [prefillApplied, profile, prefillEntityType]);

  useEffect(() => {
    if (!isLoading && !user) router.replace("/accedi?redirect=/dashboard/fiscale");
    if (!isLoading && user && !user.isProfessional) router.replace("/dashboard");
  }, [isLoading, user, router]);

  function setField(key: string, value: string) {
    setFields((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    if (!token) return;
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    const payload = {
      entityType: entityType || undefined,
      fiscalFirstName: fields.fiscalFirstName || undefined,
      fiscalLastName: fields.fiscalLastName || undefined,
      fiscalCodiceFiscale: fields.fiscalCodiceFiscale || undefined,
      dateOfBirth: fields.dateOfBirth || undefined,
      placeOfBirth: fields.placeOfBirth || undefined,
      countryOfBirth: fields.countryOfBirth || undefined,
      businessName: fields.businessName || undefined,
      legalForm: fields.legalForm || undefined,
      vatNumber: fields.vatNumber || undefined,
      businessRegistrationNumber: fields.businessRegistrationNumber || undefined,
      leiCode: fields.leiCode || undefined,
      additionalEuStates: additionalEuStatesText
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean),
      taxResidenceCountry: fields.taxResidenceCountry || undefined,
      foreignTin: fields.foreignTin || undefined,
      fiscalIdIssuingCountry: fields.fiscalIdIssuingCountry || undefined,
      registeredStreet: fields.registeredStreet || undefined,
      registeredHouseNumber: fields.registeredHouseNumber || undefined,
      registeredCity: fields.registeredCity || undefined,
      registeredPostalCode: fields.registeredPostalCode || undefined,
      registeredProvince: fields.registeredProvince || undefined,
      registeredCountry: fields.registeredCountry || undefined,
      representative:
        entityType === "BUSINESS" && repFields.firstName && repFields.lastName
          ? { firstName: repFields.firstName, lastName: repFields.lastName, codiceFiscale: repFields.codiceFiscale || undefined, role: repFields.role || undefined }
          : undefined,
      // Mai `false`: il bottone "Salva" resta disabilitato finché la
      // casella non è spuntata (vedi sotto), quindi questo ramo invia
      // sempre `true` quando raggiunto.
      fiscalDeclarationAccepted: declarationAccepted || undefined,
    };

    // Validato qui con la STESSA `professionalFiscalProfileSchema` già usata
    // dal server (ZodValidationPipe, unica fonte di verità): un payload che
    // supera questo controllo non può più essere rifiutato dal server per lo
    // stesso motivo — nessun messaggio Zod grezzo arriva mai fino all'utente,
    // sostituito con il nome esatto del campo (stessa etichetta del form
    // sopra) e il motivo in italiano.
    const parsed = professionalFiscalProfileSchema.safeParse(payload);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      if (!issue) {
        setSaveError("Alcuni dati inseriti non sono validi.");
        setSaving(false);
        return;
      }
      const label = fiscalFieldLabel(issue.path);
      let reason: string;
      switch (issue.code) {
        case "too_big": {
          const tooBig = issue;
          reason =
            tooBig.type === "array"
              ? `puoi indicarne al massimo ${tooBig.maximum}.`
              : tooBig.maximum === 2
                ? "deve essere un codice a 2 lettere (es. IT), non il nome esteso del paese."
                : `non può superare ${tooBig.maximum} caratteri.`;
          break;
        }
        case "too_small": {
          const tooSmall = issue;
          reason = tooSmall.minimum === 1 ? "è obbligatorio." : `deve contenere almeno ${tooSmall.minimum} caratteri.`;
          break;
        }
        default:
          reason = "non è valido.";
      }
      setSaveError(`${label}: ${reason}`);
      setSaving(false);
      return;
    }

    try {
      const updated = await apiClient.updateMyFiscalProfile(token, parsed.data);
      setProfile(updated);
      setSaveSuccess(true);
      setVerificationKey((k) => k + 1);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Impossibile salvare i dati fiscali.");
    } finally {
      setSaving(false);
    }
  }

  async function handleStripeConnect() {
    if (!token) return;
    setStripeLoading(true);
    setStripeError(null);
    try {
      const { url } = await apiClient.createStripeConnectLink(token);
      window.location.href = url;
    } catch (e) {
      setStripeError(e instanceof Error ? e.message : "Impossibile avviare l'attivazione dei pagamenti.");
    } finally {
      setStripeLoading(false);
    }
  }

  // Dashboard Express di Stripe: accrediti, bonifici e IBAN (docs/CHANGELOG.md §238).
  async function handleStripeDashboard() {
    if (!token) return;
    setStripeLoading(true);
    setStripeError(null);
    try {
      const { url } = await apiClient.createStripeDashboardLink(token);
      window.location.href = url;
    } catch (e) {
      setStripeError(e instanceof Error ? e.message : "Impossibile aprire il tuo conto Stripe.");
      setStripeLoading(false);
    }
  }

  if (isLoading || profile === undefined) {
    return (
      <Section title="Dati fiscali e pagamenti">
        <Text>Caricamento...</Text>
      </Section>
    );
  }

  const adminVerification = VERIFICATION_LABEL[profile?.verificationStatus ?? "UNVERIFIED"];
  // Controlli in tempo reale, gli stessi che rifà il server al salvataggio
  // (docs/CHANGELOG.md §243): forma, e coerenza del codice fiscale con nome,
  // cognome e data di nascita.
  const cfCheck = checkFiscalId(fields.fiscalCodiceFiscale ?? "", fields.fiscalIdIssuingCountry, "codiceFiscale");
  const pivaCheck = checkFiscalId(fields.vatNumber ?? "", fields.fiscalIdIssuingCountry, "vatNumber");
  const liveErrors = fiscalFieldErrors({
    entityType: entityType || null,
    fiscalIdIssuingCountry: fields.fiscalIdIssuingCountry,
    fiscalFirstName: fields.fiscalFirstName,
    fiscalLastName: fields.fiscalLastName,
    fiscalCodiceFiscale: fields.fiscalCodiceFiscale,
    dateOfBirth: /^\d{4}-\d{2}-\d{2}$/.test(fields.dateOfBirth ?? "") ? fields.dateOfBirth : null,
    vatNumber: fields.vatNumber,
    representative: repFields,
  });
  const liveError = (field: string) => liveErrors.find((e) => e.field === field)?.message;
  // Esito del controllo all'Agenzia delle Entrate per il valore salvato (non per uno appena cambiato).
  const officialCheck = (kind: TaxIdKind, value: string | undefined) => {
    const check = profile?.taxIdChecks?.find((c) => c.kind === kind);
    if (!check || check.value !== (value ?? "").trim().toUpperCase().replace(/[\s-]/g, "")) return { error: undefined, hint: undefined };
    if (check.status === "INVALID") return { error: taxIdCheckMessage(check), hint: undefined };
    return { error: undefined, hint: taxIdCheckMessage(check) };
  };
  const cfOfficial = officialCheck("CODICE_FISCALE", fields.fiscalCodiceFiscale);
  const vatOfficial = officialCheck("PARTITA_IVA", fields.vatNumber);
  const hasLiveErrors = liveErrors.length > 0;

  return (
    <Section title="Dati fiscali e pagamenti" maxWidth={760}>
      <YStack gap="$5">
        <Text fontSize={14} color={brand.grafite70}>
          Questi dati non sono mai visibili pubblicamente: servono per la rendicontazione fiscale (DAC7), che la legge ci chiede per tutti,
          anche per chi si fa pagare solo direttamente. Il tuo profilo compare nelle ricerche quando li hai compilati. Ai clienti mostriamo solo se
          sei un privato o un professionista con partita IVA.
        </Text>
        {/* Cosa manca per essere pubblici e per inviare preventivi (docs/CHANGELOG.md §241, §243). */}
        {verification ? <VerificationSteps status={verification} here="fiscale" /> : null}

        {/* Esito della revisione manuale dell'admin (area Finanza), solo se c'è qualcosa da fare. */}
        {profile && (profile.verificationStatus === "REJECTED" || profile.verificationStatus === "REQUIRES_UPDATE") ? (
          <YStack gap="$1">
            <XStack alignItems="center" gap="$2">
              <Badge variant={adminVerification.variant}>{adminVerification.label}</Badge>
            </XStack>
            {profile.verificationNote ? (
              <Text fontSize={13} color={brand.urgenza}>
                {profile.verificationNote}
              </Text>
            ) : null}
          </YStack>
        ) : null}

        <Surface padding="$4">
          <YStack gap="$4">
            <Text fontSize={15} fontWeight="700">
              Tipo di attività
            </Text>
            {/* Tre categorie, non due — richiesta esplicita dell'utente:
                "Privato" (persona fisica senza P.IVA), "Professionista"
                (persona fisica CON P.IVA, es. libero professionista/ditta
                individuale), "Azienda" (impresa/società con personalità
                giuridica propria). */}
            <XStack gap="$3" flexWrap="wrap">
              {(
                [
                  { value: "PRIVATE_INDIVIDUAL", label: "Privato" },
                  { value: "SOLE_PROPRIETOR", label: "Professionista" },
                  { value: "BUSINESS", label: "Azienda" },
                ] as const
              ).map((type) => (
                <Button key={type.value} variant={entityType === type.value ? "primary" : "secondary"} onPress={() => setEntityType(type.value)}>
                  {type.label}
                </Button>
              ))}
            </XStack>
          </YStack>
        </Surface>

        {entityType === "PRIVATE_INDIVIDUAL" && (
          <Surface padding="$4">
            <YStack gap="$3">
              <Text fontSize={15} fontWeight="700">
                Dati anagrafici
              </Text>
              <Field label="Nome" accessibilityLabel="Nome" value={fields.fiscalFirstName ?? ""} onChangeText={(v) => setField("fiscalFirstName", v)} />
              <Field label="Cognome" accessibilityLabel="Cognome" value={fields.fiscalLastName ?? ""} onChangeText={(v) => setField("fiscalLastName", v)} />
              <Field
                label="Codice fiscale"
                accessibilityLabel="Codice fiscale"
                value={fields.fiscalCodiceFiscale ?? ""}
                onChangeText={(v) => setField("fiscalCodiceFiscale", v)}
                autoCapitalize="characters"
                error={cfCheck.message ?? liveError("fiscalCodiceFiscale") ?? cfOfficial.error}
                hint={cfOfficial.hint}
              />
              <Field
                label="Data di nascita"
                accessibilityLabel="Data di nascita"
                value={fields.dateOfBirth ?? ""}
                onChangeText={(v) => setField("dateOfBirth", v)}
                placeholder="AAAA-MM-GG"
                error={liveError("dateOfBirth")}
                hint="Come sul documento: la confrontiamo con il codice fiscale."
              />
              <Field label="Luogo di nascita (Comune e Provincia)" accessibilityLabel="Luogo di nascita" value={fields.placeOfBirth ?? ""} onChangeText={(v) => setField("placeOfBirth", v)} />
              <Field label="Paese di nascita (ISO, es. IT)" accessibilityLabel="Paese di nascita" value={fields.countryOfBirth ?? ""} onChangeText={(v) => setField("countryOfBirth", v)} />
            </YStack>
          </Surface>
        )}

        {/* "Professionista" — persona fisica con P.IVA: stessi dati
            anagrafici di "Privato" (resta una persona fisica, non una
            società a sé) più Partita IVA e, solo se già posseduto, il
            numero REA/CCIAA. Nessun campo "Forma giuridica"/legale
            rappresentante qui — quelli sono pertinenti solo a "Azienda",
            un libero professionista/ditta individuale è già lui stesso il
            titolare. */}
        {entityType === "SOLE_PROPRIETOR" && (
          <Surface padding="$4">
            <YStack gap="$3">
              <Text fontSize={15} fontWeight="700">
                Dati anagrafici
              </Text>
              <Field label="Nome" accessibilityLabel="Nome" value={fields.fiscalFirstName ?? ""} onChangeText={(v) => setField("fiscalFirstName", v)} />
              <Field label="Cognome" accessibilityLabel="Cognome" value={fields.fiscalLastName ?? ""} onChangeText={(v) => setField("fiscalLastName", v)} />
              <Field
                label="Codice fiscale"
                accessibilityLabel="Codice fiscale"
                value={fields.fiscalCodiceFiscale ?? ""}
                onChangeText={(v) => setField("fiscalCodiceFiscale", v)}
                autoCapitalize="characters"
                error={cfCheck.message ?? liveError("fiscalCodiceFiscale") ?? cfOfficial.error}
                hint={cfOfficial.hint}
              />
              <Field
                label="Data di nascita"
                accessibilityLabel="Data di nascita"
                value={fields.dateOfBirth ?? ""}
                onChangeText={(v) => setField("dateOfBirth", v)}
                placeholder="AAAA-MM-GG"
                error={liveError("dateOfBirth")}
                hint="Come sul documento: la confrontiamo con il codice fiscale."
              />
              <Field label="Luogo di nascita (Comune e Provincia)" accessibilityLabel="Luogo di nascita" value={fields.placeOfBirth ?? ""} onChangeText={(v) => setField("placeOfBirth", v)} />
              <Field label="Paese di nascita (ISO, es. IT)" accessibilityLabel="Paese di nascita" value={fields.countryOfBirth ?? ""} onChangeText={(v) => setField("countryOfBirth", v)} />

              <Text fontSize={15} fontWeight="700" marginTop="$2">
                Attività
              </Text>
              <Field
                label="Partita IVA"
                accessibilityLabel="Partita IVA"
                value={fields.vatNumber ?? ""}
                onChangeText={(v) => setField("vatNumber", v)}
                inputMode="numeric"
                error={pivaCheck.message ?? vatOfficial.error}
                hint={vatOfficial.hint}
              />
              <Field
                label="Nome dell'attività (opzionale)"
                accessibilityLabel="Nome dell'attività"
                value={fields.businessName ?? ""}
                onChangeText={(v) => setField("businessName", v)}
                hint="Insegna/nome commerciale, se ne usi uno diverso dal tuo nome anagrafico."
              />
              <Field
                label="Numero di iscrizione al Registro delle Imprese (REA / CCIAA, opzionale)"
                accessibilityLabel="Numero REA / CCIAA"
                value={fields.businessRegistrationNumber ?? ""}
                onChangeText={(v) => setField("businessRegistrationNumber", v)}
              />
            </YStack>
          </Surface>
        )}

        {entityType === "BUSINESS" && (
          <Surface padding="$4">
            <YStack gap="$3">
              <Text fontSize={15} fontWeight="700">
                Dati dell&apos;impresa
              </Text>
              <Field label="Ragione sociale" accessibilityLabel="Ragione sociale" value={fields.businessName ?? ""} onChangeText={(v) => setField("businessName", v)} />
              <Field label="Forma giuridica" accessibilityLabel="Forma giuridica" value={fields.legalForm ?? ""} onChangeText={(v) => setField("legalForm", v)} placeholder="es. Ditta individuale, SRL" />
              <Field
                label="Partita IVA"
                accessibilityLabel="Partita IVA"
                value={fields.vatNumber ?? ""}
                onChangeText={(v) => setField("vatNumber", v)}
                inputMode="numeric"
                error={pivaCheck.message ?? vatOfficial.error}
                hint={vatOfficial.hint}
              />
              <Field
                label="Numero di iscrizione al Registro delle Imprese (REA / CCIAA)"
                accessibilityLabel="Numero REA / CCIAA"
                value={fields.businessRegistrationNumber ?? ""}
                onChangeText={(v) => setField("businessRegistrationNumber", v)}
              />
              <Field
                label="Codice LEI (opzionale)"
                accessibilityLabel="Codice LEI"
                value={fields.leiCode ?? ""}
                onChangeText={(v) => setField("leiCode", v)}
                hint={`Solo se l'entità ne possiede già uno — non obbligatorio per operare su ${BRAND.name}.`}
              />
              <Field
                label="Stati membri UE aggiuntivi con stabile organizzazione (opzionale)"
                accessibilityLabel="Stati membri UE aggiuntivi"
                value={additionalEuStatesText}
                onChangeText={setAdditionalEuStatesText}
                placeholder="es. FR, DE"
                hint="Codici ISO separati da virgola, solo se l'entità ha una sede operativa anche in altri paesi UE."
              />

              <Text fontSize={15} fontWeight="700" marginTop="$2">
                Legale rappresentante
              </Text>
              <Field label="Nome" accessibilityLabel="Nome del legale rappresentante" value={repFields.firstName} onChangeText={(v) => setRepFields((p) => ({ ...p, firstName: v }))} />
              <Field label="Cognome" accessibilityLabel="Cognome del legale rappresentante" value={repFields.lastName} onChangeText={(v) => setRepFields((p) => ({ ...p, lastName: v }))} />
              <Field
                label="Codice fiscale"
                accessibilityLabel="Codice fiscale del legale rappresentante"
                value={repFields.codiceFiscale}
                onChangeText={(v) => setRepFields((p) => ({ ...p, codiceFiscale: v }))}
                autoCapitalize="characters"
                error={liveError("representative.codiceFiscale")}
                hint="È lui che farà la verifica con documento e selfie."
              />
              <Field label="Ruolo" accessibilityLabel="Ruolo del legale rappresentante" value={repFields.role} onChangeText={(v) => setRepFields((p) => ({ ...p, role: v }))} placeholder="es. Amministratore unico" />
            </YStack>
          </Surface>
        )}

        {entityType !== "" && (
          <Surface padding="$4">
            <YStack gap="$3">
              <Text fontSize={15} fontWeight="700">
                Residenza fiscale
              </Text>
              <Field label="Paese di residenza fiscale (ISO, es. IT)" accessibilityLabel="Paese di residenza fiscale" value={fields.taxResidenceCountry ?? ""} onChangeText={(v) => setField("taxResidenceCountry", v)} />
              <Field label="TIN estero (se residenza fiscale fuori Italia)" accessibilityLabel="TIN estero" value={fields.foreignTin ?? ""} onChangeText={(v) => setField("foreignTin", v)} />
              <Field
                label="Stato di rilascio del codice fiscale / NIF / P.IVA (ISO, es. IT)"
                accessibilityLabel="Stato di rilascio del codice fiscale"
                value={fields.fiscalIdIssuingCountry ?? ""}
                onChangeText={(v) => setField("fiscalIdIssuingCountry", v)}
                hint="Se diverso dalla residenza fiscale — determina anche quale controllo di formato applichiamo qui sopra."
              />
              <XStack gap="$3" flexWrap="wrap">
                <Field label="Via / Piazza" accessibilityLabel="Via / Piazza" value={fields.registeredStreet ?? ""} onChangeText={(v) => setField("registeredStreet", v)} flex={3} />
                <Field label="Numero civico" accessibilityLabel="Numero civico" value={fields.registeredHouseNumber ?? ""} onChangeText={(v) => setField("registeredHouseNumber", v)} flex={1} />
              </XStack>
              <XStack gap="$3" flexWrap="wrap">
                <Field label="Città" accessibilityLabel="Città di residenza fiscale" value={fields.registeredCity ?? ""} onChangeText={(v) => setField("registeredCity", v)} flex={2} />
                <Field label="CAP" accessibilityLabel="CAP" value={fields.registeredPostalCode ?? ""} onChangeText={(v) => setField("registeredPostalCode", v)} flex={1} />
                <Field label="Provincia" accessibilityLabel="Provincia" value={fields.registeredProvince ?? ""} onChangeText={(v) => setField("registeredProvince", v)} flex={1} />
              </XStack>
              <Field label="Paese (ISO, es. IT)" accessibilityLabel="Paese di residenza (indirizzo)" value={fields.registeredCountry ?? ""} onChangeText={(v) => setField("registeredCountry", v)} />
            </YStack>
          </Surface>
        )}

        {entityType !== "" && (
          <XStack
            alignItems="flex-start"
            gap="$2"
            cursor="pointer"
            onPress={() => setDeclarationAccepted((v) => !v)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: declarationAccepted }}
          >
            <YStack
              width={18}
              height={18}
              marginTop={2}
              borderRadius="$1"
              borderWidth={2}
              borderColor={declarationAccepted ? brand.cianografia : brand.filetto}
              backgroundColor={declarationAccepted ? brand.cianografia : brand.calce}
              alignItems="center"
              justifyContent="center"
              flexShrink={0}
            >
              {declarationAccepted ? <Icon name="check" size={12} strokeWidth={2.5} color="white" /> : null}
            </YStack>
            <Text fontSize="$2" color={brand.grafite70} lineHeight={18}>
              Salvando i dati dichiaro che le informazioni fornite sono corrette e che svolgo l&apos;attività indicata sulla piattaforma nel
              rispetto degli obblighi fiscali applicabili alla mia situazione.
            </Text>
          </XStack>
        )}

        <XStack gap="$3" alignItems="center" flexWrap="wrap">
          <Button variant="primary" onPress={handleSave} disabled={saving || !entityType || !declarationAccepted || hasLiveErrors}>
            {saving ? "Salvataggio..." : "Salva dati fiscali"}
          </Button>
          {saveSuccess && (
            <Text fontSize={13} color={brand.verificato}>
              Salvato.
            </Text>
          )}
          {hasLiveErrors && !saveError ? (
            <Text fontSize={13} color={brand.urgenza}>
              Correggi i campi segnati in rosso per salvare.
            </Text>
          ) : null}
          {saveError && (
            <Text fontSize={13} color={brand.urgenza}>
              {saveError}
              {/* Un account appena registrato non ha ancora un profilo
                  pubblico (creato solo al primo salvataggio di
                  /dashboard/profilo, da cui dipende anche quello fiscale)
                  — link diretto invece di lasciare l'utente a indovinare
                  cosa "completare". */}
              {saveError === "Completa prima il tuo profilo professionista." ? (
                <>
                  {" "}
                  <Link href="/dashboard/profilo" style={{ color: brand.cianografiaScuro, fontWeight: 700, textDecoration: "underline" }}>
                    Vai al tuo profilo pubblico →
                  </Link>
                </>
              ) : null}
            </Text>
          )}
        </XStack>

        <Surface padding="$4">
          <YStack gap="$3">
            <Text fontSize={15} fontWeight="700">
              Pagamenti tramite {BRAND.name}
            </Text>
            <Text fontSize={13} color={brand.grafite70}>
              Nel preventivo scegli tu come farti pagare: diretto, acconto online (la percentuale la decidi tu) con saldo online, o acconto
              online con saldo diretto. Quello che il cliente paga online lo teniamo noi e te lo
              accreditiamo sul tuo conto Stripe quando il cliente conferma il lavoro, o 7 giorni dopo la chiusura, meno il costo di Stripe e
              la commissione {BRAND.name} del 5%. Attiva i pagamenti per ricevere gli accrediti: finché non lo fai i soldi restano in custodia.
              Quello che il cliente paga direttamente te lo dà come vi accordate. La verifica su Stripe serve solo per offrire
              l&apos;acconto online: quando è completata il tuo profilo mostra anche il badge &quot;Identità verificata da Stripe&quot;.
            </Text>
            {profile?.stripeChargesEnabled ? (
              <XStack gap="$3" alignItems="center" flexWrap="wrap">
                <Badge variant="verificato">Pagamenti attivi</Badge>
                <Button variant="secondary" onPress={handleStripeDashboard} disabled={stripeLoading}>
                  {stripeLoading ? "Attendere..." : "Vedi accrediti e IBAN su Stripe"}
                </Button>
                {stripeError && (
                  <Text fontSize={13} color={brand.urgenza}>
                    {stripeError}
                  </Text>
                )}
              </XStack>
            ) : (
              <XStack gap="$3" alignItems="center" flexWrap="wrap">
                <Button variant="secondary" onPress={handleStripeConnect} disabled={stripeLoading}>
                  {stripeLoading
                    ? "Attendere..."
                    : profile?.stripeConnectAccountId
                      ? "Completa la verifica su Stripe"
                      : `Attiva pagamenti tramite ${BRAND.name}`}
                </Button>
                {profile?.stripeConnectAccountId && profile.stripeRequirementsStatus && (
                  <Text fontSize={13} color={brand.grafite70}>
                    Stripe ti chiede ancora: {profile.stripeRequirementsStatus}
                  </Text>
                )}
                {stripeError && (
                  <Text fontSize={13} color={brand.urgenza}>
                    {stripeError}
                  </Text>
                )}
              </XStack>
            )}
          </YStack>
        </Surface>
      </YStack>
    </Section>
  );
}
