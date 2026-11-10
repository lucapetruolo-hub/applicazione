"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode, useRef } from "react";
import { useDialogFocus } from "@/lib/useDialogFocus";
import { Button, Icon, Text, XStack, YStack, brand, radiusDoc } from "@professionisti/ui";
import { accountingDateLabel, formatEurCents, type JobDocumentsView } from "@professionisti/shared";
import { apiClient } from "@/lib/apiClient";
import { closeOnBackdrop } from "@/lib/closeOnBackdrop";
import { downloadBlobFile } from "@/components/admin/adminUi";

/**
 * "Documenti" dal menu di una richiesta con un lavoro accettato (decisione
 * dell'utente del 27/10/2026, docs/CHANGELOG.md §386), uguale per
 * professionista e cliente: la ricevuta (senza partita IVA) e i soldi
 * del lavoro. Il professionista vede anche le nostre trattenute, le fatture
 * che le contengono e gli estratti dei mesi; il cliente la copia solo dopo
 * che il professionista l'ha scaricata (lo decide il server).
 */
export type DocumentsQuote = { id: string; businessName: string; label: string };

export function JobDocumentsModal({
  token,
  bookingId,
  quotes = [],
  onClose,
}: {
  token: string;
  /** Lavoro accettato: i suoi documenti. Senza, solo i preventivi. */
  bookingId?: string | null;
  /** Preventivi della richiesta da scaricare in PDF (05/11/2026). */
  quotes?: DocumentsQuote[];
  onClose: () => void;
}) {
  const [view, setView] = useState<JobDocumentsView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!bookingId) return;
    let active = true;
    apiClient
      .jobDocuments(token, bookingId)
      .then((result) => {
        if (active) setView(result);
      })
      .catch((e: unknown) => {
        if (active) setError(e instanceof Error ? e.message : "Non riusciamo a caricare i documenti: riprova tra poco.");
      });
    return () => {
      active = false;
    };
  }, [token, bookingId]);

  // Fuoco dentro, Tab chiuso nella finestra, Esc chiude, fuoco restituito alla chiusura (lib/useDialogFocus.ts).
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogFocus(dialogRef, onClose);

  return (
    <div
      role="presentation"
      onClick={closeOnBackdrop(onClose)}
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(20,24,30,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1100,
        padding: 16,
      }}
    >
      <YStack
        ref={dialogRef as never} role="dialog"
        aria-modal
        aria-label={bookingId ? "Documenti del lavoro" : "Documenti"}
        width="100%"
        maxWidth={520}
        maxHeight="85vh"
        overflow="scroll"
        backgroundColor={brand.calce}
        borderRadius={radiusDoc}
        borderWidth={1}
        borderColor={brand.filetto}
        padding="5"
        gap="4"
      >
        <XStack justifyContent="space-between" alignItems="center" gap="3">
          <Text render="h2" fontFamily="heading" fontSize={22} fontWeight="800" color={brand.grafite}>
            {bookingId ? "Documenti del lavoro" : "Documenti"}
          </Text>
          <Text fontSize="5" color={brand.grafite70} cursor="pointer" onPress={onClose} role="button" aria-label="Chiudi">
            ✕
          </Text>
        </XStack>

        {quotes.length > 0 ? (
          <Part title={quotes.length > 1 ? "Preventivi" : "Preventivo"}>
            {quotes.map((quote) => (
              <PdfButton
                key={quote.id}
                label={quote.businessName ? `${quote.businessName}: ${quote.label}` : quote.label}
                fileName={`preventivo-${quote.businessName}`}
                load={() => apiClient.quotePdf(token, quote.id)}
              />
            ))}
          </Part>
        ) : null}

        {!bookingId ? null : error ? (
          <Text fontSize={16} color={brand.urgenza} role="alert">
            {error}
          </Text>
        ) : !view ? (
          <Text fontSize={16} color={brand.grafite70}>
            Carico i documenti…
          </Text>
        ) : view.audience === "PROFESSIONAL" ? (
          <ProfessionalDocuments token={token} view={view} />
        ) : (
          <ClientDocuments token={token} view={view} />
        )}
      </YStack>
    </div>
  );
}

function ProfessionalDocuments({ token, view }: { token: string; view: JobDocumentsView }) {
  const copyHref = `/dashboard/documenti/cortesia/${view.bookingId}`;
  return (
    <>
      <Part title="Per il cliente">
        {view.clientDocument ? (
          <YStack gap="1">
            <DocLink href={copyHref}>Apri: {view.clientDocument.label}</DocLink>
            {view.clientDocument.amountChanged ? (
              <Text fontSize={13} fontWeight="700" color={brand.ottoneScuro}>
                L&apos;importo è cambiato dopo il PDF: scaricalo di nuovo e ridallo al cliente.
              </Text>
            ) : null}
          </YStack>
        ) : view.ownInvoice ? (
          <Muted>La fattura al cliente la fai col tuo programma.</Muted>
        ) : view.clientDocumentAvailable ? (
          <DocLink href={copyHref}>Prepara la ricevuta</DocLink>
        ) : (
          <Muted>La ricevuta la prepari a lavoro terminato.</Muted>
        )}
        {view.invoiceRequested ? <Muted>Il cliente ti ha chiesto la fattura: i dati da copiare sono nella scheda del lavoro.</Muted> : null}
      </Part>

      <Part title="Movimenti">
        <Movements token={token} view={view} />
      </Part>

      <Part title="Estratti del mese">
        {view.statementMonths.length > 0 ? (
          view.statementMonths.map((m) => (
            <PdfButton key={m.month} label={`Estratto di ${m.label}`} fileName={`estratto-${m.month}`} load={() => apiClient.documentsStatementPdf(token, m.month)} />
          ))
        ) : (
          <Muted>Quando il lavoro avrà dei movimenti, qui trovi l&apos;estratto del mese.</Muted>
        )}
        <DocLink href="/dashboard/documenti">Tutte le fatture e i documenti</DocLink>
      </Part>
    </>
  );
}

function ClientDocuments({ token, view }: { token: string; view: JobDocumentsView }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const doc = view.clientDocument;

  async function download() {
    if (!doc) return;
    setBusy(true);
    setError(null);
    try {
      const fileName = `copia-${doc.label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}.pdf`;
      downloadBlobFile(fileName, await apiClient.jobDocumentCopyPdf(token, view.bookingId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Non riusciamo a preparare il PDF: riprova tra poco.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Part title="Dal professionista">
        {doc ? (
          <YStack gap="2">
            <Text fontSize={16} fontWeight="700" color={brand.grafite}>
              Copia: {doc.label}
            </Text>
            <Button variant="primary" alignSelf="flex-start" disabled={busy} onPress={() => void download()}>
              {busy ? "Preparo il PDF…" : "Scarica il PDF"}
            </Button>
            {error ? (
              <Text fontSize={16} color={brand.urgenza} role="alert">
                {error}
              </Text>
            ) : null}
          </YStack>
        ) : (
          <Muted>
            {view.ownInvoice
              ? "La fattura te la manda il professionista."
              : "La ricevuta te la dà il professionista. Quando l'ha preparata, qui trovi anche una copia."}
          </Muted>
        )}
        {view.invoiceRequested ? <Muted>Hai chiesto la fattura: la fa il professionista con il suo programma.</Muted> : null}
      </Part>

      <Part title="Pagamenti">
        <Movements token={token} view={view} />
        {view.movements.length > 0 ? (
          <PdfButton label="Riepilogo dei pagamenti" fileName="riepilogo-pagamenti" load={() => apiClient.jobPaymentsPdf(token, view.bookingId)} />
        ) : null}
      </Part>
    </>
  );
}

/** Movimenti del lavoro: per il professionista col segno, per il cliente solo l'importo. */
function Movements({ token, view }: { token: string; view: JobDocumentsView }) {
  const pro = view.audience === "PROFESSIONAL";
  if (view.movements.length === 0) return <Muted>{pro ? "Ancora nessun movimento su questo lavoro." : "Ancora nessun pagamento su questo lavoro."}</Muted>;
  return (
    <YStack>
      {view.movements.map((m, index) => (
        <XStack key={`${m.date}-${index}`} justifyContent="space-between" alignItems="flex-start" gap="3" paddingVertical="2" borderTopWidth={index === 0 ? 0 : 1} borderColor={brand.filetto}>
          <YStack flex={1} minWidth={0} gap={2}>
            <Text fontSize={16} color={brand.grafite}>
              {m.label}
            </Text>
            <Text fontSize={13} color={brand.grafite70}>
              {accountingDateLabel(m.date)}
            </Text>
            {m.invoice ? (
              <PdfButton
                compact
                label={`Fattura ${m.invoice.number}`}
                fileName={`fattura-${m.invoice.number}`}
                load={() => apiClient.documentsInvoicePdf(token, m.invoice!.id)}
              />
            ) : null}
          </YStack>
          <Text fontSize={16} fontWeight="800" color={brand.grafite} fontVariant={["tabular-nums"]}>
            {pro ? (m.amountEurCents < 0 ? "−" : "+") : ""}
            {formatEurCents(Math.abs(m.amountEurCents))}
          </Text>
        </XStack>
      ))}
    </YStack>
  );
}

function Part({ title, children }: { title: string; children: ReactNode }) {
  return (
    <YStack gap="2">
      <Text render="h3" fontSize={13} fontWeight="800" color={brand.grafite70} textTransform="uppercase" letterSpacing={0.6}>
        {title}
      </Text>
      {children}
    </YStack>
  );
}

function DocLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} style={{ color: brand.cianografiaScuro, fontWeight: 700, fontSize: 16 }}>
      {children}
    </Link>
  );
}

function Muted({ children }: { children: ReactNode }) {
  return (
    <Text fontSize={16} color={brand.grafite70}>
      {children}
    </Text>
  );
}

/**
 * Un documento da scaricare con un tocco (05/11/2026): prima i link
 * portavano a pagine da cui scaricare, e dalla finestra non si scaricava
 * niente. Stesso scaricamento delle altre pagine dei documenti.
 */
function PdfButton({ label, fileName, load, compact }: { label: string; fileName: string; load: () => Promise<Blob>; compact?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function download() {
    setBusy(true);
    setError(null);
    try {
      downloadBlobFile(`${fileName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}.pdf`, await load());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Non riusciamo a preparare il PDF: riprova tra poco.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <YStack gap={2}>
      <XStack
        alignItems="center"
        gap="2"
        alignSelf="flex-start"
        cursor={busy ? "progress" : "pointer"}
        role="button"
        tabIndex={0}
        aria-label={`Scarica il PDF: ${label}`}
        onPress={() => (busy ? undefined : void download())}
        onKeyDown={(e: { key: string; preventDefault: () => void }) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            if (!busy) void download();
          }
        }}
        paddingVertical={compact ? 2 : 6}
      >
        <Icon name="download" size={compact ? 14 : 18} color={brand.cianografiaScuro} />
        <Text fontSize={compact ? 14 : 16} fontWeight="700" color={brand.cianografiaScuro} textDecorationLine="underline">
          {busy ? "Preparo il PDF…" : label}
        </Text>
      </XStack>
      {error ? (
        <Text fontSize={13} color={brand.urgenza} role="alert">
          {error}
        </Text>
      ) : null}
    </YStack>
  );
}
