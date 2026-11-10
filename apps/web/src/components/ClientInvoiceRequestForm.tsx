"use client";

import { useState } from "react";
import { Button, Field, Icon, Text, XStack, YStack, brand } from "@professionisti/ui";
import {
  CLIENT_INVOICE_KIND_LABEL,
  clientInvoiceKinds,
  clientInvoiceLines,
  invoiceRecipientText,
  type ClientInvoiceKind,
  type ClientInvoiceRequestView,
} from "@professionisti/shared";
import { apiClient } from "@/lib/apiClient";
import { useComuni } from "@/lib/comuniLazy";
import { keyActivate } from "@/lib/keyActivate";
import { ButtonWaitBar } from "@/components/WaitBar";

/**
 * Fattura chiesta dal cliente al professionista (decisione dell'utente del
 * 27/10/2026, docs/CHANGELOG.md §378): la fa il professionista, noi gli
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

/**
 * La riga che spiega a chi si chiede il documento (richiesta dell'utente del
 * 27/10/2026). Chi lavora senza partita IVA non fa fatture ma una ricevuta
 * per prestazione occasionale (collaudo C-01).
 */
export function invoiceFromProfessionalNote(receipt = false): string {
  return receipt ? "Lavora senza partita IVA: ti dà una ricevuta, non una fattura. Noi gli passiamo i tuoi dati." : "La fattura la fa il professionista. Noi gli passiamo i tuoi dati.";
}

/**
 * La riga sotto la casella, prima di spuntarla (collaudo dell'8/11, E6-12):
 * una frase sola che dice cosa succede e quali dati passano. Sostituisce
 * anche la riga "La ricevuta del pagamento non è la fattura" sopra.
 */
function invoiceToggleNote(receipt: boolean): string {
  return receipt
    ? "Lavora senza partita IVA: la ricevuta la fa lui. Spunta qui e gli passiamo nome, codice fiscale e indirizzo."
    : "La fa il professionista: spunta qui e gli passiamo nome, codice fiscale e indirizzo. La conferma del pagamento online non vale come fattura.";
}

/** Casella "Chiedi la fattura a …" (o "la ricevuta"), chiusa finché non si spunta. */
export function InvoiceRequestToggle({ professionalName, checked, onToggle, receipt = false }: { professionalName: string; checked: boolean; onToggle: () => void; receipt?: boolean }) {
  return (
    <XStack
      alignItems="flex-start"
      gap="2"
      cursor="pointer"
      onPress={onToggle}
      onKeyDown={keyActivate(onToggle)}
      role="checkbox"
      aria-checked={checked}
      aria-label={`${receipt ? "Chiedi la ricevuta" : "Chiedi la fattura"} a ${professionalName}`}
      tabIndex={0}
    >
      <YStack
        width={20}
        height={20}
        marginTop={1}
        borderRadius="1"
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
          {receipt ? "Ti serve la ricevuta?" : "Ti serve la fattura?"}
        </Text>
        <Text fontSize={13} color={brand.grafite70}>
          {invoiceToggleNote(receipt)}
        </Text>
      </YStack>
    </XStack>
  );
}

/** Campi della fattura: a nome proprio (codice fiscale) o a una partita IVA. */
export function InvoiceRequestFields({
  draft,
  onChange,
  errors,
  receipt = false,
}: {
  draft: InvoiceDraft;
  onChange: (next: InvoiceDraft) => void;
  errors?: Partial<Record<keyof InvoiceDraft, string>>;
  receipt?: boolean;
}) {
  // Comuni scaricati al primo tocco su un campo, non con la pagina (docs/changelog/2026-11-09-le-mie-richieste-leggera.md).
  const comuni = useComuni();
  const set = (key: keyof InvoiceDraft, value: string) => onChange({ ...draft, [key]: value });
  const vat = draft.kind === "VAT";
  return (
    <YStack gap="3">
      <XStack gap="2" flexWrap="wrap">
        {clientInvoiceKinds.map((kind) => (
          <Button key={kind} variant={draft.kind === kind ? "primary" : "secondary"} aria-pressed={draft.kind === kind} onPress={() => onChange({ ...draft, kind })}>
            {CLIENT_INVOICE_KIND_LABEL[kind]}
          </Button>
        ))}
      </XStack>
      <Field
        label={vat ? "Intestazione" : "Nome e cognome"}
        aria-label={vat ? "Intestazione della fattura" : "Nome e cognome per la fattura"}
        placeholder={vat ? "Ragione sociale o nome della ditta" : undefined}
        value={draft.name}
        onChangeText={(v) => set("name", v)}
        error={errors?.name}
      />
      {vat ? (
        <>
          <Field label="Partita IVA" aria-label="Partita IVA per la fattura" value={draft.vatNumber} onChangeText={(v) => set("vatNumber", v)} inputMode="numeric" error={errors?.vatNumber} />
          {receipt ? null : (
            <Field
              label="Codice destinatario o PEC (facoltativo)"
              aria-label="Codice destinatario o PEC per la fattura"
              value={draft.recipient}
              onChangeText={(v) => set("recipient", v)}
              autoCapitalize="none"
              error={errors?.recipient}
            />
          )}
        </>
      ) : (
        <Field
          label="Codice fiscale"
          aria-label="Codice fiscale per la fattura"
          value={draft.taxCode}
          onChangeText={(v) => set("taxCode", v.toUpperCase())}
          autoCapitalize="characters"
          error={errors?.taxCode}
        />
      )}
      <XStack gap="3" flexWrap="wrap">
        <YStack flex={3} flexBasis={0} minWidth={180}>
          <Field label={vat ? "Via della sede" : "Via di residenza"} aria-label="Via per la fattura" value={draft.street} onChangeText={(v) => set("street", v)} error={errors?.street} />
        </YStack>
        <YStack flex={1} flexBasis={0} minWidth={80}>
          <Field label="Civico" aria-label="Civico per la fattura" value={draft.houseNumber} onChangeText={(v) => set("houseNumber", v)} />
        </YStack>
      </XStack>
      <XStack gap="3" flexWrap="wrap">
        <YStack flex={1} flexBasis={0} minWidth={80}>
          <Field label="CAP" aria-label="CAP per la fattura" value={draft.postalCode} onChangeText={(v) => set("postalCode", v.replace(/\D/g, "").slice(0, 5))} inputMode="numeric" error={errors?.postalCode} />
        </YStack>
        <YStack flex={2} flexBasis={0} minWidth={120}>
          <Field
            label="Comune"
            aria-label="Comune per la fattura"
            value={draft.city}
            onChangeText={(v) => {
              const comune = comuni?.findComuneByName(v);
              onChange({ ...draft, city: v, ...(comune ? { province: comune.province } : {}) });
            }}
            error={errors?.city}
          />
        </YStack>
        <YStack width={72} flexShrink={0}>
          <Field
            label="Prov."
            aria-label="Provincia per la fattura (sigla)"
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
  receipt = false,
}: {
  token: string;
  quoteId: string;
  professionalName: string;
  initial: ClientInvoiceRequestView | null;
  defaults?: Partial<InvoiceDraft>;
  onSaved: () => void;
  receipt?: boolean;
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
    const { parseInvoiceDraft } = await import("./clientInvoiceDraftParse");
    const parsed = parseInvoiceDraft(draft, receipt);
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
      <YStack gap="2" padding="3" borderRadius={20} backgroundColor={brand.gesso}>
        <XStack alignItems="center" gap="2">
          <Icon name="receipt-text" size={18} strokeWidth={2} color={brand.grafite70} />
          <Text fontSize={16} fontWeight="700" color={brand.grafite}>
            Hai chiesto {receipt ? "la ricevuta" : "la fattura"} a {professionalName}
          </Text>
        </XStack>
        <Text fontSize={13} color={brand.grafite70}>
          {invoiceFromProfessionalNote(receipt)}
        </Text>
        <YStack gap={2}>
          {clientInvoiceLines(initial)
            .filter((line) => !receipt || !/^(Codice destinatario|PEC) /.test(line))
            .map((line) => (
            <Text key={line} fontSize={16} color={brand.grafite}>
              {line}
            </Text>
          ))}
        </YStack>
        <XStack gap="3" flexWrap="wrap">
          <Text fontSize={16} fontWeight="700" color={brand.cianografiaScuro} textDecorationLine="underline" cursor="pointer" role="button" onPress={() => void open()}>
            Modifica
          </Text>
          <Text fontSize={16} fontWeight="700" color={brand.grafite70} textDecorationLine="underline" cursor="pointer" role="button" onPress={() => (saving ? undefined : void remove())}>
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
    <YStack gap="3">
      <InvoiceRequestToggle professionalName={professionalName} checked={editing} receipt={receipt} onToggle={() => (editing ? setEditing(false) : void open())} />
      {editing ? (
        <>
          <InvoiceRequestFields draft={draft} onChange={setDraft} errors={errors} receipt={receipt} />
          <XStack gap="2" flexWrap="wrap">
            <Button variant="primary" onPress={() => void save()} disabled={saving}>
              {saving ? <ButtonWaitBar label="Invio in corso…" /> : initial ? "Salva i dati" : "Manda la richiesta"}
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
