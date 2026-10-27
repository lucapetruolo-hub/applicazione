"use client";

import { useState } from "react";
import { Button, Field, Icon, Text, XStack, YStack, brand } from "@professionisti/ui";
import {
  CLIENT_INVOICE_KIND_LABEL,
  clientInvoiceKinds,
  clientInvoiceLines,
  clientInvoiceRequestSchema,
  findComuneByName,
  invoiceRecipientText,
  type ClientInvoiceKind,
  type ClientInvoiceRequestInput,
  type ClientInvoiceRequestView,
} from "@professionisti/shared";
import { apiClient } from "@/lib/apiClient";
import { keyActivate } from "@/lib/keyActivate";

/**
 * Fattura chiesta dal cliente al professionista (decisione dell'utente del
 * 27/10/2026, docs/CHANGELOG.md §374): la fa il professionista, noi gli
 * passiamo i dati. Si apre dalla casella "Chiedi la fattura a …" quando si
 * accetta il preventivo, o dopo, dalla scheda del lavoro.
 */
export type InvoiceDraft = {
  kind: ClientInvoiceKind;
  name: string;
  taxCode: string;
  vatNumber: string;
  recipient: string;
  street: string;
  houseNumber: string;
  postalCode: string;
  city: string;
  province: string;
};

export function emptyInvoiceDraft(defaults: Partial<InvoiceDraft> = {}): InvoiceDraft {
  return { kind: "PERSON", name: "", taxCode: "", vatNumber: "", recipient: "", street: "", houseNumber: "", postalCode: "", city: "", province: "", ...defaults };
}

export function invoiceDraftFromView(view: ClientInvoiceRequestView): InvoiceDraft {
  return {
    kind: view.kind,
    name: view.name,
    taxCode: view.taxCode ?? "",
    vatNumber: view.vatNumber ?? "",
    recipient: invoiceRecipientText(view.sdiRecipientCode, view.pecEmail),
    street: view.street,
    houseNumber: view.houseNumber ?? "",
    postalCode: view.postalCode,
    city: view.city,
    province: view.province ?? "",
  };
}

/** Dati pronti per l'API, o il primo errore per campo. */
export function parseInvoiceDraft(draft: InvoiceDraft): { ok: true; data: ClientInvoiceRequestInput } | { ok: false; errors: Partial<Record<keyof InvoiceDraft, string>> } {
  const parsed = clientInvoiceRequestSchema.safeParse({
    kind: draft.kind,
    name: draft.name,
    taxCode: draft.taxCode.trim() || undefined,
    vatNumber: draft.kind === "VAT" ? draft.vatNumber.trim() || undefined : undefined,
    recipient: draft.kind === "VAT" ? draft.recipient.trim() || undefined : undefined,
    street: draft.street,
    houseNumber: draft.houseNumber.trim() || undefined,
    postalCode: draft.postalCode,
    city: draft.city,
    province: draft.province.trim() || undefined,
  });
  if (parsed.success) return { ok: true, data: parsed.data };
  const errors: Partial<Record<keyof InvoiceDraft, string>> = {};
  for (const issue of parsed.error.issues) {
    const field = issue.path[0] as keyof InvoiceDraft | undefined;
    if (field && !errors[field]) errors[field] = issue.message;
  }
  return { ok: false, errors };
}

/** La riga che spiega a chi si chiede la fattura (richiesta dell'utente del 27/10/2026). */
export const INVOICE_FROM_PROFESSIONAL_NOTE = "La fattura la fa il professionista. Noi gli passiamo i tuoi dati.";

/** Casella "Chiedi la fattura a …", chiusa finché non si spunta. */
export function InvoiceRequestToggle({ professionalName, checked, onToggle }: { professionalName: string; checked: boolean; onToggle: () => void }) {
  return (
    <XStack alignItems="flex-start" gap="$2" cursor="pointer" onPress={onToggle} onKeyDown={keyActivate(onToggle)} accessibilityRole="checkbox" aria-checked={checked} tabIndex={0}>
      <YStack
        width={20}
        height={20}
        marginTop={1}
        borderRadius="$1"
        borderWidth={2}
        borderColor={checked ? brand.cianografia : brand.filetto}
        backgroundColor={checked ? brand.cianografia : brand.calce}
        alignItems="center"
        justifyContent="center"
        flexShrink={0}
      >
        {checked ? <Icon name="check" size={13} strokeWidth={2.5} color="white" /> : null}
      </YStack>
      <YStack flex={1} gap={2}>
        <Text fontSize={16} fontWeight="700" color={brand.grafite}>
          Chiedi la fattura a {professionalName}
        </Text>
        <Text fontSize={13} color={brand.grafite70}>
          {INVOICE_FROM_PROFESSIONAL_NOTE}
        </Text>
      </YStack>
    </XStack>
  );
}

/** Campi della fattura: a nome proprio (codice fiscale) o a una partita IVA. */
export function InvoiceRequestFields({ draft, onChange, errors }: { draft: InvoiceDraft; onChange: (next: InvoiceDraft) => void; errors?: Partial<Record<keyof InvoiceDraft, string>> }) {
  const set = (key: keyof InvoiceDraft, value: string) => onChange({ ...draft, [key]: value });
  const vat = draft.kind === "VAT";
  return (
    <YStack gap="$3">
      <XStack gap="$2" flexWrap="wrap">
        {clientInvoiceKinds.map((kind) => (
          <Button key={kind} variant={draft.kind === kind ? "primary" : "secondary"} aria-pressed={draft.kind === kind} onPress={() => onChange({ ...draft, kind })}>
            {CLIENT_INVOICE_KIND_LABEL[kind]}
          </Button>
        ))}
      </XStack>
      <Field
        label={vat ? "Intestazione" : "Nome e cognome"}
        accessibilityLabel={vat ? "Intestazione della fattura" : "Nome e cognome per la fattura"}
        placeholder={vat ? "Ragione sociale o nome della ditta" : undefined}
        value={draft.name}
        onChangeText={(v) => set("name", v)}
        error={errors?.name}
      />
      {vat ? (
        <>
          <Field label="Partita IVA" accessibilityLabel="Partita IVA per la fattura" value={draft.vatNumber} onChangeText={(v) => set("vatNumber", v)} inputMode="numeric" error={errors?.vatNumber} />
          <Field
            label="Codice destinatario o PEC (facoltativo)"
            accessibilityLabel="Codice destinatario o PEC per la fattura"
            value={draft.recipient}
            onChangeText={(v) => set("recipient", v)}
            autoCapitalize="none"
            error={errors?.recipient}
          />
        </>
      ) : (
        <Field
          label="Codice fiscale"
          accessibilityLabel="Codice fiscale per la fattura"
          value={draft.taxCode}
          onChangeText={(v) => set("taxCode", v.toUpperCase())}
          autoCapitalize="characters"
          error={errors?.taxCode}
        />
      )}
      <XStack gap="$3" flexWrap="wrap">
        <YStack flex={3} flexBasis={0} minWidth={180}>
          <Field label={vat ? "Via della sede" : "Via di residenza"} accessibilityLabel="Via per la fattura" value={draft.street} onChangeText={(v) => set("street", v)} error={errors?.street} />
        </YStack>
        <YStack flex={1} flexBasis={0} minWidth={80}>
          <Field label="Civico" accessibilityLabel="Civico per la fattura" value={draft.houseNumber} onChangeText={(v) => set("houseNumber", v)} />
        </YStack>
      </XStack>
      <XStack gap="$3" flexWrap="wrap">
        <YStack flex={1} flexBasis={0} minWidth={80}>
          <Field label="CAP" accessibilityLabel="CAP per la fattura" value={draft.postalCode} onChangeText={(v) => set("postalCode", v.replace(/\D/g, "").slice(0, 5))} inputMode="numeric" error={errors?.postalCode} />
        </YStack>
        <YStack flex={2} flexBasis={0} minWidth={120}>
          <Field
            label="Comune"
            accessibilityLabel="Comune per la fattura"
            value={draft.city}
            onChangeText={(v) => {
              const comune = findComuneByName(v);
              onChange({ ...draft, city: v, ...(comune ? { province: comune.province } : {}) });
            }}
            error={errors?.city}
          />
        </YStack>
        <YStack width={72} flexShrink={0}>
          <Field
            label="Prov."
            accessibilityLabel="Provincia per la fattura (sigla)"
            value={draft.province}
            onChangeText={(v) => set("province", v.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2))}
            autoCapitalize="characters"
            maxLength={2}
            placeholder="RM"
            error={errors?.province}
          />
        </YStack>
      </XStack>
    </YStack>
  );
}

/**
 * Dopo l'accettazione, nella scheda del lavoro: la fattura chiesta (con
 * Modifica e "Non mi serve più") o la casella per chiederla. Il
 * professionista riceve subito i dati.
 */
export function ClientInvoiceRequestPanel({
  token,
  quoteId,
  professionalName,
  initial,
  defaults,
  onSaved,
}: {
  token: string;
  quoteId: string;
  professionalName: string;
  initial: ClientInvoiceRequestView | null;
  defaults?: Partial<InvoiceDraft>;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<InvoiceDraft>(() => (initial ? invoiceDraftFromView(initial) : emptyInvoiceDraft(defaults)));
  const [errors, setErrors] = useState<Partial<Record<keyof InvoiceDraft, string>>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function open() {
    setEditing(true);
    setErrors({});
    setError(null);
    if (!initial && !draft.taxCode && !draft.vatNumber) {
      const last = await apiClient.lastClientInvoiceRequest(token).catch(() => null);
      if (last?.invoiceRequest) setDraft(invoiceDraftFromView(last.invoiceRequest));
    }
  }

  async function save() {
    const parsed = parseInvoiceDraft(draft);
    if (!parsed.ok) {
      setErrors(parsed.errors);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await apiClient.saveClientInvoiceRequest(token, quoteId, parsed.data);
      setEditing(false);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Non siamo riusciti a mandare i dati, riprova.");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    setSaving(true);
    setError(null);
    try {
      await apiClient.removeClientInvoiceRequest(token, quoteId);
      setDraft(emptyInvoiceDraft(defaults));
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Non siamo riusciti a togliere la richiesta, riprova.");
    } finally {
      setSaving(false);
    }
  }

  if (!editing && initial) {
    return (
      <YStack gap="$2" padding="$3" borderRadius={20} backgroundColor={brand.gesso}>
        <XStack alignItems="center" gap="$2">
          <Icon name="receipt-text" size={18} strokeWidth={2} color={brand.grafite70} />
          <Text fontSize={16} fontWeight="700" color={brand.grafite}>
            Hai chiesto la fattura a {professionalName}
          </Text>
        </XStack>
        <Text fontSize={13} color={brand.grafite70}>
          {INVOICE_FROM_PROFESSIONAL_NOTE}
        </Text>
        <YStack gap={2}>
          {clientInvoiceLines(initial).map((line) => (
            <Text key={line} fontSize={16} color={brand.grafite}>
              {line}
            </Text>
          ))}
        </YStack>
        <XStack gap="$3" flexWrap="wrap">
          <Text fontSize={16} fontWeight="700" color={brand.cianografiaScuro} textDecorationLine="underline" cursor="pointer" accessibilityRole="button" onPress={() => void open()}>
            Modifica
          </Text>
          <Text fontSize={16} fontWeight="700" color={brand.grafite70} textDecorationLine="underline" cursor="pointer" accessibilityRole="button" onPress={() => (saving ? undefined : void remove())}>
            Non mi serve più
          </Text>
        </XStack>
        {error ? (
          <Text fontSize={16} color={brand.urgenza} role="alert">
            {error}
          </Text>
        ) : null}
      </YStack>
    );
  }

  return (
    <YStack gap="$3">
      <InvoiceRequestToggle professionalName={professionalName} checked={editing} onToggle={() => (editing ? setEditing(false) : void open())} />
      {editing ? (
        <>
          <InvoiceRequestFields draft={draft} onChange={setDraft} errors={errors} />
          <XStack gap="$2" flexWrap="wrap">
            <Button variant="primary" onPress={() => void save()} disabled={saving} opacity={saving ? 0.45 : 1}>
              {saving ? "Invio..." : initial ? "Salva i dati" : "Manda la richiesta"}
            </Button>
            <Button variant="secondary" onPress={() => setEditing(false)} disabled={saving}>
              Annulla
            </Button>
          </XStack>
          {error ? (
            <Text fontSize={16} color={brand.urgenza} role="alert">
              {error}
            </Text>
          ) : null}
        </>
      ) : null}
    </YStack>
  );
}
