"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  INVOICE_SOURCE_LABEL,
  accountantSettingsSchema,
  accountingMonthLabel,
  formatEurCents,
  freePeriodSummary,
  type DocumentsOverview,
  type MySubscription,
} from "@professionisti/shared";
import { Button, EmptyState, Field, Section, Surface, Text, XStack, YStack, brand, radiusDoc } from "@professionisti/ui";
import { ConsentCheckbox } from "@/components/ConsentCheckbox";
import { LearnMore } from "@/components/LearnMore";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { documentDate } from "./_components/DocumentParts";

/**
 * "Fatture e documenti" del professionista (decisioni dell'utente del
 * 27/10/2026, docs/CHANGELOG.md §372): le nostre fatture, l'estratto di ogni
 * mese e il commercialista a cui mandarlo. Si arriva da Abbonamento e da
 * Dati fiscali, senza una voce nel menu.
 */
export default function DocumentsPage() {
  const { token, isLoading } = useAuth();
  const [data, setData] = useState<DocumentsOverview | null | undefined>(undefined);
  const [sub, setSub] = useState<MySubscription | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    apiClient
      .documentsOverview(token)
      .then(setData)
      .catch((e) => {
        setData(null);
        setError(e instanceof Error ? e.message : "Non riusciamo a caricare i documenti: riprova tra poco.");
      });
    apiClient
      .getMySubscription(token)
      .then(setSub)
      .catch(() => setSub(null));
  }, [token]);

  const free = sub ? freePeriodSummary(sub, new Date()) : null;

  return (
    <Section title="Fatture e documenti" maxWidth={760}>
      <YStack gap="$5">
        <LearnMore fontSize={16} summary="Le nostre fatture e l'estratto di ogni mese, da scaricare o dare al commercialista.">
          <Text fontSize={16} color={brand.grafite70}>
            Ogni mese ti mandiamo una fattura con le trattenute sui pagamenti online, e una per l&apos;abbonamento quando lo paghi. Sono già
            pagate: non devi fare nulla.
          </Text>
          <Text fontSize={16} color={brand.grafite70}>
            L&apos;estratto del mese mette insieme quanto ti hanno pagato i clienti, quanto abbiamo trattenuto e i bonifici arrivati.
          </Text>
        </LearnMore>

        {free ? (
          <Link href="/dashboard/documenti/mese-gratuito" style={{ textDecoration: "none" }}>
            <Surface borderRadius={radiusDoc} padding="$4" gap="$1" backgroundColor={brand.cianografiaVelo}>
              <XStack justifyContent="space-between" alignItems="center" gap="$3" flexWrap="wrap">
                <Text fontSize={16} fontWeight="800" color={brand.grafite}>
                  Abbonamento di questo mese: 0 €
                </Text>
                <Text fontSize={16} fontWeight="700" color={brand.cianografiaScuro}>
                  Vedi il riepilogo →
                </Text>
              </XStack>
              <Text fontSize={16} color={brand.grafite70}>
                {free.label}
                {free.months > 1 ? `, mese ${free.month} di ${free.months}` : ""}.
              </Text>
            </Surface>
          </Link>
        ) : null}

        {isLoading || data === undefined ? (
          <YStack gap="$3" aria-busy>
            <YStack height={88} borderRadius="$3" backgroundColor={brand.gesso} />
            <YStack height={140} borderRadius="$3" backgroundColor={brand.gesso} />
          </YStack>
        ) : error || !data ? (
          <Text fontSize={16} color={brand.urgenza} role="alert">
            {error ?? "Non riusciamo a caricare i documenti: riprova tra poco."}
          </Text>
        ) : (
          <>
            <YStack gap="$3">
              <Text tag="h2" fontFamily="$heading" fontSize={22} fontWeight="800" color={brand.grafite}>
                Estratti del mese
              </Text>
              {data.months.length === 0 ? (
                <EmptyState icon="coins" title="Ancora nessun movimento" description="L'estratto compare dal primo pagamento di un cliente." />
              ) : (
                <Surface borderRadius={radiusDoc} padding="$2">
                  {data.months.map((month, index) => (
                    <Link key={month} href={`/dashboard/documenti/estratto/${month}`} style={{ textDecoration: "none" }}>
                      <XStack justifyContent="space-between" alignItems="center" padding="$3" borderTopWidth={index === 0 ? 0 : 1} borderColor={brand.filetto}>
                        <Text fontSize={16} fontWeight="700" color={brand.grafite} textTransform="capitalize">
                          {accountingMonthLabel(month)}
                        </Text>
                        <Text fontSize={16} fontWeight="700" color={brand.cianografiaScuro}>
                          Apri →
                        </Text>
                      </XStack>
                    </Link>
                  ))}
                </Surface>
              )}
            </YStack>

            <YStack gap="$3">
              <Text tag="h2" fontFamily="$heading" fontSize={22} fontWeight="800" color={brand.grafite}>
                Fatture
              </Text>
              {data.invoices.length === 0 ? (
                <Text fontSize={16} color={brand.grafite70}>
                  {data.invoicesActive ? "Ancora nessuna fattura: la prima arriva il mese dopo il primo pagamento online." : "Le nostre fatture partono con l'apertura del sito. Intanto qui trovi gli estratti."}
                </Text>
              ) : (
                <Surface borderRadius={radiusDoc} padding="$2">
                  {data.invoices.map((invoice, index) => (
                    <Link key={invoice.id} href={`/dashboard/documenti/fattura/${invoice.id}`} style={{ textDecoration: "none" }}>
                      <XStack justifyContent="space-between" alignItems="center" gap="$3" padding="$3" borderTopWidth={index === 0 ? 0 : 1} borderColor={brand.filetto}>
                        <YStack flex={1} minWidth={0} gap={2}>
                          <Text fontSize={16} fontWeight="700" color={brand.grafite}>
                            {invoice.creditNote ? "Nota di credito" : INVOICE_SOURCE_LABEL[invoice.source]}
                            {invoice.periodMonth ? `, ${accountingMonthLabel(invoice.periodMonth)}` : ""}
                          </Text>
                          <Text fontSize={13} color={brand.grafite70}>
                            {invoice.number} · {documentDate(invoice.issuedAt)}
                          </Text>
                        </YStack>
                        <Text fontSize={16} fontWeight="800" color={brand.grafite} fontVariant={["tabular-nums"]}>
                          {invoice.creditNote ? "−" : ""}
                          {formatEurCents(invoice.totalEurCents)}
                        </Text>
                      </XStack>
                    </Link>
                  ))}
                </Surface>
              )}
            </YStack>

            {token ? <AccountantCard token={token} initial={data.accountant} /> : null}
          </>
        )}
      </YStack>
    </Section>
  );
}

/** Il commercialista: l'estratto gli arriva per email il 1° del mese, solo con la spunta. */
function AccountantCard({ token, initial }: { token: string; initial: DocumentsOverview["accountant"] }) {
  const [email, setEmail] = useState(initial.email ?? "");
  const [enabled, setEnabled] = useState(initial.enabled);
  const [saved, setSaved] = useState(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const dirty = email.trim().toLowerCase() !== (saved.email ?? "") || enabled !== saved.enabled;

  async function save() {
    const parsed = accountantSettingsSchema.safeParse({ email: email.trim() || undefined, enabled });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Controlla l'email.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const result = await apiClient.updateAccountant(token, parsed.data);
      setSaved(result);
      setEmail(result.email ?? "");
      setEnabled(result.enabled);
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Non riusciamo a salvare: riprova tra poco.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Surface borderRadius={radiusDoc} padding="$5" gap="$3">
      <Text tag="h2" fontFamily="$heading" fontSize={22} fontWeight="800" color={brand.grafite}>
        Il tuo commercialista
      </Text>
      <Field
        label="Email del commercialista"
        accessibilityLabel="Email del commercialista"
        value={email}
        onChangeText={(value) => {
          setEmail(value);
          setDone(false);
        }}
        inputMode="email"
        autoComplete="email"
        error={error ?? undefined}
      />
      <ConsentCheckbox
        checked={enabled}
        onToggle={() => {
          setEnabled((value) => !value);
          setDone(false);
        }}
      >
        Mandagli l&apos;estratto ogni mese, in PDF e nel foglio di calcolo
      </ConsentCheckbox>
      <XStack gap="$3" alignItems="center" flexWrap="wrap">
        <Button alignSelf="flex-start" disabled={!dirty || pending} opacity={!dirty || pending ? 0.6 : 1} onPress={() => void save()}>
          {pending ? "Salvataggio..." : "Salva"}
        </Button>
        {done && !dirty ? (
          <Text fontSize={16} color={brand.cianografiaScuro} role="status">
            {saved.enabled ? "Fatto: gli arriva il 1° di ogni mese." : "Salvato."}
          </Text>
        ) : null}
      </XStack>
    </Surface>
  );
}
