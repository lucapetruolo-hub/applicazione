"use client";

import { useEffect, useState } from "react";
import type { AcceptQuoteInput } from "@professionisti/shared";
import { Button, Field, Text, XStack, YStack, brand } from "@professionisti/ui";
import { useAuth } from "@/lib/AuthContext";

type FieldKey = "recipientName" | "recipientSurname" | "recipientPhone" | "street" | "houseNumber" | "postalCode" | "city" | "province";

/**
 * Schermata di accettazione preventivo: raccoglie l'indirizzo di lavoro in
 * campi separati (richiesta esplicita dell'utente: "riquadri diversi" per
 * Nome, Cognome, telefono, Indirizzo, numero civico, CAP, città, provincia
 * — tutti obbligatori tranne Scala/piano/interno/azienda). Stesso pattern
 * overlay di ClientProfileModal/BookingDetailPanel (role="dialog",
 * chiusura con Escape/click sul backdrop). Prefill da nome/cognome/telefono
 * dell'account (se presenti) per ridurre l'attrito — comunque tutti
 * modificabili: chi riceve il professionista sul lavoro può non coincidere
 * con l'intestatario dell'account.
 */
export function AcceptQuoteModal({
  onClose,
  onAccept,
}: {
  onClose: () => void;
  onAccept: (input: AcceptQuoteInput) => Promise<void>;
}) {
  const { user } = useAuth();
  const [recipientName, setRecipientName] = useState(user?.name ?? "");
  const [recipientSurname, setRecipientSurname] = useState(user?.surname ?? "");
  const [recipientPhone, setRecipientPhone] = useState(user?.phone ?? "");
  const [street, setStreet] = useState("");
  const [houseNumber, setHouseNumber] = useState("");
  const [addressExtra, setAddressExtra] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [city, setCity] = useState("");
  const [province, setProvince] = useState("");
  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [showPaymentInfo, setShowPaymentInfo] = useState(false);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  function validate(): AcceptQuoteInput | null {
    const values: Record<FieldKey, string> = {
      recipientName,
      recipientSurname,
      recipientPhone,
      street,
      houseNumber,
      postalCode,
      city,
      province,
    };
    const nextErrors: Partial<Record<FieldKey, string>> = {};
    for (const key of Object.keys(values) as FieldKey[]) {
      if (!values[key].trim()) {
        nextErrors[key] = "Campo obbligatorio.";
      }
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return null;
    }
    return {
      recipientName: recipientName.trim(),
      recipientSurname: recipientSurname.trim(),
      recipientPhone: recipientPhone.trim(),
      street: street.trim(),
      houseNumber: houseNumber.trim(),
      addressExtra: addressExtra.trim() || undefined,
      postalCode: postalCode.trim(),
      city: city.trim(),
      province: province.trim(),
    };
  }

  async function handleSave() {
    setSaveError(null);
    const input = validate();
    if (!input) return;

    setIsSaving(true);
    try {
      await onAccept(input);
      setSaved(true);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Errore imprevisto, riprova.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Accetta preventivo"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(20,24,30,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: 16,
        overflowY: "auto",
      }}
    >
      <YStack
        onPress={(e: { stopPropagation: () => void }) => e.stopPropagation()}
        width="100%"
        maxWidth={560}
        backgroundColor={brand.calce}
        borderRadius="$3"
        borderWidth={1}
        borderColor={brand.filetto}
        padding="$5"
        gap="$4"
        marginVertical="$6"
      >
        <YStack gap="$1">
          <Text fontFamily="$heading" fontWeight="800" fontSize="$6" color={brand.grafite}>
            Dove deve venire il professionista?
          </Text>
          <Text fontSize="$3" color={brand.grafite70}>
            Questi dati servono al professionista per raggiungerti e contattarti. I campi con * sono obbligatori.
          </Text>
        </YStack>

        {saved ? (
          <YStack gap="$4">
            <Text color={brand.verificato} fontWeight="600">
              Preventivo accettato e indirizzo salvato.
            </Text>

            {showPaymentInfo ? (
              <Text fontSize="$3" color={brand.grafite70}>
                Il pagamento in piattaforma non è ancora attivo: nel frattempo accordati direttamente con il
                professionista sulle modalità di pagamento.
              </Text>
            ) : null}

            <XStack gap="$2" flexWrap="wrap">
              <Button variant="secondary" size="$3" height={44} onPress={() => setShowPaymentInfo(true)}>
                Vai al pagamento
              </Button>
              <Button variant="ghost" size="$3" height={44} onPress={onClose}>
                Chiudi
              </Button>
            </XStack>
          </YStack>
        ) : (
          <>
            <YStack gap="$3" $gtSm={{ flexDirection: "row", flexWrap: "wrap" }}>
              <YStack flex={1} minWidth={220}>
                <Field label="Nome *" value={recipientName} onChangeText={setRecipientName} placeholder="Nome" error={errors.recipientName} />
              </YStack>
              <YStack flex={1} minWidth={220}>
                <Field
                  label="Cognome *"
                  value={recipientSurname}
                  onChangeText={setRecipientSurname}
                  placeholder="Cognome"
                  error={errors.recipientSurname}
                />
              </YStack>
            </YStack>

            <Field
              label="Numero di telefono *"
              value={recipientPhone}
              onChangeText={setRecipientPhone}
              placeholder="Numero di telefono"
              keyboardType="phone-pad"
              error={errors.recipientPhone}
            />

            <YStack gap="$3" $gtSm={{ flexDirection: "row", flexWrap: "wrap" }}>
              <YStack flex={2} minWidth={220}>
                <Field label="Indirizzo *" value={street} onChangeText={setStreet} placeholder="Via/piazza" error={errors.street} />
              </YStack>
              <YStack flex={1} minWidth={140}>
                <Field label="Numero civico *" value={houseNumber} onChangeText={setHouseNumber} placeholder="Numero civico" error={errors.houseNumber} />
              </YStack>
            </YStack>

            <Field
              label="Scala, piano, interno, azienda (opzionale)"
              value={addressExtra}
              onChangeText={setAddressExtra}
              placeholder="Es. Scala B, piano 3, interno 12"
            />

            <YStack gap="$3" $gtSm={{ flexDirection: "row", flexWrap: "wrap" }}>
              <YStack flex={1} minWidth={140}>
                <Field label="CAP *" value={postalCode} onChangeText={setPostalCode} placeholder="CAP" keyboardType="numeric" error={errors.postalCode} />
              </YStack>
              <YStack flex={2} minWidth={200}>
                <Field label="Città *" value={city} onChangeText={setCity} placeholder="Città" error={errors.city} />
              </YStack>
              <YStack flex={1} minWidth={140}>
                <Field label="Provincia *" value={province} onChangeText={setProvince} placeholder="Es. Milano" error={errors.province} />
              </YStack>
            </YStack>

            <Text fontSize="$2" color={brand.grafite70}>
              * Campo obbligatorio.
            </Text>

            {saveError ? (
              <Text color={brand.urgenza} fontSize="$3">
                {saveError}
              </Text>
            ) : null}

            <XStack gap="$2" flexWrap="wrap">
              <Button variant="primary" size="$3" height={44} onPress={handleSave} disabled={isSaving} opacity={isSaving ? 0.6 : 1}>
                {isSaving ? "Salvataggio..." : "Salva"}
              </Button>
              <Button variant="secondary" size="$3" height={44} disabled opacity={0.5}>
                Vai al pagamento
              </Button>
              <Button variant="ghost" size="$3" height={44} onPress={onClose} disabled={isSaving}>
                Annulla
              </Button>
            </XStack>
            <Text fontSize="$2" color={brand.grafite70}>
              Salva prima l&apos;indirizzo per sbloccare il pagamento.
            </Text>
          </>
        )}
      </YStack>
    </div>
  );
}
