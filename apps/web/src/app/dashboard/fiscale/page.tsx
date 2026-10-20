"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button, Field, Icon, Surface, Section, Text, XStack, YStack, brand, Badge, radiusDoc } from "@professionisti/ui";
import type { ProfessionalFiscalProfile, FiscalVerificationStatus, PayoutIbanView } from "@professionisti/api-client";
import { checkFiscalId, findComuneByName, fiscalFieldErrors, professionalFiscalProfileSchema, taxIdCheckMessage, type MyVerificationStatus, type TaxIdKind } from "@professionisti/shared";
import { apiClient } from "@/lib/apiClient";
import { PayoutIbanCard } from "@/components/PayoutIbanCard";
import { useAuth } from "@/lib/AuthContext";
import { JourneyProgress, journeyCurrent, setupJourney } from "@/components/verification/SetupJourney";
import { OnlinePaymentsCard } from "@/components/OnlinePaymentsCard";
import { AddressAutocompleteInput } from "@/components/AddressAutocompleteInput";

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

type EntityType = "PRIVATE_INDIVIDUAL" | "SOLE_PROPRIETOR" | "BUSINESS";

// Stesse parole della registrazione.
const ENTITY_TYPE_LABELS: Record<EntityType, string> = {
  PRIVATE_INDIVIDUAL: "Privato, senza Partita IVA",
  SOLE_PROPRIETOR: "Con Partita IVA",
  BUSINESS: "Azienda",
};

function isEntityType(value: string | null | undefined): value is EntityType {
  return value === "PRIVATE_INDIVIDUAL" || value === "SOLE_PROPRIETOR" || value === "BUSINESS";
}

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

// Stesso aspetto dei campi `Field` per i campi nativi (suggerimenti di Google, calendario).
const addressInputStyle = {
  width: "100%",
  height: 50,
  boxSizing: "border-box" as const,
  padding: "0 12px",
  borderRadius: radiusDoc,
  border: `1px solid ${brand.filetto}`,
  background: brand.calce,
  fontSize: 15,
  fontFamily: "inherit",
  color: brand.grafite,
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
  // Tipo scelto in registrazione (o via ?entityType= dai vecchi link a
  // /dashboard/tipo-attivita), mai già salvato: un account appena creato non ha ancora un ProfessionalProfile
  // (creato solo al primo salvataggio di /dashboard/profilo), quindi
  // ProfessionalFiscalProfile — che vi si aggancia 1:1 — non può esistere
  // prima di allora. Il picker qui sotto arriva solo PRE-selezionato
  // (stato locale, non ancora persistito); il salvataggio vero avviene solo
  // al click su "Salva dati fiscali", quando il messaggio d'errore guida
  // esplicitamente verso /dashboard/profilo se non ancora completato.
  // Senza parametro vale il tipo scelto in registrazione (docs/CHANGELOG.md §243).
  const prefillEntityType = searchParams.get("entityType") ?? user?.signupEntityType ?? null;
  const [prefillApplied, setPrefillApplied] = useState(false);

  const [profile, setProfile] = useState<ProfessionalFiscalProfile | null | undefined>(undefined);
  const [entityType, setEntityType] = useState<"PRIVATE_INDIVIDUAL" | "SOLE_PROPRIETOR" | "BUSINESS" | "">("");
  // Tipo già deciso: quello salvato, altrimenti quello della registrazione.
  const lockedEntityType: EntityType | null = isEntityType(profile?.entityType)
    ? profile.entityType
    : isEntityType(prefillEntityType)
      ? prefillEntityType
      : null;
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
  // Verifica in 3 passi (docs/CHANGELOG.md §253): si ricarica a ogni salvataggio.
  const [verification, setVerification] = useState<MyVerificationStatus | null>(null);
  const [verificationKey, setVerificationKey] = useState(0);
  // IBAN per la DAC7, primo passo di "Attiva i pagamenti online" (docs/CHANGELOG.md §250).
  const [payoutIban, setPayoutIban] = useState<PayoutIbanView | null | undefined>(undefined);
  const [ibanStepOpen, setIbanStepOpen] = useState(false);
  // Modulo in due passi, uno alla volta (docs/CHANGELOG.md §262): 1 i tuoi
  // dati, 2 l'indirizzo. `editing` riapre il modulo da dati già completi.
  const [formStep, setFormStep] = useState<1 | 2>(1);
  const [editing, setEditing] = useState(false);
  const [abroad, setAbroad] = useState(false);

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
      .myPayoutIban(token)
      .then(setPayoutIban)
      .catch(() => setPayoutIban(null));
  }, [token]);

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
          setAbroad(!!data.taxResidenceCountry && data.taxResidenceCountry.toUpperCase() !== "IT");
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
      // In Italia il paese è sempre IT: niente campi da compilare.
      taxResidenceCountry: abroad ? fields.taxResidenceCountry?.toUpperCase() || undefined : "IT",
      foreignTin: fields.foreignTin || undefined,
      fiscalIdIssuingCountry: abroad ? fields.taxResidenceCountry?.toUpperCase() || undefined : "IT",
      registeredStreet: fields.registeredStreet || undefined,
      registeredHouseNumber: fields.registeredHouseNumber || undefined,
      registeredCity: fields.registeredCity || undefined,
      registeredPostalCode: fields.registeredPostalCode || undefined,
      registeredProvince: fields.registeredProvince || undefined,
      registeredCountry: abroad ? fields.taxResidenceCountry?.toUpperCase() || undefined : "IT",
      representative:
        entityType === "BUSINESS" && repFields.firstName && repFields.lastName
          ? { firstName: repFields.firstName.trim(), lastName: repFields.lastName.trim(), codiceFiscale: repFields.codiceFiscale.trim() || undefined, role: repFields.role || undefined }
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
      setEditing(false);
      setFormStep(1);
      setVerificationKey((k) => k + 1);
      window.scrollTo({ top: 0 });
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

  // Senza IBAN si apre prima il passo dell'IBAN, poi si va su Stripe.
  function handleActivate() {
    if (payoutIban === null) setIbanStepOpen(true);
    else void handleStripeConnect();
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

  const holderName =
    entityType === "BUSINESS" ? (fields.businessName ?? "") : [fields.fiscalFirstName, fields.fiscalLastName].filter(Boolean).join(" ");

  if (isLoading || profile === undefined) {
    return (
      <Section title="Dati fiscali e pagamenti">
        <Text>Caricamento...</Text>
      </Section>
    );
  }

  const adminVerification = VERIFICATION_LABEL[profile?.verificationStatus ?? "UNVERIFIED"];
  const issuingCountry = abroad ? fields.taxResidenceCountry : "IT";
  // Controlli in tempo reale, gli stessi che rifà il server al salvataggio
  // (docs/CHANGELOG.md §253): forma, e coerenza del codice fiscale con nome,
  // cognome e data di nascita.
  const cfCheck = checkFiscalId(fields.fiscalCodiceFiscale ?? "", issuingCountry, "codiceFiscale");
  const pivaCheck = checkFiscalId(fields.vatNumber ?? "", issuingCountry, "vatNumber");
  const liveErrors = fiscalFieldErrors({
    entityType: entityType || null,
    fiscalIdIssuingCountry: issuingCountry,
    fiscalFirstName: fields.fiscalFirstName,
    fiscalLastName: fields.fiscalLastName,
    fiscalCodiceFiscale: fields.fiscalCodiceFiscale,
    dateOfBirth: /^\d{4}-\d{2}-\d{2}$/.test(fields.dateOfBirth ?? "") ? fields.dateOfBirth : null,
    vatNumber: fields.vatNumber,
    representative: repFields,
  });
  const liveError = (field: string) => liveErrors.find((e) => e.field === field)?.message;
  // Esito della verifica per il valore salvato (non per uno appena cambiato).
  const officialCheck = (kind: TaxIdKind, value: string | undefined) => {
    const check = profile?.taxIdChecks?.find((c) => c.kind === kind);
    if (!check || check.value !== (value ?? "").trim().toUpperCase().replace(/[\s-]/g, "")) return { error: undefined, hint: undefined };
    if (check.status === "INVALID") return { error: taxIdCheckMessage(check), hint: undefined };
    return { error: undefined, hint: taxIdCheckMessage(check) };
  };
  const cfOfficial = officialCheck("CODICE_FISCALE", fields.fiscalCodiceFiscale);
  const vatOfficial = officialCheck("PARTITA_IVA", fields.vatNumber);
  const hasLiveErrors = liveErrors.length > 0 || !!cfCheck.message || !!pivaCheck.message;

  // Solo i dati che servono davvero (richiesta dell'utente, docs/CHANGELOG.md
  // §262): quelli per la verifica di codice fiscale, P.IVA e identità e quelli
  // che la DAC7 chiede per ciascun tipo. Il luogo di nascita serve solo a chi
  // non ha un codice fiscale italiano.
  const filled = (key: string) => (fields[key] ?? "").trim().length > 0;
  const isPerson = entityType === "PRIVATE_INDIVIDUAL" || entityType === "SOLE_PROPRIETOR";
  const step1Missing: string[] = [];
  if (isPerson) {
    if (!filled("fiscalFirstName")) step1Missing.push("Nome");
    if (!filled("fiscalLastName")) step1Missing.push("Cognome");
    if (!filled("fiscalCodiceFiscale") && !(abroad && filled("foreignTin"))) step1Missing.push("Codice fiscale");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fields.dateOfBirth ?? "")) step1Missing.push("Data di nascita");
    if (entityType === "SOLE_PROPRIETOR" && !filled("vatNumber")) step1Missing.push("Partita IVA");
  } else if (entityType === "BUSINESS") {
    if (!filled("businessName")) step1Missing.push("Ragione sociale");
    if (!filled("vatNumber")) step1Missing.push("Partita IVA");
    if (!filled("businessRegistrationNumber")) step1Missing.push("Numero REA");
    if (!repFields.firstName.trim() || !repFields.lastName.trim()) step1Missing.push("Legale rappresentante");
  } else {
    step1Missing.push("Tipo");
  }
  if (abroad && !filled("taxResidenceCountry")) step1Missing.push("Paese");
  const step2Missing = ["registeredStreet", "registeredPostalCode", "registeredCity"].filter((key) => !filled(key));
  // Provincia in sigla di 2 lettere (richiesta dell'utente, docs/CHANGELOG.md §263).
  if (!abroad && !/^[A-Z]{2}$/.test(fields.registeredProvince ?? "")) step2Missing.push("registeredProvince");

  const fiscalComplete = verification?.fiscalDataComplete ?? false;
  const toFix = verification?.taxIdState === "TO_FIX";
  const showForm = editing || !fiscalComplete || toFix;
  const steps = verification ? setupJourney(verification, !!profile?.stripeChargesEnabled) : null;
  const paymentsStep = steps?.find((step) => step.key === "payments") ?? null;
  const nextStep = steps ? journeyCurrent(steps) : null;
  const typeLabel = isEntityType(entityType) ? ENTITY_TYPE_LABELS[entityType] : null;
  const invalidChecks = (verification?.taxIdChecks ?? []).filter((check) => check.status === "INVALID");

  const cfField = (
    <Field
      label={abroad ? "Codice fiscale italiano (se ce l'hai)" : "Codice fiscale"}
      accessibilityLabel="Codice fiscale"
      value={fields.fiscalCodiceFiscale ?? ""}
      onChangeText={(v) => setField("fiscalCodiceFiscale", v.toUpperCase())}
      autoCapitalize="characters"
      error={cfCheck.message ?? liveError("fiscalCodiceFiscale") ?? cfOfficial.error}
      hint={cfOfficial.hint}
    />
  );
  const vatField = (
    <Field
      label="Partita IVA"
      accessibilityLabel="Partita IVA"
      value={fields.vatNumber ?? ""}
      onChangeText={(v) => setField("vatNumber", v)}
      inputMode="numeric"
      error={pivaCheck.message ?? vatOfficial.error}
      hint={vatOfficial.hint}
    />
  );

  return (
    <Section title="Dati fiscali e pagamenti" maxWidth={640}>
      <YStack gap="$5">
        {steps ? <JourneyProgress steps={steps} here={!showForm && paymentsStep?.state === "current" ? "payments" : "fiscal"} /> : null}

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

        {showForm ? (
          <Surface gap="$4">
            <YStack gap="$1">
              <Text fontSize={13} fontWeight="700" color={brand.grafite70}>
                Parte {formStep} di 2
              </Text>
              <Text fontFamily="$heading" fontWeight="800" fontSize="$6" color={brand.grafite}>
                {formStep === 1 ? (entityType === "BUSINESS" ? "Dati dell'azienda" : "I tuoi dati") : entityType === "BUSINESS" ? "Sede legale" : "Indirizzo di residenza"}
              </Text>
              {formStep === 1 ? (
                <Text fontSize={14} color={brand.grafite70}>
                  Non li vede nessun cliente.{" "}
                  <Link href="/dashboard/fiscale/dac7" style={{ color: brand.cianografiaScuro, fontWeight: 700 }}>
                    Perché li chiediamo
                  </Link>
                </Text>
              ) : null}
            </YStack>

            {toFix && formStep === 1 && invalidChecks.length > 0 ? (
              <XStack gap="$2" padding="$3" borderRadius={12} backgroundColor={brand.urgenzaVelo} alignItems="flex-start" role="alert">
                <Icon name="triangle-alert" size={18} strokeWidth={2} color={brand.urgenza} />
                <Text flex={1} fontSize={14} color={brand.grafite}>
                  {invalidChecks.map(taxIdCheckMessage).join(" ")}
                </Text>
              </XStack>
            ) : null}

            {formStep === 1 ? (
              <YStack gap="$3">
                {/* Tipo già scelto alla registrazione (o salvato): si mostra e
                    basta. La scelta resta solo per gli account senza un tipo. */}
                {lockedEntityType ? (
                  <XStack alignSelf="flex-start" gap="$2" alignItems="center" paddingHorizontal="$3" paddingVertical="$1.5" borderRadius={999} backgroundColor={brand.gesso}>
                    <Icon name={lockedEntityType === "BUSINESS" ? "briefcase" : "user-round"} size={15} strokeWidth={2} color={brand.grafite70} />
                    <Text fontSize={14} fontWeight="700" color={brand.grafite}>
                      {ENTITY_TYPE_LABELS[lockedEntityType]}
                    </Text>
                  </XStack>
                ) : (
                  <YStack gap="$2">
                    <Text fontSize={14} fontWeight="700" color={brand.grafite}>
                      Come lavori?
                    </Text>
                    <XStack gap="$2" flexWrap="wrap">
                      {(Object.keys(ENTITY_TYPE_LABELS) as EntityType[]).map((type) => (
                        <Button key={type} variant={entityType === type ? "primary" : "secondary"} onPress={() => setEntityType(type)}>
                          {ENTITY_TYPE_LABELS[type]}
                        </Button>
                      ))}
                    </XStack>
                  </YStack>
                )}

                {isPerson ? (
                  <>
                    <XStack gap="$3" flexWrap="wrap">
                      <YStack flex={1} flexBasis={0} minWidth={200}>
                        <Field label="Nome" accessibilityLabel="Nome" value={fields.fiscalFirstName ?? ""} onChangeText={(v) => setField("fiscalFirstName", v)} />
                      </YStack>
                      <YStack flex={1} flexBasis={0} minWidth={200}>
                        <Field label="Cognome" accessibilityLabel="Cognome" value={fields.fiscalLastName ?? ""} onChangeText={(v) => setField("fiscalLastName", v)} />
                      </YStack>
                    </XStack>
                    {cfField}
                    {/* Calendario del telefono o del browser (docs/CHANGELOG.md §263). */}
                    <YStack gap="$2">
                      <Text fontFamily="$body" fontSize={11} fontWeight="700" color={brand.grafite70}>
                        Data di nascita
                      </Text>
                      <input
                        type="date"
                        aria-label="Data di nascita"
                        value={fields.dateOfBirth ?? ""}
                        max={new Date().toISOString().slice(0, 10)}
                        onChange={(event) => setField("dateOfBirth", event.target.value)}
                        style={{ ...addressInputStyle, borderColor: liveError("dateOfBirth") ? brand.urgenza : brand.filetto }}
                      />
                      {liveError("dateOfBirth") ? (
                        <Text fontSize={13} color={brand.urgenza}>
                          {liveError("dateOfBirth")}
                        </Text>
                      ) : null}
                    </YStack>
                    {entityType === "SOLE_PROPRIETOR" ? vatField : null}
                  </>
                ) : null}

                {entityType === "BUSINESS" ? (
                  <>
                    <Field label="Ragione sociale" accessibilityLabel="Ragione sociale" value={fields.businessName ?? ""} onChangeText={(v) => setField("businessName", v)} />
                    {vatField}
                    <Field
                      label="Numero REA"
                      accessibilityLabel="Numero REA"
                      value={fields.businessRegistrationNumber ?? ""}
                      onChangeText={(v) => setField("businessRegistrationNumber", v)}
                      placeholder="es. RM-1234567"
                      hint="Lo trovi nella visura camerale."
                    />
                    <YStack gap="$1" marginTop="$2">
                      <Text fontSize={15} fontWeight="800" color={brand.grafite}>
                        Legale rappresentante
                      </Text>
                      <Text fontSize={13} color={brand.grafite70}>
                        Sarà lui a fare la verifica dell&apos;identità.
                      </Text>
                    </YStack>
                    <XStack gap="$3" flexWrap="wrap">
                      <YStack flex={1} flexBasis={0} minWidth={200}>
                        <Field label="Nome" accessibilityLabel="Nome del legale rappresentante" value={repFields.firstName} onChangeText={(v) => setRepFields((p) => ({ ...p, firstName: v }))} />
                      </YStack>
                      <YStack flex={1} flexBasis={0} minWidth={200}>
                        <Field label="Cognome" accessibilityLabel="Cognome del legale rappresentante" value={repFields.lastName} onChangeText={(v) => setRepFields((p) => ({ ...p, lastName: v }))} />
                      </YStack>
                    </XStack>
                    <Field
                      label="Codice fiscale"
                      accessibilityLabel="Codice fiscale del legale rappresentante"
                      value={repFields.codiceFiscale}
                      onChangeText={(v) => setRepFields((p) => ({ ...p, codiceFiscale: v.toUpperCase() }))}
                      autoCapitalize="characters"
                      error={liveError("representative.codiceFiscale")}
                    />
                  </>
                ) : null}

                {/* Fuori dall'Italia: paese e codice fiscale estero (DAC7). */}
                {entityType ? (
                  abroad ? (
                    <YStack gap="$3" padding="$3" borderRadius={12} backgroundColor={brand.gesso}>
                      <Field
                        label={entityType === "BUSINESS" ? "Paese della sede (sigla, es. FR)" : "Paese di residenza fiscale (sigla, es. FR)"}
                        accessibilityLabel="Paese di residenza fiscale"
                        value={fields.taxResidenceCountry ?? ""}
                        onChangeText={(v) => setField("taxResidenceCountry", v.toUpperCase().slice(0, 2))}
                        autoCapitalize="characters"
                      />
                      <Field label="Codice fiscale estero" accessibilityLabel="Codice fiscale estero" value={fields.foreignTin ?? ""} onChangeText={(v) => setField("foreignTin", v)} />
                      {isPerson && !filled("fiscalCodiceFiscale") ? (
                        <Field label="Luogo di nascita" accessibilityLabel="Luogo di nascita" value={fields.placeOfBirth ?? ""} onChangeText={(v) => setField("placeOfBirth", v)} />
                      ) : null}
                      <button type="button" className="fiscal-link-button" onClick={() => setAbroad(false)}>
                        Sono in Italia
                      </button>
                    </YStack>
                  ) : (
                    <button type="button" className="fiscal-link-button" onClick={() => setAbroad(true)}>
                      {entityType === "BUSINESS" ? "La sede è fuori dall'Italia?" : "Risiedi fuori dall'Italia?"}
                    </button>
                  )
                ) : null}

                <XStack gap="$3" alignItems="center" flexWrap="wrap" marginTop="$2">
                  <Button variant="primary" disabled={step1Missing.length > 0 || hasLiveErrors} opacity={step1Missing.length > 0 || hasLiveErrors ? 0.45 : 1} onPress={() => setFormStep(2)}>
                    Avanti
                  </Button>
                  {editing && fiscalComplete && !toFix ? (
                    <Button variant="secondary" onPress={() => setEditing(false)}>
                      Annulla
                    </Button>
                  ) : null}
                  {step1Missing.length > 0 ? (
                    <Text fontSize={13} color={brand.grafite70}>
                      Manca: {step1Missing.join(", ")}.
                    </Text>
                  ) : hasLiveErrors ? (
                    <Text fontSize={13} color={brand.urgenza}>
                      Correggi i campi in rosso.
                    </Text>
                  ) : null}
                </XStack>
              </YStack>
            ) : (
              <YStack gap="$3">
                <XStack gap="$3" flexWrap="wrap">
                  <YStack flex={3} flexBasis={0} minWidth={180}>
                    {abroad ? (
                      <Field label="Via o piazza" accessibilityLabel="Via o piazza" value={fields.registeredStreet ?? ""} onChangeText={(v) => setField("registeredStreet", v)} />
                    ) : (
                      // Suggerimenti di Google mentre si scrive: la scelta compila
                      // anche civico, CAP, comune e provincia (docs/CHANGELOG.md §263).
                      <YStack gap="$2">
                        <Text fontFamily="$body" fontSize={11} fontWeight="700" color={brand.grafite70}>
                          Via o piazza
                        </Text>
                        <AddressAutocompleteInput
                          value={fields.registeredStreet ?? ""}
                          onChange={(v) => setField("registeredStreet", v)}
                          onSelect={(selected) => {
                            const comune = selected.locality ? findComuneByName(selected.locality) : undefined;
                            setFields((prev) => ({
                              ...prev,
                              registeredStreet: selected.street ?? selected.address,
                              registeredHouseNumber: selected.houseNumber ?? prev.registeredHouseNumber ?? "",
                              registeredPostalCode: selected.postalCode ?? prev.registeredPostalCode ?? "",
                              registeredCity: comune?.name ?? selected.locality ?? prev.registeredCity ?? "",
                              registeredProvince: selected.province ?? comune?.province ?? prev.registeredProvince ?? "",
                            }));
                          }}
                          placeholder="Inizia a scrivere"
                          style={addressInputStyle}
                        />
                      </YStack>
                    )}
                  </YStack>
                  <YStack flex={1} flexBasis={0} minWidth={80}>
                    <Field label="Civico" accessibilityLabel="Numero civico" value={fields.registeredHouseNumber ?? ""} onChangeText={(v) => setField("registeredHouseNumber", v)} />
                  </YStack>
                </XStack>
                <XStack gap="$3" flexWrap="wrap">
                  <YStack flex={1} flexBasis={0} minWidth={80}>
                    <Field label="CAP" accessibilityLabel="CAP" value={fields.registeredPostalCode ?? ""} onChangeText={(v) => setField("registeredPostalCode", v)} inputMode={abroad ? undefined : "numeric"} />
                  </YStack>
                  <YStack flex={2} flexBasis={0} minWidth={100}>
                    <Field
                      label="Comune"
                      accessibilityLabel="Comune"
                      value={fields.registeredCity ?? ""}
                      onChangeText={(v) => {
                        // La provincia si ricava dal comune (elenco ISTAT), si può comunque correggere.
                        const comune = abroad ? undefined : findComuneByName(v);
                        setFields((prev) => ({ ...prev, registeredCity: v, ...(comune ? { registeredProvince: comune.province } : {}) }));
                      }}
                    />
                  </YStack>
                  {abroad ? null : (
                    <YStack width={72} flexShrink={0}>
                      <Field
                        label="Prov."
                        accessibilityLabel="Provincia (sigla)"
                        value={fields.registeredProvince ?? ""}
                        onChangeText={(v) => setField("registeredProvince", v.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2))}
                        autoCapitalize="characters"
                        maxLength={2}
                        placeholder="RM"
                      />
                    </YStack>
                  )}
                </XStack>

                <XStack
                  alignItems="flex-start"
                  gap="$2"
                  marginTop="$2"
                  cursor="pointer"
                  onPress={() => setDeclarationAccepted((v) => !v)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: declarationAccepted }}
                >
                  <YStack
                    width={20}
                    height={20}
                    marginTop={1}
                    borderRadius="$1"
                    borderWidth={2}
                    borderColor={declarationAccepted ? brand.cianografia : brand.filetto}
                    backgroundColor={declarationAccepted ? brand.cianografia : brand.calce}
                    alignItems="center"
                    justifyContent="center"
                    flexShrink={0}
                  >
                    {declarationAccepted ? <Icon name="check" size={13} strokeWidth={2.5} color="white" /> : null}
                  </YStack>
                  <Text fontSize={14} color={brand.grafite}>
                    Confermo che i dati sono corretti.{" "}
                    <Link href="/termini" target="_blank" style={{ color: brand.cianografiaScuro, fontWeight: 700 }}>
                      Termini
                    </Link>
                  </Text>
                </XStack>

                <XStack gap="$3" alignItems="center" flexWrap="wrap" marginTop="$2">
                  <Button variant="secondary" onPress={() => setFormStep(1)}>
                    Indietro
                  </Button>
                  <Button
                    variant="primary"
                    onPress={handleSave}
                    disabled={saving || step2Missing.length > 0 || !declarationAccepted || hasLiveErrors}
                    opacity={saving || step2Missing.length > 0 || !declarationAccepted || hasLiveErrors ? 0.45 : 1}
                  >
                    {saving ? "Salvataggio..." : "Salva"}
                  </Button>
                </XStack>
                {saveError ? (
                  <Text fontSize={13} color={brand.urgenza} role="alert">
                    {saveError}
                    {/* Un account appena registrato non ha ancora un profilo
                        pubblico (da cui dipende quello fiscale). */}
                    {saveError === "Completa prima il tuo profilo professionista." ? (
                      <>
                        {" "}
                        <Link href="/dashboard/profilo" style={{ color: brand.cianografiaScuro, fontWeight: 700, textDecoration: "underline" }}>
                          Vai al tuo profilo pubblico →
                        </Link>
                      </>
                    ) : null}
                  </Text>
                ) : null}
              </YStack>
            )}
          </Surface>
        ) : (
          <>
            {/* Dati già completi: un riepilogo e il prossimo passo, nient'altro. */}
            <Surface gap="$3">
              <XStack alignItems="center" justifyContent="space-between" gap="$3" flexWrap="wrap">
                <XStack alignItems="center" gap="$2">
                  <Text fontFamily="$heading" fontWeight="800" fontSize="$6" color={brand.grafite}>
                    Dati fiscali
                  </Text>
                  {verification?.taxIdState === "OK" ? (
                    <Badge variant="verificato">Verificati</Badge>
                  ) : verification?.taxIdState === "CHECKING" ? (
                    <Badge variant="nuovo">In verifica</Badge>
                  ) : null}
                </XStack>
                <button
                  type="button"
                  className="fiscal-link-button"
                  onClick={() => {
                    setSaveSuccess(false);
                    setFormStep(1);
                    setEditing(true);
                  }}
                >
                  Modifica
                </button>
              </XStack>
              {saveSuccess ? (
                <XStack alignItems="center" gap="$2">
                  <Icon name="check" size={16} strokeWidth={2.5} color={brand.verificato} />
                  <Text fontWeight="700" color={brand.verificato}>
                    Salvati
                  </Text>
                </XStack>
              ) : null}
              <YStack gap="$1">
                {typeLabel ? <Text color={brand.grafite70}>{typeLabel}</Text> : null}
                <Text fontWeight="700" color={brand.grafite}>
                  {entityType === "BUSINESS" ? fields.businessName : holderName}
                </Text>
                <Text color={brand.grafite70}>
                  {[isPerson ? fields.fiscalCodiceFiscale : null, fields.vatNumber ? `P.IVA ${fields.vatNumber}` : null].filter(Boolean).join(" · ")}
                </Text>
                <Text color={brand.grafite70}>
                  {[[fields.registeredStreet, fields.registeredHouseNumber].filter(Boolean).join(" "), [fields.registeredPostalCode, fields.registeredCity, fields.registeredProvince ? `(${fields.registeredProvince})` : null].filter(Boolean).join(" ")]
                    .filter(Boolean)
                    .join(", ")}
                </Text>
              </YStack>
            </Surface>

            {nextStep?.key === "identity" && nextStep.action ? (
              <Surface gap="$3" borderLeftWidth={4} borderLeftColor={brand.cianografia}>
                <Text fontSize={12} fontWeight="700" letterSpacing={0.5} textTransform="uppercase" color={brand.grafite70}>
                  Prossimo passo
                </Text>
                <Text fontFamily="$heading" fontWeight="800" fontSize="$6" color={brand.grafite}>
                  {nextStep.title}
                </Text>
                <Text color={brand.grafite70}>{nextStep.text}</Text>
                <Link href={nextStep.action.href} style={{ textDecoration: "none", alignSelf: "flex-start" }}>
                  <Button variant="primary">{nextStep.action.label}</Button>
                </Link>
              </Surface>
            ) : null}

            {/* Pagamenti online solo dopo la verifica dell'identità (richiesta
                dell'utente, docs/CHANGELOG.md §262): prima non servono. */}
            <div id="pagamenti-online">
              {paymentsStep?.state === "locked" ? (
                <XStack gap="$3" alignItems="center" padding="$4" borderRadius="$4" backgroundColor={brand.gesso}>
                  <Icon name="lock" size={20} strokeWidth={2} color={brand.grafite70} />
                  <YStack flex={1} gap={2}>
                    <Text fontSize={15} fontWeight="700" color={brand.grafite70}>
                      Pagamenti online
                    </Text>
                    <Text fontSize={13} color={brand.grafite70}>
                      {paymentsStep.text}
                    </Text>
                  </YStack>
                </XStack>
              ) : (
                <OnlinePaymentsCard
                  active={!!profile?.stripeChargesEnabled}
                  started={!!profile?.stripeConnectAccountId}
                  requirements={profile?.stripeRequirementsStatus}
                  loading={stripeLoading}
                  error={stripeError}
                  onActivate={handleActivate}
                  onOpenStripe={handleStripeDashboard}
                  step={
                    ibanStepOpen && token && !profile?.stripeChargesEnabled ? (
                      <PayoutIbanCard
                        variant="step"
                        token={token}
                        initial={null}
                        defaultHolderName={holderName}
                        busy={stripeLoading}
                        onCancel={() => setIbanStepOpen(false)}
                        onSaved={(saved) => {
                          // Il passo si chiude: se Stripe non risponde, "Attiva" riprova senza richiedere l'IBAN.
                          setPayoutIban(saved);
                          setIbanStepOpen(false);
                          void handleStripeConnect();
                        }}
                      />
                    ) : undefined
                  }
                >
                  {token && payoutIban !== undefined ? <PayoutIbanCard token={token} initial={payoutIban} defaultHolderName={holderName} onSaved={setPayoutIban} /> : null}
                </OnlinePaymentsCard>
              )}
            </div>

            {/* Riepilogo di quanto comunichiamo al fisco (docs/CHANGELOG.md §246). */}
            <Link href="/dashboard/fiscale/dac7" style={{ textDecoration: "none" }}>
              <XStack alignItems="center" gap="$2" paddingHorizontal="$1">
                <Text fontSize={14} fontWeight="700" color={brand.cianografiaScuro}>
                  Riepilogo DAC7: i compensi che comunichiamo al fisco
                </Text>
                <Text color={brand.cianografiaScuro} aria-hidden>
                  →
                </Text>
              </XStack>
            </Link>
          </>
        )}
      </YStack>
    </Section>
  );
}
