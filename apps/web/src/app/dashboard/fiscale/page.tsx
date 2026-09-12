"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Surface, Section, Text, XStack, YStack, brand, Badge } from "@professionisti/ui";
import type { ProfessionalFiscalProfile, FiscalVerificationStatus } from "@professionisti/api-client";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";

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
  const { user, token, isLoading } = useAuth();
  const router = useRouter();

  const [profile, setProfile] = useState<ProfessionalFiscalProfile | null | undefined>(undefined);
  const [entityType, setEntityType] = useState<"INDIVIDUAL" | "BUSINESS" | "">("");
  const [fields, setFields] = useState<Record<string, string>>({});
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
            taxResidenceCountry: data.taxResidenceCountry ?? "",
            foreignTin: data.foreignTin ?? "",
            registeredStreet: data.registeredStreet ?? "",
            registeredCity: data.registeredCity ?? "",
            registeredPostalCode: data.registeredPostalCode ?? "",
            registeredProvince: data.registeredProvince ?? "",
            registeredCountry: data.registeredCountry ?? "",
          });
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
    try {
      const updated = await apiClient.updateMyFiscalProfile(token, {
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
        taxResidenceCountry: fields.taxResidenceCountry || undefined,
        foreignTin: fields.foreignTin || undefined,
        registeredStreet: fields.registeredStreet || undefined,
        registeredCity: fields.registeredCity || undefined,
        registeredPostalCode: fields.registeredPostalCode || undefined,
        registeredProvince: fields.registeredProvince || undefined,
        registeredCountry: fields.registeredCountry || undefined,
        representative:
          entityType === "BUSINESS" && repFields.firstName && repFields.lastName
            ? { firstName: repFields.firstName, lastName: repFields.lastName, codiceFiscale: repFields.codiceFiscale || undefined, role: repFields.role || undefined }
            : undefined,
      });
      setProfile(updated);
      setSaveSuccess(true);
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

  if (isLoading || profile === undefined) {
    return (
      <Section title="Dati fiscali e pagamenti">
        <Text>Caricamento...</Text>
      </Section>
    );
  }

  const verification = VERIFICATION_LABEL[profile?.verificationStatus ?? "UNVERIFIED"];

  return (
    <Section title="Dati fiscali e pagamenti" maxWidth={720}>
      <YStack gap="$5">
        <Text fontSize={14} color={brand.grafite70}>
          Questi dati non sono mai visibili pubblicamente — servono solo per la rendicontazione fiscale (DAC7) e, se scegli di attivarli, per i
          pagamenti tramite Manovia. Non è mai obbligatorio compilarli per usare la piattaforma: puoi continuare a farti pagare direttamente dai
          tuoi clienti.
        </Text>

        {profile && (
          <XStack alignItems="center" gap="$2">
            <Text fontSize={13} fontWeight="700" color={brand.grafite70}>
              Stato verifica:
            </Text>
            <Badge variant={verification.variant}>{verification.label}</Badge>
          </XStack>
        )}
        {profile?.verificationNote && (
          <Text fontSize={13} color={brand.urgenza}>
            {profile.verificationNote}
          </Text>
        )}

        <Surface padding="$4">
          <YStack gap="$4">
            <Text fontSize={15} fontWeight="700">
              Tipo di attività
            </Text>
            <XStack gap="$3" flexWrap="wrap">
              {(["INDIVIDUAL", "BUSINESS"] as const).map((type) => (
                <Button
                  key={type}
                  variant={entityType === type ? "primary" : "secondary"}
                  onPress={() => setEntityType(type)}
                  accessibilityLabel={type === "INDIVIDUAL" ? "Persona fisica" : "Impresa o società"}
                >
                  {type === "INDIVIDUAL" ? "Persona fisica" : "Impresa / società"}
                </Button>
              ))}
            </XStack>
          </YStack>
        </Surface>

        {entityType === "INDIVIDUAL" && (
          <Surface padding="$4">
            <YStack gap="$3">
              <Text fontSize={15} fontWeight="700">
                Dati anagrafici
              </Text>
              <Field label="Nome" value={fields.fiscalFirstName ?? ""} onChangeText={(v) => setField("fiscalFirstName", v)} />
              <Field label="Cognome" value={fields.fiscalLastName ?? ""} onChangeText={(v) => setField("fiscalLastName", v)} />
              <Field label="Codice fiscale" value={fields.fiscalCodiceFiscale ?? ""} onChangeText={(v) => setField("fiscalCodiceFiscale", v)} />
              <Field label="Data di nascita" value={fields.dateOfBirth ?? ""} onChangeText={(v) => setField("dateOfBirth", v)} placeholder="AAAA-MM-GG" />
              <Field label="Luogo di nascita" value={fields.placeOfBirth ?? ""} onChangeText={(v) => setField("placeOfBirth", v)} />
              <Field label="Paese di nascita (ISO, es. IT)" value={fields.countryOfBirth ?? ""} onChangeText={(v) => setField("countryOfBirth", v)} />
            </YStack>
          </Surface>
        )}

        {entityType === "BUSINESS" && (
          <Surface padding="$4">
            <YStack gap="$3">
              <Text fontSize={15} fontWeight="700">
                Dati dell&apos;impresa
              </Text>
              <Field label="Ragione sociale" value={fields.businessName ?? ""} onChangeText={(v) => setField("businessName", v)} />
              <Field label="Forma giuridica" value={fields.legalForm ?? ""} onChangeText={(v) => setField("legalForm", v)} placeholder="es. Ditta individuale, SRL" />
              <Field label="Partita IVA" value={fields.vatNumber ?? ""} onChangeText={(v) => setField("vatNumber", v)} />
              <Field label="Numero REA / CCIAA" value={fields.businessRegistrationNumber ?? ""} onChangeText={(v) => setField("businessRegistrationNumber", v)} />

              <Text fontSize={15} fontWeight="700" marginTop="$2">
                Legale rappresentante
              </Text>
              <Field label="Nome" value={repFields.firstName} onChangeText={(v) => setRepFields((p) => ({ ...p, firstName: v }))} />
              <Field label="Cognome" value={repFields.lastName} onChangeText={(v) => setRepFields((p) => ({ ...p, lastName: v }))} />
              <Field label="Codice fiscale" value={repFields.codiceFiscale} onChangeText={(v) => setRepFields((p) => ({ ...p, codiceFiscale: v }))} />
              <Field label="Ruolo" value={repFields.role} onChangeText={(v) => setRepFields((p) => ({ ...p, role: v }))} placeholder="es. Amministratore unico" />
            </YStack>
          </Surface>
        )}

        {entityType !== "" && (
          <Surface padding="$4">
            <YStack gap="$3">
              <Text fontSize={15} fontWeight="700">
                Residenza fiscale
              </Text>
              <Field label="Paese di residenza fiscale (ISO, es. IT)" value={fields.taxResidenceCountry ?? ""} onChangeText={(v) => setField("taxResidenceCountry", v)} />
              <Field label="TIN estero (se residenza fiscale fuori Italia)" value={fields.foreignTin ?? ""} onChangeText={(v) => setField("foreignTin", v)} />
              <Field label="Indirizzo" value={fields.registeredStreet ?? ""} onChangeText={(v) => setField("registeredStreet", v)} />
              <XStack gap="$3" flexWrap="wrap">
                <Field label="Città" value={fields.registeredCity ?? ""} onChangeText={(v) => setField("registeredCity", v)} flex={2} />
                <Field label="CAP" value={fields.registeredPostalCode ?? ""} onChangeText={(v) => setField("registeredPostalCode", v)} flex={1} />
                <Field label="Provincia" value={fields.registeredProvince ?? ""} onChangeText={(v) => setField("registeredProvince", v)} flex={1} />
              </XStack>
              <Field label="Paese (ISO, es. IT)" value={fields.registeredCountry ?? ""} onChangeText={(v) => setField("registeredCountry", v)} />
            </YStack>
          </Surface>
        )}

        <XStack gap="$3" alignItems="center" flexWrap="wrap">
          <Button variant="primary" onPress={handleSave} disabled={saving || !entityType}>
            {saving ? "Salvataggio..." : "Salva dati fiscali"}
          </Button>
          {saveSuccess && (
            <Text fontSize={13} color={brand.verificato}>
              Salvato.
            </Text>
          )}
          {saveError && (
            <Text fontSize={13} color={brand.urgenza}>
              {saveError}
            </Text>
          )}
        </XStack>

        <Surface padding="$4">
          <YStack gap="$3">
            <Text fontSize={15} fontWeight="700">
              Pagamenti tramite Manovia
            </Text>
            <Text fontSize={13} color={brand.grafite70}>
              Attivando questa opzione i clienti potranno pagarti direttamente in piattaforma: Manovia trattiene la propria commissione e ti
              accredita il netto tramite Stripe. Resta comunque sempre possibile farsi pagare direttamente, senza attivare nulla qui.
            </Text>
            {profile?.stripeChargesEnabled ? (
              <Badge variant="verificato">Pagamenti attivi</Badge>
            ) : (
              <XStack gap="$3" alignItems="center" flexWrap="wrap">
                <Button variant="secondary" onPress={handleStripeConnect} disabled={stripeLoading}>
                  {stripeLoading ? "Attendere..." : "Attiva pagamenti tramite Manovia"}
                </Button>
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
