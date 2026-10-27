"use client";

import { useCallback, useEffect, useState } from "react";
import {
  OUT_OF_SERVICE_LABELS,
  PROFESSIONAL_CATEGORIES,
  type ProblemMatchAdminOverview,
  type ServiceNamesAdminOverview,
} from "@professionisti/shared";
import { Button, Text, XStack, YStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { AdminCard, AdminPageHeader, AdminPill, AdminTabs, errorMessage, formatAdminDate } from "@/components/admin/adminUi";
import { SkeletonTableRows } from "@/components/Skeleton";

type Tab = "descrizioni" | "prestazioni";
type Filter = "tutte" | "fuori" | "ia" | "nessuno";

const SAFETY_LABEL: Record<string, string> = {
  gas: "Gas",
  elettrico: "Elettricità",
  "acqua-elettrico": "Acqua sull'impianto",
  monossido: "Monossido",
};

function targetLabel(categorySlug: string | null, outOfService: string | null): string {
  if (categorySlug) return PROFESSIONAL_CATEGORIES.find((c) => c.slug === categorySlug)?.label ?? categorySlug;
  if (outOfService) return `Fuori servizio: ${OUT_OF_SERVICE_LABELS[outOfService as keyof typeof OUT_OF_SERVICE_LABELS] ?? outOfService}`;
  return "—";
}

/**
 * "Mestieri richiesti" (docs/CHANGELOG.md §387, richiesta di Luca): cosa
 * scrivono i clienti nella ricerca, a chi li abbiamo mandati, le parole da
 * insegnare al dizionario e i nomi delle prestazioni da unire.
 */
export default function AdminMestieriRichiestiPage() {
  const [tab, setTab] = useState<Tab>("descrizioni");
  return (
    <YStack>
      <AdminPageHeader
        title="Mestieri richiesti"
        description="Le descrizioni scritte dai clienti nella ricerca (senza contatti, tenute 12 mesi) e i nomi delle prestazioni scritti a mano dai professionisti."
      />
      <AdminTabs
        tabs={[
          { key: "descrizioni", label: "Descrizioni dei clienti" },
          { key: "prestazioni", label: "Prestazioni da unire" },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === "descrizioni" ? <DescriptionsTab /> : <ServiceNamesTab />}
    </YStack>
  );
}

function DescriptionsTab() {
  const { token } = useAuth();
  const [filter, setFilter] = useState<Filter>("tutte");
  const [data, setData] = useState<ProblemMatchAdminOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [word, setWord] = useState("");
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    if (!token) return;
    apiClient
      .adminProblemMatch(token, filter)
      .then(setData)
      .catch((err) => setError(errorMessage(err)));
  }, [token, filter]);

  useEffect(load, [load]);

  const teach = async () => {
    if (!token || !target) return;
    setBusy(true);
    setError(null);
    try {
      const [kind, value] = target.split(":");
      await apiClient.adminTeachProblemWord(token, {
        word,
        ...(kind === "categoria" ? { categorySlug: value } : { outOfService: value }),
      });
      setWord("");
      setTarget("");
      load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const forget = async (id: string) => {
    if (!token) return;
    setError(null);
    try {
      await apiClient.adminForgetProblemWord(token, id);
      load();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const month = data?.lastMonth;

  return (
    <YStack gap="$4" marginTop="$3">
      {month ? (
        <AdminCard>
          <Text fontWeight="700">Ultimi 30 giorni: {month.total} descrizioni</Text>
          <Text color={brand.grafite70} marginTop="$1">
            {month.safety} con avviso di sicurezza · {month.ai} decise dall&apos;intelligenza artificiale · {month.none} non capite
          </Text>
          {month.byCategory.length > 0 ? (
            <Text color={brand.grafite70} marginTop="$1">
              Mestieri: {month.byCategory.map((row) => `${targetLabel(row.key, null)} ${row.count}`).join(" · ")}
            </Text>
          ) : null}
          {month.byOutOfService.length > 0 ? (
            <Text color={brand.grafite} fontWeight="600" marginTop="$1">
              Lavori che non copriamo:{" "}
              {month.byOutOfService
                .map((row) => `${OUT_OF_SERVICE_LABELS[row.key as keyof typeof OUT_OF_SERVICE_LABELS] ?? row.key} ${row.count}`)
                .join(" · ")}
            </Text>
          ) : null}
        </AdminCard>
      ) : null}

      <YStack gap="$2">
        <Text fontWeight="700">Insegna una parola al dizionario</Text>
        <Text color={brand.grafite70} fontSize={13}>
          Se la parola compare nella descrizione, il cliente va a quel mestiere senza chiedere all&apos;intelligenza artificiale. Basta
          l&apos;inizio della parola: «zanzarier» vale per zanzariera e zanzariere.
        </Text>
        <XStack gap="$2" flexWrap="wrap">
          <input
            aria-label="Parola"
            className="admin-input"
            style={{ flex: 1, minWidth: 180 }}
            value={word}
            onChange={(e) => setWord(e.target.value)}
            placeholder="Es. zanzarier"
          />
          <select aria-label="Porta a" className="admin-input" value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">Porta a…</option>
            <optgroup label="Mestieri">
              {PROFESSIONAL_CATEGORIES.map((c) => (
                <option key={c.slug} value={`categoria:${c.slug}`}>
                  {c.label}
                </option>
              ))}
            </optgroup>
            <optgroup label="Lavori che non copriamo">
              {Object.entries(OUT_OF_SERVICE_LABELS).map(([key, label]) => (
                <option key={key} value={`fuori:${key}`}>
                  {label}
                </option>
              ))}
            </optgroup>
          </select>
          <Button variant="primary" size="$3" disabled={busy || word.trim().length < 3 || !target} onPress={() => void teach()}>
            Insegna
          </Button>
        </XStack>
        {data && data.words.length > 0 ? (
          <XStack gap="$2" flexWrap="wrap" marginTop="$1">
            {data.words.map((entry) => (
              <XStack
                key={entry.id}
                gap="$2"
                alignItems="center"
                borderWidth={1}
                borderColor={brand.filetto}
                borderRadius={999}
                paddingLeft="$3"
                paddingRight="$1"
                paddingVertical={2}
              >
                <Text fontSize={13}>
                  «{entry.word}» → {targetLabel(entry.categorySlug, entry.outOfService)}
                </Text>
                <Button size="$2" variant="secondary" onPress={() => void forget(entry.id)} aria-label={`Togli la parola ${entry.word}`}>
                  Togli
                </Button>
              </XStack>
            ))}
          </XStack>
        ) : null}
      </YStack>

      {error ? <Text color={brand.urgenza}>{error}</Text> : null}

      <AdminTabs
        tabs={[
          { key: "tutte", label: "Tutte" },
          { key: "fuori", label: "Lavori che non copriamo" },
          { key: "ia", label: "Decise dall'IA" },
          { key: "nessuno", label: "Non capite" },
        ]}
        value={filter}
        onChange={setFilter}
      />
      {data === null && !error ? (
        <SkeletonTableRows rows={5} cols={5} />
      ) : data && data.descriptions.length === 0 ? (
        <Text color={brand.grafite70}>Ancora nessuna descrizione.</Text>
      ) : data ? (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Descrizione</th>
                <th>Città</th>
                <th>Proposto</th>
                <th>Sicurezza</th>
                <th>Chi ha deciso</th>
                <th>Quando</th>
              </tr>
            </thead>
            <tbody>
              {data.descriptions.map((row) => (
                <tr key={row.id}>
                  <td style={{ maxWidth: 420 }}>{row.text}</td>
                  <td>{row.city ?? "—"}</td>
                  <td>
                    {row.outOfService
                      ? targetLabel(null, row.outOfService)
                      : row.categories.length > 0
                        ? row.categories.map((slug) => targetLabel(slug, null)).join(", ")
                        : "Non capita"}
                  </td>
                  <td>{row.safety ? <AdminPill tone="danger">{SAFETY_LABEL[row.safety] ?? row.safety}</AdminPill> : "—"}</td>
                  <td>{row.source === "ia" ? "IA" : row.source === "parola" ? "Parola insegnata" : "Dizionario"}</td>
                  <td>{formatAdminDate(row.createdAt, true)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </YStack>
  );
}

function ServiceNamesTab() {
  const { token } = useAuth();
  const [data, setData] = useState<ServiceNamesAdminOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [targets, setTargets] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!token) return;
    apiClient
      .adminServiceNames(token)
      .then(setData)
      .catch((err) => setError(errorMessage(err)));
  }, [token]);

  useEffect(load, [load]);

  const merge = async (name: string) => {
    const canonical = targets[name];
    if (!token || !canonical) return;
    setBusy(name);
    setError(null);
    try {
      await apiClient.adminMergeServiceName(token, { name, canonical });
      load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const unmerge = async (key: string) => {
    if (!token) return;
    setBusy(key);
    setError(null);
    try {
      await apiClient.adminUnmergeServiceName(token, key);
      load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <YStack gap="$3" marginTop="$3">
      <Text color={brand.grafite70}>
        Nomi scritti a mano dai professionisti, non tra quelli suggeriti. Unendoli a un nome suggerito si sommano nella ricerca e nel
        &quot;Quanto costa in media&quot;; sul profilo resta il nome scritto dal professionista.
        {data ? ` In evidenza quelli scritti da almeno ${data.minProfessionals} professionisti.` : ""}
      </Text>
      {error ? <Text color={brand.urgenza}>{error}</Text> : null}
      {data === null && !error ? (
        <SkeletonTableRows rows={5} cols={4} />
      ) : data && data.names.length === 0 ? (
        <Text color={brand.grafite70}>Nessun nome scritto a mano: tutti usano i nomi suggeriti.</Text>
      ) : data ? (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Scritto come</th>
                <th>Professionisti</th>
                <th>Unisci a…</th>
              </tr>
            </thead>
            <tbody>
              {data.names.map((row) => (
                <tr key={row.name}>
                  <td>
                    {row.name}
                    {row.professionalCount >= data.minProfessionals ? (
                      <>
                        {" "}
                        <AdminPill tone="warn">Da unire</AdminPill>
                      </>
                    ) : null}
                  </td>
                  <td>{row.variants.join(" · ")}</td>
                  <td>{row.professionalCount}</td>
                  <td>
                    <XStack gap="$2" alignItems="center">
                      <select
                        aria-label={`Unisci ${row.name} a`}
                        className="admin-input"
                        value={targets[row.name] ?? ""}
                        onChange={(e) =>
                          setTargets((prev) => ({
                            ...prev,
                            [row.name]: e.target.value,
                          }))
                        }
                      >
                        <option value="">Scegli…</option>
                        {data.suggested.map((name) => (
                          <option key={name} value={name}>
                            {name}
                          </option>
                        ))}
                      </select>
                      <Button
                        size="$2"
                        variant="secondary"
                        disabled={!targets[row.name] || busy !== null}
                        onPress={() => void merge(row.name)}
                      >
                        Unisci
                      </Button>
                    </XStack>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {data && data.aliases.length > 0 ? (
        <YStack gap="$2" marginTop="$3">
          <Text fontWeight="700">Già uniti</Text>
          {data.aliases.map((alias) => (
            <XStack key={alias.key} gap="$2" alignItems="center">
              <Text fontSize={13}>
                «{alias.key}» → {alias.canonical}
              </Text>
              <Button size="$2" variant="secondary" disabled={busy !== null} onPress={() => void unmerge(alias.key)}>
                Annulla
              </Button>
            </XStack>
          ))}
        </YStack>
      ) : null}
    </YStack>
  );
}
