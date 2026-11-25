"use client";

import { useEffect, useState } from "react";
import {
  ESTIMATED_MONTHLY_COSTS,
  MONTHLY_COST_LINES_MAX,
  formatEurCents,
  monthLabelIt,
  subscriptionTierInfo,
  type AdminMonthlyAccounts,
  type MonthlyCostLine,
} from "@professionisti/shared";
import { Button, Text, XStack, YStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { AdminCard, AdminPageHeader, ShowNumbers, TechNote, errorMessage } from "@/components/admin/adminUi";
import { SkeletonTableRows } from "@/components/Skeleton";

/**
 * Numeri → Conti del mese (decisione di Luca del 25/11/2026,
 * docs/changelog/2026-11-25-conti-del-mese.md): abbonati paganti, prezzo
 * medio, quanti restano dopo i mesi gratis e utile stimato, presi dal
 * database, con il traguardo di utile all'anno (di partenza 12.000 €, dall'analisi
 * analisi/punto-di-pareggio-12000-versione-profonda.md; si cambia qui). In alto pochi numeri
 * grandi, i dettagli sotto "Vedi i numeri".
 */

type DraftLine = { label: string; euros: string };

function toDraft(lines: MonthlyCostLine[]): DraftLine[] {
  return lines.map((line) => ({ label: line.label, euros: (line.monthlyEurCents / 100).toFixed(2).replace(".", ",") }));
}

/** "1.234,50" o "1234.5" → centesimi; null se non è un numero valido. */
function parseEuros(value: string): number | null {
  const clean = value.trim().replace(/\./g, "").replace(",", ".");
  if (clean === "") return 0;
  const number = Number(clean);
  return Number.isFinite(number) && number >= 0 ? Math.round(number * 100) : null;
}

function percent(part: number, total: number): string {
  return total > 0 ? `${Math.round((part / total) * 100)}%` : "—";
}

export default function AdminContiDelMesePage() {
  const { token } = useAuth();
  const [month, setMonth] = useState<string | undefined>(undefined);
  const [data, setData] = useState<AdminMonthlyAccounts | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  // "Costi salvati." sopravvive al ricaricamento dei conti, che rifà l'elenco.
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!token) return;
    apiClient
      .adminMonthlyAccounts(token, month)
      .then((result) => {
        setData(result);
        setError(null);
      })
      .catch((err) => setError(errorMessage(err)));
  }, [token, month, reload]);

  return (
    <YStack gap="5">
      <AdminPageHeader
        title="Conti del mese"
        description="Quanto entra e quanto esce. E quanti abbonati servono per il traguardo."
        right={
          data ? (
            <select
              className="admin-input"
              aria-label="Mese"
              value={data.month}
              onChange={(e) => {
                setData(null);
                setSaved(false);
                setMonth(e.target.value);
              }}
            >
              {data.months.map((m) => (
                <option key={m} value={m}>
                  {monthLabelIt(m)}
                </option>
              ))}
            </select>
          ) : null
        }
      />
      {error ? <Text color={brand.urgenza}>{error}</Text> : null}
      {!data && !error ? <SkeletonTableRows rows={4} cols={3} /> : null}
      {data ? (
        <Accounts
          data={data}
          token={token}
          saved={saved}
          onSaved={() => {
            setSaved(true);
            setReload((n) => n + 1);
          }}
          onTargetSaved={() => setReload((n) => n + 1)}
        />
      ) : null}
    </YStack>
  );
}

function Accounts({
  data,
  token,
  saved,
  onSaved,
  onTargetSaved,
}: {
  data: AdminMonthlyAccounts;
  token: string | null;
  saved: boolean;
  onSaved: () => void;
  onTargetSaved: () => void;
}) {
  const { today, revenue, variableCosts, fixedCosts, target } = data;
  const needed = target.payingNeeded;
  const reached = needed !== null && today.paying >= needed;
  const yearProfit = data.profitEurCents * 12;

  return (
    <>
      {!data.launched ? (
        <Text fontSize={14} color={brand.grafite70}>
          Il sito non è ancora lanciato: i numeri comprendono le prove. Gli account di prova non contano mai.
        </Text>
      ) : null}

      <div className="admin-kpi-grid">
        <div className="admin-kpi">
          <span className="admin-kpi-value">{today.paying}</span>
          <span className="admin-kpi-label">Abbonati che pagano oggi</span>
        </div>
        <div className="admin-kpi">
          <span className="admin-kpi-value">{today.paying > 0 ? formatEurCents(today.averagePriceEurCents) : "—"}</span>
          <span className="admin-kpi-label">Prezzo medio al mese, IVA esclusa</span>
        </div>
        <div className="admin-kpi">
          <span className="admin-kpi-value">{percent(today.stayedAfterFreeMonths, today.freeMonthsEnded)}</span>
          <span className="admin-kpi-label">
            {today.freeMonthsEnded > 0
              ? `Restano dopo i mesi gratis · ${today.stayedAfterFreeMonths} su ${today.freeMonthsEnded}`
              : "Restano dopo i mesi gratis · ancora nessuno li ha finiti"}
          </span>
        </div>
        <div className={`admin-kpi${data.profitEurCents < 0 ? " is-urgent" : ""}`}>
          <span className="admin-kpi-value">{formatEurCents(data.profitEurCents)}</span>
          <span className="admin-kpi-label">Utile stimato di {monthLabelIt(data.month)}, prima delle tasse</span>
        </div>
      </div>

      <AdminCard>
        <YStack gap="2">
          <Text fontFamily="heading" fontWeight="700" fontSize="5" color={brand.grafite}>
            Traguardo: {formatEurCents(target.yearEurCents)} di utile all&apos;anno
          </Text>
          <TargetEditor key={target.yearEurCents} yearEurCents={target.yearEurCents} token={token} onSaved={onTargetSaved} />
          {needed === null ? (
            <Text color={brand.grafite70}>
              Questo mese ogni abbonato costa più di quanto porta. Il traguardo non si può calcolare.
            </Text>
          ) : (
            <>
              <ul className="admin-bars">
                <li>
                  <div className="admin-bars-head">
                    <span className="admin-bars-label">Abbonati che pagano</span>
                    <span className="admin-bars-value">
                      <strong>{today.paying}</strong> su {needed}
                    </span>
                  </div>
                  <div className="admin-bars-track" aria-hidden="true">
                    <div className="admin-bars-fill" style={{ width: `${Math.min(100, (today.paying / needed) * 100)}%` }} />
                  </div>
                </li>
              </ul>
              <Text color={brand.grafite70}>
                {reached
                  ? "Ci sei: con questi abbonati, tenuti tutto l'anno, l'utile arriva al traguardo."
                  : `Ne servono ${needed}, tenuti tutto l'anno: ne mancano ${needed - today.paying}.`}
              </Text>
              <Text fontSize={14} color={brand.grafite70}>
                {`Ogni abbonato lascia circa ${formatEurCents(target.marginPerPayingEurCents)} al mese${target.marginEstimated ? " (stima, finché il mese non ha abbonati e ricavi veri)" : ""}, e i costi fissi sono ${formatEurCents(fixedCosts.totalEurCents)} al mese.`}
              </Text>
            </>
          )}
          <Text fontSize={14} color={brand.grafite70}>
            Se tutto l&apos;anno andasse come {monthLabelIt(data.month)}: {formatEurCents(yearProfit)} di utile prima delle tasse.
          </Text>
        </YStack>
      </AdminCard>

      <ShowNumbers>
        <YStack gap="4">
          <div className="admin-table-wrap">
            <table className="admin-table admin-table-numbers">
              <caption className="sr-only">Abbonati oggi</caption>
              <thead>
                <tr>
                  <th>Oggi</th>
                  <th>Quanti</th>
                </tr>
              </thead>
              <tbody>
                {today.byTier.map((row) => (
                  <tr key={row.tier}>
                    <td>{subscriptionTierInfo(row.tier).label}</td>
                    <td>{row.count}</td>
                  </tr>
                ))}
                <tr>
                  <td>Nei mesi gratis, con la carta</td>
                  <td>{today.inFreeMonths}</td>
                </tr>
                <tr>
                  <td>Abbonamenti chiusi in {monthLabelIt(data.month)}</td>
                  <td>{data.canceledInMonth}</td>
                </tr>
                <tr className="admin-table-total">
                  <td>Entrate degli abbonamenti al mese</td>
                  <td>{formatEurCents(today.monthlyRecurringEurCents)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="admin-table-wrap">
            <table className="admin-table admin-table-numbers">
              <caption className="sr-only">Conto di {monthLabelIt(data.month)}</caption>
              <thead>
                <tr>
                  <th>{monthLabelIt(data.month)}, IVA esclusa</th>
                  <th>Euro</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Abbonamenti e passaggi di livello</td>
                  <td>{formatEurCents(revenue.subscriptionsEurCents)}</td>
                </tr>
                <tr>
                  <td>Pacchetti di visibilità</td>
                  <td>{formatEurCents(revenue.visibilityEurCents)}</td>
                </tr>
                <tr>
                  <td>Trattenute sui lavori pagati online</td>
                  <td>{formatEurCents(revenue.jobFeesEurCents)}</td>
                </tr>
                <tr className="admin-table-total">
                  <td>Entrate</td>
                  <td>{formatEurCents(revenue.totalEurCents)}</td>
                </tr>
                <tr>
                  <td>Carta dei pagamenti online</td>
                  <td>− {formatEurCents(variableCosts.jobCardEurCents)}</td>
                </tr>
                <tr>
                  <td>Conti dei professionisti e bonifici (stima)</td>
                  <td>− {formatEurCents(variableCosts.connectEurCents)}</td>
                </tr>
                <tr>
                  <td>Carta degli abbonamenti (stima)</td>
                  <td>− {formatEurCents(variableCosts.subscriptionStripeEurCents)}</td>
                </tr>
                <tr>
                  <td>Fatture elettroniche (stima)</td>
                  <td>− {formatEurCents(variableCosts.invoicesEurCents)}</td>
                </tr>
                <tr>
                  <td>Messaggi WhatsApp</td>
                  <td>− {formatEurCents(variableCosts.whatsappEurCents)}</td>
                </tr>
                <tr>
                  <td>Costi fissi</td>
                  <td>− {formatEurCents(fixedCosts.totalEurCents)}</td>
                </tr>
                <tr className="admin-table-total">
                  <td>Utile stimato, prima delle tasse</td>
                  <td>{formatEurCents(data.profitEurCents)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <Text fontSize={14} color={brand.grafite70}>
            Le stime usano i prezzi della carta e delle fatture. Le cifre esatte sono nel controllo dei conti del mese. Mancano le tasse e il tempo di Luca.
          </Text>
          <TechNote>
            Stime in apps/api/src/admin/monthly-accounts.ts: Stripe 1,5% + 0,25 € e Billing 0,7% sugli abbonamenti, Connect 2 € al mese per professionista pagato e 0,25% + 0,10 € a bonifico, 0,15 € a fattura. Chiusi = stato CANCELED con canceledAt nel mese (per i chiusi prima del 25/11 vale l'ultima modifica). Traguardo in platform_accounts_settings, di partenza 12.000 €.
          </TechNote>
        </YStack>
      </ShowNumbers>

      <CostsEditor key={fixedCosts.lines.map((l) => `${l.label}:${l.monthlyEurCents}`).join("|")} lines={fixedCosts.lines} token={token} saved={saved} onSaved={onSaved} />
    </>
  );
}

/** "Cambia il traguardo": euro all'anno, interi, salvati per tutti gli admin. */
function TargetEditor({ yearEurCents, token, onSaved }: { yearEurCents: number; token: string | null; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [euros, setEuros] = useState(String(Math.round(yearEurCents / 100)));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cents = parseEuros(euros);
  const valid = cents !== null && cents >= 100_000 && cents <= 1_000_000_000;

  if (!open) {
    return (
      <XStack>
        <button type="button" className="admin-link-button" onClick={() => setOpen(true)}>
          Cambia il traguardo
        </button>
      </XStack>
    );
  }

  const save = async () => {
    if (!token || !valid || cents === null) return;
    setSaving(true);
    setError(null);
    try {
      await apiClient.adminSaveProfitTarget(token, cents);
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  };

  return (
    <XStack gap="2" flexWrap="wrap" alignItems="center">
      <label htmlFor="traguardo-utile">
        <Text fontSize={14} color={brand.grafite}>
          Utile all&apos;anno, in euro
        </Text>
      </label>
      <input
        id="traguardo-utile"
        className="admin-input"
        style={{ width: 130 }}
        inputMode="numeric"
        value={euros}
        aria-invalid={!valid}
        onChange={(e) => {
          setError(null);
          setEuros(e.target.value);
        }}
      />
      <Button variant="primary" size="3" disabled={!valid || saving} onPress={save}>
        {saving ? "Salvo…" : "Salva il traguardo"}
      </Button>
      <Button variant="ghost" size="3" onPress={() => setOpen(false)}>
        Annulla
      </Button>
      {!valid ? <Text fontSize={14} color={brand.urgenza}>Scrivi una cifra da 1.000 € in su.</Text> : null}
      {error ? (
        <Text fontSize={14} color={brand.urgenza} role="status">
          {error}
        </Text>
      ) : null}
    </XStack>
  );
}

function CostsEditor({ lines, token, saved, onSaved }: { lines: MonthlyCostLine[]; token: string | null; saved: boolean; onSaved: () => void }) {
  const [draft, setDraft] = useState<DraftLine[]>(() => toDraft(lines));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(saved ? { text: "Costi salvati.", ok: true } : null);

  const parsed = draft.map((line) => ({ label: line.label.trim(), cents: parseEuros(line.euros) }));
  const invalid = parsed.some((line) => !line.label || line.cents === null);
  const total = parsed.reduce((sum, line) => sum + (line.cents ?? 0), 0);
  const changed = JSON.stringify(toDraft(lines)) !== JSON.stringify(draft);

  const update = (index: number, patch: Partial<DraftLine>) => {
    setMessage(null);
    setDraft((current) => current.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  };

  const save = async () => {
    if (!token || invalid) return;
    setSaving(true);
    setMessage(null);
    try {
      await apiClient.adminSaveMonthlyCosts(
        token,
        parsed.map((line) => ({ label: line.label, monthlyEurCents: line.cents ?? 0 })),
      );
      onSaved();
    } catch (err) {
      setMessage({ text: errorMessage(err), ok: false });
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminCard>
      <YStack gap="3">
        <YStack gap="1">
          <Text fontFamily="heading" fontWeight="700" fontSize="5" color={brand.grafite}>
            Costi fissi al mese
          </Text>
          <Text fontSize={14} color={brand.grafite70}>
            Le spese che ci sono anche senza lavori, IVA esclusa. Le spese annuali dividile per 12.
          </Text>
        </YStack>

        {draft.length === 0 ? (
          <YStack gap="2" alignItems="flex-start">
            <Text color={brand.grafite70}>Nessuna voce ancora. Puoi partire dalla stima del 25/11 e correggerla con le fatture vere.</Text>
            <Button variant="secondary" size="3" onPress={() => setDraft(toDraft(ESTIMATED_MONTHLY_COSTS))}>
              Parti dalla stima
            </Button>
          </YStack>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <caption className="sr-only">Costi fissi al mese</caption>
              <thead>
                <tr>
                  <th>Voce</th>
                  <th>Euro al mese</th>
                  <th>
                    <span className="sr-only">Togli</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {draft.map((line, index) => (
                  <tr key={index}>
                    <td>
                      <input
                        className="admin-input"
                        style={{ width: "100%", minWidth: 180 }}
                        value={line.label}
                        maxLength={80}
                        aria-label={`Nome della voce ${index + 1}`}
                        aria-invalid={!line.label.trim()}
                        onChange={(e) => update(index, { label: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        className="admin-input"
                        style={{ width: 110 }}
                        inputMode="decimal"
                        value={line.euros}
                        aria-label={`Euro al mese della voce ${index + 1}`}
                        aria-invalid={parseEuros(line.euros) === null}
                        onChange={(e) => update(index, { euros: e.target.value })}
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="admin-link-button"
                        aria-label={`Togli ${line.label || "la voce"}`}
                        onClick={() => {
                          setMessage(null);
                          setDraft((current) => current.filter((_, i) => i !== index));
                        }}
                      >
                        Togli
                      </button>
                    </td>
                  </tr>
                ))}
                <tr className="admin-table-total">
                  <td>Totale al mese · {formatEurCents(total * 12)} all&apos;anno</td>
                  <td>{formatEurCents(total)}</td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        )}

        <XStack gap="2" flexWrap="wrap" alignItems="center">
          {draft.length < MONTHLY_COST_LINES_MAX ? (
            <Button variant="ghost" size="3" onPress={() => setDraft((current) => [...current, { label: "", euros: "" }])}>
              Aggiungi una voce
            </Button>
          ) : null}
          <Button variant="primary" size="3" disabled={!changed || invalid || saving} onPress={save}>
            {saving ? "Salvo…" : "Salva i costi"}
          </Button>
          {invalid ? <Text fontSize={14} color={brand.urgenza}>Ogni voce vuole un nome e una cifra.</Text> : null}
          {message ? (
            <Text fontSize={14} color={message.ok ? brand.verificato : brand.urgenza} role="status">
              {message.text}
            </Text>
          ) : null}
        </XStack>
      </YStack>
    </AdminCard>
  );
}
