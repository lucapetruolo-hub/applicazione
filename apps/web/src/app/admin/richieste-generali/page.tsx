"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_GENERAL_REQUEST_THRESHOLDS,
  GENERAL_REQUESTS_WINDOW_DAYS,
  PROFESSIONAL_CATEGORIES,
  generalRequestThresholdsSchema,
  type GeneralRequestThresholds,
  type GeneralRequestsAdminOverview,
  type ProfessionalCategorySlug,
} from "@professionisti/shared";
import { Button, Text, XStack, YStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { AdminCard, AdminPageHeader, AdminPill, errorMessage, formatAdminDate } from "@/components/admin/adminUi";
import { SkeletonTableRows } from "@/components/Skeleton";

/**
 * Richieste generali (senza un professionista scelto) per categoria e città
 * (docs/CHANGELOG.md §211): carico per professionista, quota di risposte e
 * chiusura automatica o manuale della singola zona.
 */
export default function AdminRichiesteGeneraliPage() {
  const { token } = useAuth();
  const [data, setData] = useState<GeneralRequestsAdminOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [categorySlug, setCategorySlug] = useState<ProfessionalCategorySlug | "">("");
  const [city, setCity] = useState("");

  const load = useCallback(() => {
    if (!token) return;
    apiClient
      .adminGeneralRequests(token)
      .then(setData)
      .catch((err) => setError(errorMessage(err)));
  }, [token]);

  useEffect(load, [load]);

  const close = async (slug: ProfessionalCategorySlug, zoneCity: string) => {
    if (!token) return;
    setBusy(`${slug}|${zoneCity}`);
    setError(null);
    try {
      await apiClient.adminCloseGeneralRequests(token, { categorySlug: slug, city: zoneCity });
      setCity("");
      load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const reopen = async (blockId: string) => {
    if (!token) return;
    setBusy(blockId);
    setError(null);
    try {
      await apiClient.adminReopenGeneralRequests(token, blockId);
      load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <YStack>
      <AdminPageHeader
        title="Richieste generali"
        description={`Richieste inviate senza scegliere un professionista, ultimi ${GENERAL_REQUESTS_WINDOW_DAYS} giorni. Quando una zona si chiude il cliente vede un avviso e sceglie un professionista dalla ricerca; gli admin di moderazione ricevono un'email.`}
      />

      {data ? (
        <AdminCard highlight={!data.globallyEnabled}>
          <Text fontWeight="700">
            {data.globallyEnabled ? "Richieste generali attive su tutto il sito" : "Richieste generali spente su tutto il sito"}
          </Text>
          <Text color={brand.grafite70} marginTop="$1">
            {data.globallyEnabled
              ? "Per spegnerle ovunque imposta GENERAL_REQUESTS_ENABLED=false sul servizio API di Render. Le richieste a un professionista scelto continuano a funzionare."
              : "Spente da GENERAL_REQUESTS_ENABLED=false su Render. Per riaccenderle togli la variabile o mettila a true."}
          </Text>
        </AdminCard>
      ) : null}

      {data && token ? (
        <ThresholdsForm
          token={token}
          initial={data.thresholds}
          onSaved={(thresholds) => setData((prev) => (prev ? { ...prev, thresholds } : prev))}
          onSavedReload={load}
        />
      ) : null}

      <YStack marginTop="$4" marginBottom="$3" gap="$2">
        <Text fontWeight="700">Chiudi a mano una zona</Text>
        <XStack gap="$2" flexWrap="wrap">
          <select
            aria-label="Categoria"
            className="admin-input"
            value={categorySlug}
            onChange={(e) => setCategorySlug(e.target.value as ProfessionalCategorySlug | "")}
          >
            <option value="">Categoria</option>
            {PROFESSIONAL_CATEGORIES.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.label}
              </option>
            ))}
          </select>
          <input aria-label="Città" className="admin-input" style={{ flex: 1, minWidth: 180 }} value={city} onChange={(e) => setCity(e.target.value)} placeholder="Città" />
          <Button
            variant="secondary"
            size="$3"
            disabled={!categorySlug || city.trim().length < 2 || busy !== null}
            onPress={() => categorySlug && void close(categorySlug, city.trim())}
          >
            Chiudi
          </Button>
        </XStack>
      </YStack>

      {error ? <Text color={brand.urgenza}>{error}</Text> : null}
      {data === null && !error ? (
        <SkeletonTableRows rows={4} cols={6} />
      ) : data && data.rows.length === 0 ? (
        <Text color={brand.grafite70}>Nessuna richiesta generale negli ultimi {GENERAL_REQUESTS_WINDOW_DAYS} giorni.</Text>
      ) : data ? (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Categoria</th>
                <th>Città</th>
                <th>Richieste</th>
                <th>Professionisti</th>
                <th>A settimana per professionista</th>
                <th>Risposte</th>
                <th>Stato</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => {
                const key = `${row.categorySlug}|${row.city}`;
                const overLimit = row.weeklyPerProfessional > data.thresholds.maxWeeklyPerPro;
                return (
                  <tr key={key}>
                    <td>{row.categoryLabel}</td>
                    <td>{row.city}</td>
                    <td>{row.load.requests}</td>
                    <td>{row.load.professionals}</td>
                    <td>
                      <span style={{ color: overLimit ? brand.urgenza : undefined, fontWeight: overLimit ? 700 : undefined }}>
                        {row.weeklyPerProfessional.toLocaleString("it-IT", { maximumFractionDigits: 1 })}
                      </span>
                    </td>
                    <td>
                      {row.responseRate === null
                        ? "Ancora poche"
                        : `${Math.round(row.responseRate * 100)}% su ${row.load.measuredLeads}`}
                    </td>
                    <td>
                      {row.block ? (
                        <YStack gap="$1">
                          <AdminPill tone="danger">{row.block.automatic ? "Chiusa in automatico" : "Chiusa a mano"}</AdminPill>
                          <Text fontSize={12} color={brand.grafite70}>
                            {formatAdminDate(row.block.closedAt)}: {row.block.reason}
                          </Text>
                          {row.block.reopenSuggestion ? (
                            <Text fontSize={12} fontWeight="600" color={brand.grafite}>
                              Si può riaprire. {row.block.reopenSuggestion}
                            </Text>
                          ) : null}
                        </YStack>
                      ) : row.keepOpenUntil ? (
                        <AdminPill tone="ok">Aperta fino al {formatAdminDate(row.keepOpenUntil)}</AdminPill>
                      ) : (
                        <AdminPill tone="ok">Aperta</AdminPill>
                      )}
                    </td>
                    <td>
                      {row.block ? (
                        <Button
                          size="$2"
                          variant={row.block.reopenSuggestion ? "primary" : "secondary"}
                          disabled={busy !== null}
                          onPress={() => row.block && void reopen(row.block.id)}
                        >
                          Riapri
                        </Button>
                      ) : (
                        <Button size="$2" variant="secondary" disabled={busy !== null} onPress={() => void close(row.categorySlug, row.city)}>
                          Chiudi
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
      {data && data.rows.some((r) => r.block) ? (
        <Text color={brand.grafite70} marginTop="$2" fontSize={13}>
          Riaprendo una zona, il controllo automatico non la richiude per {data.thresholds.keepOpenDays} giorni.
        </Text>
      ) : null}
    </YStack>
  );
}

type ThresholdsDraft = Record<Exclude<keyof GeneralRequestThresholds, "autoCloseEnabled">, string> & { autoCloseEnabled: boolean };

function toDraft(t: GeneralRequestThresholds): ThresholdsDraft {
  return {
    autoCloseEnabled: t.autoCloseEnabled,
    maxWeeklyPerPro: String(t.maxWeeklyPerPro).replace(".", ","),
    minResponsePercent: String(t.minResponsePercent),
    minMeasuredLeads: String(t.minMeasuredLeads),
    keepOpenDays: String(t.keepOpenDays),
  };
}

/** Soglie della chiusura automatica (docs/CHANGELOG.md §212). */
function ThresholdsForm({
  token,
  initial,
  onSaved,
  onSavedReload,
}: {
  token: string;
  initial: GeneralRequestThresholds;
  onSaved: (t: GeneralRequestThresholds) => void;
  onSavedReload: () => void;
}) {
  const [draft, setDraft] = useState<ThresholdsDraft>(() => toDraft(initial));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const save = async () => {
    const parsed = generalRequestThresholdsSchema.safeParse({
      autoCloseEnabled: draft.autoCloseEnabled,
      maxWeeklyPerPro: Number(draft.maxWeeklyPerPro.replace(",", ".")),
      minResponsePercent: Number(draft.minResponsePercent),
      minMeasuredLeads: Number(draft.minMeasuredLeads),
      keepOpenDays: Number(draft.keepOpenDays),
    });
    if (!parsed.success) {
      setMessage({ ok: false, text: parsed.error.issues[0]?.message ?? "Controlla i valori." });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const saved = await apiClient.adminUpdateGeneralRequestThresholds(token, parsed.data);
      setDraft(toDraft(saved));
      onSaved(saved);
      onSavedReload();
      setMessage({ ok: true, text: "Soglie salvate. Valgono dal prossimo controllo, ogni ora." });
    } catch (err) {
      setMessage({ ok: false, text: errorMessage(err) });
    } finally {
      setSaving(false);
    }
  };

  const field = (key: Exclude<keyof ThresholdsDraft, "autoCloseEnabled">, label: string, hint: string) => (
    <label style={{ display: "flex", flexDirection: "column", gap: 4, flex: "1 1 200px" }}>
      <span style={{ fontWeight: 600 }}>{label}</span>
      <input
        className="admin-input"
        inputMode="decimal"
        value={draft[key]}
        disabled={!draft.autoCloseEnabled}
        onChange={(e) => setDraft((prev) => ({ ...prev, [key]: e.target.value }))}
      />
      <span style={{ fontSize: 12, color: brand.grafite70 }}>{hint}</span>
    </label>
  );

  return (
    <YStack marginTop="$4">
      <AdminCard>
        <Text fontWeight="700">Chiusura automatica</Text>
        <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
          <input
            type="checkbox"
            checked={draft.autoCloseEnabled}
            onChange={(e) => setDraft((prev) => ({ ...prev, autoCloseEnabled: e.target.checked }))}
          />
          <span>Chiudi da sole le zone che superano le soglie (controllo ogni ora)</span>
        </label>
        <XStack gap="$3" flexWrap="wrap" marginTop="$3">
          {field("maxWeeklyPerPro", "Richieste a settimana per professionista", "Oltre questa media la zona si chiude.")}
          {field("minResponsePercent", "Risposte minime (%)", "Sotto questa percentuale la zona si chiude. 0 per non controllarle.")}
          {field("minMeasuredLeads", "Richieste per misurare le risposte", "Quante ne servono, arrivate da almeno 48 ore, prima di giudicare.")}
          {field("keepOpenDays", "Giorni aperta dopo una riapertura", "Per quanto il controllo non richiude una zona riaperta a mano.")}
        </XStack>
        <XStack gap="$2" marginTop="$3" alignItems="center" flexWrap="wrap">
          <Button variant="primary" size="$3" disabled={saving} onPress={() => void save()}>
            {saving ? "Salvataggio…" : "Salva le soglie"}
          </Button>
          <Button variant="secondary" size="$3" disabled={saving} onPress={() => setDraft(toDraft(DEFAULT_GENERAL_REQUEST_THRESHOLDS))}>
            Valori iniziali
          </Button>
          {message ? <Text color={message.ok ? brand.grafite70 : brand.urgenza}>{message.text}</Text> : null}
        </XStack>
      </AdminCard>
    </YStack>
  );
}
