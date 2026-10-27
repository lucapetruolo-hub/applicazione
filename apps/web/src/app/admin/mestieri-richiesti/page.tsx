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
          { key: "prestazioni", label: "Prestazioni per mestiere" },
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
  "use no memo";
  const { token } = useAuth();
  const [data, setData] = useState<ServiceNamesAdminOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [targets, setTargets] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [onlyToReview, setOnlyToReview] = useState(false);

  const load = useCallback(() => {
    if (!token) return;
    apiClient
      .adminServiceNames(token)
      .then(setData)
      .catch((err) => setError(errorMessage(err)));
  }, [token]);

  useEffect(load, [load]);

  // Un'azione alla volta, poi si ricarica il quadro.
  const run = async (busyKey: string, action: (token: string) => Promise<unknown>) => {
    if (!token) return;
    setBusy(busyKey);
    setError(null);
    try {
      await action(token);
      load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const categories = data ? data.categories.filter((category) => !onlyToReview || category.handwritten.length > 0) : [];

  return (
    <YStack gap="$3" marginTop="$3">
      <Text color={brand.grafite70}>
        Accanto a ogni prestazione, quanti professionisti la usano. Con <Text fontWeight="700">+</Text> una prestazione scritta dai
        professionisti entra tra le standard e compare in iscrizione e nel profilo; &quot;Unisci a…&quot; se è lo stesso lavoro di una
        standard.
      </Text>
      <label className="mr-check">
        <input type="checkbox" checked={onlyToReview} onChange={(e) => setOnlyToReview(e.target.checked)} /> Solo i mestieri con prestazioni
        scritte a mano
      </label>
      {error ? <Text color={brand.urgenza}>{error}</Text> : null}
      {data === null && !error ? <SkeletonTableRows rows={5} cols={3} /> : null}
      {data && categories.length === 0 ? (
        <Text color={brand.grafite70}>Nessuna prestazione scritta a mano: tutti usano le standard.</Text>
      ) : null}

      {data
        ? categories.map((category) => (
            <AdminCard key={category.slug}>
              <XStack gap="$2" alignItems="center" flexWrap="wrap">
                <Text fontSize={17} fontWeight="700">
                  {category.label}
                </Text>
                {category.handwritten.length > 0 ? <AdminPill tone="warn">{category.handwritten.length} scritte a mano</AdminPill> : null}
              </XStack>

              <Text fontSize={13} fontWeight="700" color={brand.grafite70} marginTop="$2">
                Standard
              </Text>
              <ul className="mr-chips" aria-label={`Prestazioni standard di ${category.label}`}>
                {category.standard.map((row) => (
                  <li key={row.name} className={row.id ? "mr-chip mr-chip-added" : "mr-chip"}>
                    <span>{row.name}</span>
                    <span className="mr-count" aria-label={`${row.professionalCount} professionisti`}>
                      {row.professionalCount}
                    </span>
                    {row.id ? (
                      <button
                        type="button"
                        className="mr-remove"
                        disabled={busy !== null}
                        aria-label={`Togli ${row.name} dalle standard di ${category.label}`}
                        onClick={() => void run(`standard-${row.id}`, (t) => apiClient.adminRemoveStandardService(t, row.id as string))}
                      >
                        ✕
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>

              {category.handwritten.length > 0 ? (
                <>
                  <Text fontSize={13} fontWeight="700" color={brand.grafite70} marginTop="$2">
                    Scritte dai professionisti
                  </Text>
                  <ul className="mr-rows">
                    {category.handwritten.map((row) => {
                      const targetKey = `${category.slug}:${row.name}`;
                      return (
                        <li key={row.name} className="mr-row">
                          <button
                            type="button"
                            className="mr-add"
                            disabled={busy !== null}
                            aria-label={`Aggiungi ${row.name} alle standard di ${category.label}`}
                            title="Aggiungi alle standard"
                            onClick={() =>
                              void run(`add-${targetKey}`, (t) =>
                                apiClient.adminAddStandardService(t, { name: row.name, categorySlug: category.slug }),
                              )
                            }
                          >
                            +
                          </button>
                          <span className="mr-row-name">
                            {row.name}
                            {row.variants.length > 1 || row.variants[0] !== row.name ? (
                              <span className="mr-variants">scritto come {row.variants.join(" · ")}</span>
                            ) : null}
                          </span>
                          <span className="mr-count" aria-label={`${row.professionalCount} professionisti`}>
                            {row.professionalCount}
                          </span>
                          {row.professionalCount >= data.minProfessionals ? <AdminPill tone="warn">Da valutare</AdminPill> : null}
                          <span className="mr-merge">
                            <select
                              aria-label={`Unisci ${row.name} a`}
                              className="admin-input"
                              value={targets[targetKey] ?? ""}
                              onChange={(e) => setTargets((prev) => ({ ...prev, [targetKey]: e.target.value }))}
                            >
                              <option value="">Unisci a…</option>
                              {category.standard.map((standard) => (
                                <option key={standard.name} value={standard.name}>
                                  {standard.name}
                                </option>
                              ))}
                            </select>
                            <Button
                              size="$2"
                              variant="secondary"
                              disabled={!targets[targetKey] || busy !== null}
                              onPress={() =>
                                void run(`merge-${targetKey}`, (t) =>
                                  apiClient.adminMergeServiceName(t, { name: row.name, canonical: targets[targetKey] as string }),
                                )
                              }
                            >
                              Unisci
                            </Button>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </>
              ) : null}
            </AdminCard>
          ))
        : null}

      {data && data.aliases.length > 0 ? (
        <YStack gap="$2" marginTop="$3">
          <Text fontWeight="700">Già uniti</Text>
          {data.aliases.map((alias) => (
            <XStack key={alias.key} gap="$2" alignItems="center">
              <Text fontSize={13}>
                «{alias.key}» → {alias.canonical}
              </Text>
              <Button
                size="$2"
                variant="secondary"
                disabled={busy !== null}
                onPress={() => void run(`unmerge-${alias.key}`, (t) => apiClient.adminUnmergeServiceName(t, alias.key))}
              >
                Annulla
              </Button>
            </XStack>
          ))}
        </YStack>
      ) : null}

      <style jsx>{`
        .mr-check {
          display: flex;
          gap: 8px;
          align-items: center;
          font-size: 14px;
        }
        .mr-chips,
        .mr-rows {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        .mr-rows {
          flex-direction: column;
        }
        .mr-chip {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 4px 6px 4px 12px;
          border-radius: 999px;
          border: 1px solid ${brand.filetto};
          font-size: 13px;
          min-width: 0;
        }
        .mr-chip-added {
          border-color: ${brand.cianografia};
        }
        .mr-count {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 24px;
          height: 24px;
          padding: 0 6px;
          border-radius: 999px;
          background: #f1ece6;
          font-size: 12px;
          font-weight: 700;
          font-variant-numeric: tabular-nums;
        }
        .mr-remove,
        .mr-add {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          border: none;
          cursor: pointer;
          flex-shrink: 0;
        }
        .mr-remove {
          width: 24px;
          height: 24px;
          background: transparent;
          color: ${brand.grafite70};
          font-size: 12px;
        }
        .mr-add {
          width: 32px;
          height: 32px;
          background: ${brand.cianografiaPieno};
          color: #fff;
          font-size: 20px;
          font-weight: 700;
          line-height: 1;
        }
        .mr-remove:disabled,
        .mr-add:disabled {
          opacity: 0.5;
          cursor: default;
        }
        .mr-remove:focus-visible,
        .mr-add:focus-visible {
          outline: 2px solid ${brand.cianografia};
          outline-offset: 2px;
        }
        .mr-row {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 8px;
          padding: 8px 0;
          border-top: 1px solid ${brand.filetto};
        }
        .mr-row-name {
          display: flex;
          flex-direction: column;
          flex: 1 1 180px;
          min-width: 0;
          font-size: 14px;
          overflow-wrap: anywhere;
        }
        .mr-variants {
          font-size: 12px;
          color: ${brand.grafite70};
        }
        .mr-merge {
          display: inline-flex;
          gap: 6px;
          align-items: center;
          flex-wrap: wrap;
        }
      `}</style>
    </YStack>
  );
}
