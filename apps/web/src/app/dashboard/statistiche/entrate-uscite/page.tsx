"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CASHBOOK_VAT_RATES,
  EXPENSE_CATEGORIES,
  FORFETTARIO_COEFFICIENTS,
  FORFETTARIO_LIMIT_EUR_CENTS,
  cashbookTotals,
  formatEurCents,
  isIncome,
  type CashbookMovement,
  type CashbookOverview,
  type CashbookSettings,
  type ExpenseCategory,
} from "@professionisti/shared";
import { Button, Icon, Text, YStack, brand, type IconName } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { PageLoading } from "@/components/PageLoading";
import { ModalDialog } from "@/components/ModalDialog";
import { ItalianDateInput } from "@/components/ItalianDateInput";
import { PhotoPicker } from "@/components/PhotoPicker";
import { StatsTabs } from "@/components/stats/StatsTabs";
import { downloadTextFile } from "@/components/admin/adminUi";
import { withoutHiddenData } from "@/lib/photoSearch";

/**
 * Entrate e uscite del professionista (docs/changelog/2026-11-19-entrate-e-uscite.md,
 * richiesta di Luca del 19/11/2026 dopo la pubblicità di un Excel di MioDottore).
 *
 * Principio di cassa: ogni soldo conta nel giorno in cui si muove. Le
 * entrate del sito, la nostra trattenuta e l'abbonamento arrivano da soli
 * (stesso calcolo dell'estratto del mese); il professionista aggiunge le sue
 * spese con la foto dello scontrino e, se vuole, i lavori fuori dal sito.
 * È uno strumento per tenere i conti in ordine, non una consulenza fiscale.
 */

const MONTHS_SHORT = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];
const MONTHS_LONG = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];
const FIRST_YEAR = 2026;

const SOURCE_ICON: Record<CashbookMovement["source"], IconName> = {
  ONLINE: "credit-card",
  DIRECT: "coins",
  REFUND: "rotate-ccw",
  EXTERNAL: "briefcase",
  FEE: "receipt-text",
  PLATFORM_INVOICE: "receipt-text",
  EXPENSE: "tag",
};

function romeToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function eur(cents: number): string {
  return formatEurCents(cents);
}

/** "12", "12,50", "1.234,56", "12.5" → centesimi; null se non è un importo. */
function parseEuroInput(raw: string): number | null {
  const text = raw.replace(/[€\s]/g, "");
  if (!text) return null;
  const normalized = /,\d{1,2}$/.test(text) ? text.replace(/\./g, "").replace(",", ".") : text.replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  return Math.round(Number(normalized) * 100);
}

function dayLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d, 12));
  return new Intl.DateTimeFormat("it-IT", { weekday: "short", day: "numeric", month: "long", timeZone: "UTC" }).format(date);
}

type ExpenseDraft = { id: string | null; amount: string; spentOn: string; category: ExpenseCategory | null; description: string; receiptPhotoUrl: string | null };

export default function EntrateUscitePage() {
  const { user, token, isLoading } = useAuth();
  const today = romeToday();
  const currentYear = Number(today.slice(0, 4));
  const [year, setYear] = useState(currentYear);
  /** null = tutto l'anno. */
  const [month, setMonth] = useState<number | null>(Number(today.slice(5, 7)));
  const [data, setData] = useState<CashbookOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<ExpenseDraft | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [csvError, setCsvError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      setData(await apiClient.cashbook(token, year));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Non riusciamo a caricare i conti: riprova tra poco.");
    }
  }, [token, year]);

  useEffect(() => {
    if (!token || !user?.isProfessional) return;
    // Caricamento all'apertura e al cambio di anno.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [token, user, load]);

  const monthKey = month ? `${year}-${String(month).padStart(2, "0")}` : null;
  const shown = useMemo(() => (data ? data.movements.filter((m) => !monthKey || m.date.startsWith(monthKey)) : []), [data, monthKey]);
  const totals = useMemo(() => cashbookTotals(shown), [shown]);
  const byDay = useMemo(() => {
    const groups = new Map<string, CashbookMovement[]>();
    for (const m of [...shown].reverse()) groups.set(m.date, [...(groups.get(m.date) ?? []), m]);
    return [...groups.entries()];
  }, [shown]);

  async function downloadCsv() {
    if (!token) return;
    setCsvError(null);
    try {
      const file = await apiClient.cashbookYearCsv(token, year);
      downloadTextFile(file.fileName, file.csv);
    } catch (e) {
      setCsvError(e instanceof Error ? e.message : "Non riusciamo a preparare il file: riprova tra poco.");
    }
  }

  if (isLoading) return <PageLoading />;
  if (!user || !token) {
    return (
      <YStack width="100%" alignItems="center" paddingVertical="9" paddingHorizontal="4" gap="4">
        <Text render="h1" margin={0} fontFamily="heading" fontWeight="800" fontSize="7" color={brand.inchiostro} textAlign="center">
          Accedi come professionista
        </Text>
        <Link href="/accedi?redirect=/dashboard/statistiche/entrate-uscite" style={{ textDecoration: "none" }}>
          <Button tabIndex={-1} variant="primary">Accedi</Button>
        </Link>
      </YStack>
    );
  }
  if (!user.isProfessional) {
    return (
      <YStack width="100%" alignItems="center" paddingVertical="9" paddingHorizontal="4">
        <Text render="h1" margin={0} fontFamily="heading" fontWeight="800" fontSize="7" color={brand.inchiostro} textAlign="center">
          Questa sezione è per i professionisti
        </Text>
      </YStack>
    );
  }

  const periodLabel = month ? `${MONTHS_LONG[month - 1]} ${year}` : `tutto il ${year}`;
  const years = Array.from({ length: currentYear - FIRST_YEAR + 1 }, (_, i) => currentYear - i);
  const maxMonth = year === currentYear ? Number(today.slice(5, 7)) : 12;
  const vatShown = data?.regime === "VAT" ? shown.filter((m) => isIncome(m.source)).reduce((s, m) => s + (m.vatEurCents ?? 0), 0) : null;

  return (
    <YStack width="100%" alignItems="center" paddingVertical="8" paddingHorizontal="4">
      <YStack width="100%" maxWidth={1180} gap="5">
        <YStack gap="1">
          <Text render="h1" margin={0} fontFamily="heading" fontWeight="800" fontSize={30} color={brand.inchiostro}>
            Statistiche
          </Text>
          <Text fontSize={16} color={brand.grafite70}>
            I soldi entrati e usciti, nel giorno in cui si muovono. Pronti da dare al tuo commercialista.
          </Text>
        </YStack>
        <StatsTabs active="entrate-uscite" />

        <div className="cb-toolbar">
          <label className="cb-year">
            <span className="cb-sr">Anno</span>
            <select value={year} onChange={(e) => setYear(Number(e.target.value))} aria-label="Anno">
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
          <div className="cb-toolbar-actions">
            <Button variant="secondary" onPress={() => setSettingsOpen(true)} icon={<Icon name="sliders-horizontal" size={16} color={brand.grafite} />}>
              Impostazioni
            </Button>
            <Button variant="secondary" onPress={() => void downloadCsv()} icon={<Icon name="download" size={16} color={brand.grafite} />}>
              Foglio {year}
            </Button>
            <Button
              variant="primary"
              onPress={() => setDraft({ id: null, amount: "", spentOn: year === currentYear ? today : `${year}-12-31`, category: null, description: "", receiptPhotoUrl: null })}
              icon={<Icon name="plus" size={16} color="#ffffff" />}
            >
              Aggiungi spesa
            </Button>
          </div>
        </div>
        {csvError ? (
          <Text fontSize={15} color={brand.urgenza} role="alert">
            {csvError}
          </Text>
        ) : null}

        <div className="cb-months" role="group" aria-label="Mese">
          <button type="button" className={`cb-month${month === null ? " is-active" : ""}`} aria-pressed={month === null} onClick={() => setMonth(null)}>
            Tutto l&apos;anno
          </button>
          {MONTHS_SHORT.map((label, i) => (
            <button
              key={label}
              type="button"
              className={`cb-month${month === i + 1 ? " is-active" : ""}`}
              aria-pressed={month === i + 1}
              disabled={i + 1 > maxMonth}
              onClick={() => setMonth(i + 1)}
            >
              {label}
            </button>
          ))}
        </div>

        {error ? (
          <Text color={brand.urgenza} role="alert">
            {error}
          </Text>
        ) : null}

        {!data && !error ? <div className="cb-skeleton" aria-busy="true" aria-label="Caricamento dei conti" /> : null}

        {data ? (
          <>
            <ThresholdNotice level={data.threshold} income={data.totals.incomeEurCents} />

            <div className="cb-kpis" aria-live="polite">
              <div className="cb-kpi">
                <span className="cb-kpi-label">Entrate</span>
                <strong className="cb-kpi-value is-income">{eur(totals.incomeEurCents)}</strong>
                <span className="cb-kpi-note">{vatShown ? `Di cui IVA da versare ${eur(vatShown)}` : `Soldi arrivati, ${periodLabel}`}</span>
              </div>
              <div className="cb-kpi">
                <span className="cb-kpi-label">Uscite</span>
                <strong className="cb-kpi-value">{eur(totals.expensesEurCents)}</strong>
                <span className="cb-kpi-note">Spese, trattenute e abbonamento</span>
              </div>
              <div className="cb-kpi is-main">
                <span className="cb-kpi-label">Ti resta</span>
                <strong className="cb-kpi-value">{eur(totals.leftEurCents - (vatShown ?? 0))}</strong>
                <span className="cb-kpi-note">{vatShown ? "Entrate meno uscite e IVA" : "Entrate meno uscite"}, prima delle tasse</span>
              </div>
            </div>

            <div className="cb-grid">
              <section className="cb-card cb-list" aria-labelledby="cb-list-title">
                <div className="cb-card-head">
                  <h2 id="cb-list-title">Movimenti di {periodLabel}</h2>
                  <span>{shown.length === 1 ? "1 movimento" : `${shown.length} movimenti`}</span>
                </div>
                {byDay.length === 0 ? (
                  <div className="cb-empty">
                    <Icon name="receipt-text" size={28} color={brand.grafite70} />
                    <p>
                      Nessun movimento in {periodLabel}. I pagamenti dei lavori del sito arrivano qui da soli; le tue spese le aggiungi con &quot;Aggiungi
                      spesa&quot;.
                    </p>
                  </div>
                ) : (
                  <ol className="cb-days">
                    {byDay.map(([day, items]) => (
                      <li key={day}>
                        <h3 className="cb-day">{dayLabel(day)}</h3>
                        <ul className="cb-rows">
                          {items.map((m, i) => (
                            <MovementRow
                              key={`${day}-${i}`}
                              movement={m}
                              onEdit={
                                m.expenseId
                                  ? () =>
                                      setDraft({
                                        id: m.expenseId!,
                                        amount: (-m.amountEurCents / 100).toFixed(2).replace(".", ","),
                                        spentOn: m.date,
                                        category: m.category ?? "OTHER",
                                        description: m.detail,
                                        receiptPhotoUrl: m.receiptPhotoUrl ?? null,
                                      })
                                  : undefined
                              }
                            />
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ol>
                )}
              </section>

              <aside className="cb-side">
                <ToCollectCard data={data} />
                <TaxCard data={data} onOpenSettings={() => setSettingsOpen(true)} />
                <MonthTable data={data} />
                {data.externalWithoutPrice > 0 && data.settings.includeExternalJobs ? (
                  <p className="cb-hint">
                    {data.externalWithoutPrice === 1 ? "Un lavoro fuori dal sito segnato completato non ha il prezzo" : `${data.externalWithoutPrice} lavori fuori dal sito segnati completati non hanno il prezzo`}: non
                    è contato. Aggiungilo in <Link href="/dashboard/agenda">Agenda</Link>.
                  </p>
                ) : null}
              </aside>
            </div>

            <p className="cb-footnote">
              Le entrate del sito, la nostra trattenuta e l&apos;abbonamento sono gli stessi dell&apos;estratto del mese. È uno strumento per tenere i conti in
              ordine: per tasse e dichiarazioni decide il tuo commercialista.
            </p>
          </>
        ) : null}
      </YStack>

      {draft ? (
        <ExpenseModal
          token={token}
          draft={draft}
          today={today}
          onClose={() => setDraft(null)}
          onSaved={(spentOn) => {
            setDraft(null);
            const savedYear = Number(spentOn.slice(0, 4));
            if (savedYear !== year) setYear(savedYear);
            else void load();
            setMonth(Number(spentOn.slice(5, 7)));
          }}
        />
      ) : null}
      {settingsOpen && data ? (
        <SettingsModal
          token={token}
          data={data}
          onClose={() => setSettingsOpen(false)}
          onSaved={() => {
            setSettingsOpen(false);
            void load();
          }}
        />
      ) : null}
    </YStack>
  );
}

function MovementRow({ movement: m, onEdit }: { movement: CashbookMovement; onEdit?: () => void }) {
  const income = isIncome(m.source);
  const amount = `${m.amountEurCents > 0 ? "+" : m.amountEurCents < 0 ? "−" : ""}${eur(Math.abs(m.amountEurCents))}`;
  const body = (
    <>
      <span className={`cb-row-icon${income ? " is-income" : ""}`} aria-hidden="true">
        <Icon name={SOURCE_ICON[m.source]} size={18} color={income ? brand.verificato : brand.grafite70} />
      </span>
      <span className="cb-row-text">
        <span className="cb-row-label">{m.label}</span>
        {m.detail ? <span className="cb-row-detail">{m.detail}</span> : null}
      </span>
      {m.receiptPhotoUrl ? (
        // Miniatura dello scontrino: già su Cloudinary, piccola.
        // eslint-disable-next-line @next/next/no-img-element
        <img className="cb-row-receipt" src={m.receiptPhotoUrl} alt="" width={36} height={36} />
      ) : null}
      <span className={`cb-row-amount${m.amountEurCents > 0 ? " is-income" : ""}`}>{amount}</span>
    </>
  );
  return (
    <li>
      {onEdit ? (
        <button type="button" className="cb-row is-editable" onClick={onEdit} aria-label={`${m.label}, ${amount}: modifica la spesa`}>
          {body}
          <Icon name="pencil" size={15} color={brand.grafite70} />
        </button>
      ) : (
        <div className="cb-row">{body}</div>
      )}
    </li>
  );
}

function ThresholdNotice({ level, income }: { level: CashbookOverview["threshold"]; income: number }) {
  if (!level) return null;
  const text =
    level === "near"
      ? `Quest'anno hai già incassato ${eur(income)}: il forfettario vale fino a ${eur(FORFETTARIO_LIMIT_EUR_CENTS)}. Parlane con il tuo commercialista per tempo.`
      : level === "over"
        ? `Quest'anno hai incassato ${eur(income)}, più di ${eur(FORFETTARIO_LIMIT_EUR_CENTS)}: dall'anno prossimo il forfettario non vale più. Senti subito il tuo commercialista.`
        : `Quest'anno hai incassato ${eur(income)}, più di 100.000 €: si esce dal forfettario già quest'anno. Senti subito il tuo commercialista.`;
  return (
    <div className={`cb-notice${level === "near" ? "" : " is-urgent"}`} role="status">
      <Icon name="triangle-alert" size={18} color={level === "near" ? brand.ottoneScuro : brand.urgenza} />
      <span>{text}</span>
    </div>
  );
}

function ToCollectCard({ data }: { data: CashbookOverview }) {
  if (data.toCollect.length === 0) return null;
  const total = data.toCollect.reduce((s, t) => s + t.amountEurCents, 0);
  return (
    <section className="cb-card" aria-labelledby="cb-collect-title">
      <div className="cb-card-head">
        <h2 id="cb-collect-title">Da incassare</h2>
        <strong>{eur(total)}</strong>
      </div>
      <p className="cb-card-text">Lavori terminati che non sono ancora stati pagati del tutto. Entrano nelle entrate quando arrivano i soldi.</p>
      <ul className="cb-collect">
        {data.toCollect.slice(0, 6).map((t) => (
          <li key={t.bookingId}>
            <Link href={t.requestId ? `/dashboard/richieste?open=${encodeURIComponent(t.requestId)}` : "/dashboard/richieste"}>
              <span>
                {t.job}
                {t.client ? `, ${t.client}` : ""}
              </span>
              <strong>{eur(t.amountEurCents)}</strong>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function TaxCard({ data, onOpenSettings }: { data: CashbookOverview; onOpenSettings: () => void }) {
  if (data.regime !== "FORFETTARIO") {
    if (data.regime !== "VAT") return null;
    return (
      <section className="cb-card">
        <div className="cb-card-head">
          <h2>IVA delle entrate {data.year}</h2>
          <strong>{eur(data.incomeVatEurCents ?? 0)}</strong>
        </div>
        <p className="cb-card-text">
          Calcolata al {data.settings.vatRatePercent}% sui prezzi IVA inclusa. Non è un guadagno: va versata. Le tasse sul reddito le calcola il tuo commercialista.
        </p>
      </section>
    );
  }
  if (!data.taxEstimate) {
    return (
      <section className="cb-card">
        <div className="cb-card-head">
          <h2>Quanto mettere da parte</h2>
        </div>
        <p className="cb-card-text">Con il forfettario possiamo stimare l&apos;imposta dell&apos;anno sui soldi incassati. Ti servono due dati che ti dà il commercialista.</p>
        <Button variant="secondary" onPress={onOpenSettings}>
          Attiva la stima
        </Button>
      </section>
    );
  }
  const t = data.taxEstimate;
  return (
    <section className="cb-card">
      <div className="cb-card-head">
        <h2>Imposta stimata {data.year}</h2>
        <strong>{eur(t.taxEurCents)}</strong>
      </div>
      <p className="cb-card-text">
        Da mettere da parte. Stima, da confermare con il tuo commercialista: incassato × {t.coefficientPercent}%
        {t.socialSecurityPaidEurCents > 0 ? ` meno i contributi INPS segnati (${eur(t.socialSecurityPaidEurCents)})` : ""}, al {t.ratePercent}%.
      </p>
      <details className="cb-more">
        <summary>Scopri di più</summary>
        <p>
          Nel forfettario le spese non abbassano le tasse: le conta già il coefficiente. Contano solo i contributi INPS pagati, che puoi segnare come spesa
          &quot;Contributi INPS&quot;. I contributi INPS da pagare non sono in questa stima.
        </p>
      </details>
    </section>
  );
}

function MonthTable({ data }: { data: CashbookOverview }) {
  return (
    <section className="cb-card">
      <details className="cb-more">
        <summary>Mese per mese, {data.year}</summary>
        <div className="cb-table-scroll">
          <table className="cb-table">
            <thead>
              <tr>
                <th scope="col">Mese</th>
                <th scope="col">Entrate</th>
                <th scope="col">Uscite</th>
                <th scope="col">Ti resta</th>
              </tr>
            </thead>
            <tbody>
              {data.months.map((m) => (
                <tr key={m.month}>
                  <th scope="row">{m.label}</th>
                  <td>{eur(m.incomeEurCents)}</td>
                  <td>{eur(m.expensesEurCents)}</td>
                  <td>{eur(m.leftEurCents)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">Totale</th>
                <td>{eur(data.totals.incomeEurCents)}</td>
                <td>{eur(data.totals.expensesEurCents)}</td>
                <td>{eur(data.totals.leftEurCents)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </details>
    </section>
  );
}

function ExpenseModal({ token, draft, today, onClose, onSaved }: { token: string; draft: ExpenseDraft; today: string; onClose: () => void; onSaved: (spentOn: string) => void }) {
  const [form, setForm] = useState(draft);
  const [busy, setBusy] = useState<null | "save" | "delete" | "photo">(null);
  const [error, setError] = useState<string | null>(null);

  async function addPhoto(file: File) {
    setBusy("photo");
    setError(null);
    try {
      const clean = await withoutHiddenData(file);
      const { imageUrl } = await apiClient.uploadReceiptPhoto(token, clean);
      setForm((f) => ({ ...f, receiptPhotoUrl: imageUrl }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Foto non caricata: riprova.");
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    const amountEurCents = parseEuroInput(form.amount);
    if (amountEurCents === null || amountEurCents <= 0) return setError("Scrivi l'importo, per esempio 25,90.");
    if (!form.category) return setError("Scegli il tipo di spesa.");
    if (!form.spentOn) return setError("Scegli la data.");
    setBusy("save");
    setError(null);
    const input = { spentOn: form.spentOn, amountEurCents, category: form.category, description: form.description.trim() || null, receiptPhotoUrl: form.receiptPhotoUrl };
    try {
      if (form.id) await apiClient.updateExpense(token, form.id, input);
      else await apiClient.createExpense(token, input);
      onSaved(form.spentOn);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Spesa non salvata: riprova.");
      setBusy(null);
    }
  }

  async function remove() {
    if (!form.id) return;
    setBusy("delete");
    setError(null);
    try {
      await apiClient.deleteExpense(token, form.id);
      onSaved(form.spentOn);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Spesa non eliminata: riprova.");
      setBusy(null);
    }
  }

  return (
    <ModalDialog label={form.id ? "Modifica la spesa" : "Aggiungi una spesa"} onClose={onClose} maxWidth={520}>
      <div className="cb-modal">
        <div className="cb-modal-head">
          <h2>{form.id ? "Modifica la spesa" : "Aggiungi una spesa"}</h2>
          <button type="button" className="cb-close" onClick={onClose} aria-label="Chiudi">
            <Icon name="x" size={20} color={brand.grafite} />
          </button>
        </div>
        <div className="cb-field-row">
          <label className="cb-field">
            <span>Importo</span>
            <span className="cb-euro">
              <input inputMode="decimal" autoComplete="off" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0,00" aria-label="Importo in euro" />
              <span aria-hidden="true">€</span>
            </span>
          </label>
          <label className="cb-field">
            <span>Data</span>
            <ItalianDateInput ariaLabel="Data della spesa" value={form.spentOn} max={today} onChange={(v) => setForm({ ...form, spentOn: v })} />
          </label>
        </div>
        <fieldset className="cb-field">
          <legend>Tipo</legend>
          <div className="cb-cats">
            {EXPENSE_CATEGORIES.map((c) => (
              <button
                key={c.key}
                type="button"
                className={`cb-cat${form.category === c.key ? " is-active" : ""}`}
                aria-pressed={form.category === c.key}
                onClick={() => setForm({ ...form, category: c.key })}
                title={c.example}
              >
                {c.label}
              </button>
            ))}
          </div>
          {form.category ? <span className="cb-cat-example">Per esempio: {EXPENSE_CATEGORIES.find((c) => c.key === form.category)?.example}</span> : null}
        </fieldset>
        <label className="cb-field">
          <span>Descrizione (facoltativa)</span>
          <input value={form.description} maxLength={120} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Es. raccordi per il bagno di via Roma" />
        </label>
        <div className="cb-field">
          <span>Foto dello scontrino (facoltativa)</span>
          {form.receiptPhotoUrl ? (
            <div className="cb-receipt">
              <a href={form.receiptPhotoUrl} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={form.receiptPhotoUrl} alt="Scontrino caricato" width={72} height={72} />
              </a>
              <button type="button" className="cb-link" onClick={() => setForm({ ...form, receiptPhotoUrl: null })}>
                Togli la foto
              </button>
            </div>
          ) : (
            <PhotoPicker accept="image/*" disabled={busy === "photo"} onFile={(file) => void addPhoto(file)} className="cb-photo-btn" label="Aggiungi la foto dello scontrino">
              <Icon name="camera" size={18} color={brand.grafite} />
              {busy === "photo" ? "Caricamento…" : "Aggiungi la foto"}
            </PhotoPicker>
          )}
          <span className="cb-field-help">È un aiuto per ritrovarlo: lo scontrino originale va comunque conservato.</span>
        </div>
        {error ? (
          <p className="cb-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="cb-modal-actions">
          {form.id ? (
            <button type="button" className="cb-link is-danger" onClick={() => void remove()} disabled={busy !== null}>
              {busy === "delete" ? "Eliminazione…" : "Elimina la spesa"}
            </button>
          ) : (
            <span />
          )}
          <div className="cb-modal-buttons">
            <Button variant="secondary" onPress={onClose} disabled={busy !== null}>
              Annulla
            </Button>
            <Button variant="primary" onPress={() => void save()} disabled={busy !== null}>
              {busy === "save" ? "Salvataggio…" : "Salva"}
            </Button>
          </div>
        </div>
      </div>
    </ModalDialog>
  );
}

function SettingsModal({ token, data, onClose, onSaved }: { token: string; data: CashbookOverview; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<CashbookSettings>(data.settings);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await apiClient.updateCashbookSettings(token, form);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Impostazioni non salvate: riprova.");
      setBusy(false);
    }
  }

  return (
    <ModalDialog label="Impostazioni di Entrate e uscite" onClose={onClose} maxWidth={560}>
      <div className="cb-modal">
        <div className="cb-modal-head">
          <h2>Impostazioni</h2>
          <button type="button" className="cb-close" onClick={onClose} aria-label="Chiudi">
            <Icon name="x" size={20} color={brand.grafite} />
          </button>
        </div>

        <label className="cb-switch">
          <input type="checkbox" checked={form.includeExternalJobs} onChange={(e) => setForm({ ...form, includeExternalJobs: e.target.checked })} />
          <span>
            <strong>Conta i lavori fuori dal sito</strong>
            <span>I lavori che segni in Agenda come completati, con il prezzo, entrano nelle entrate nel giorno del lavoro.</span>
          </span>
        </label>

        {data.regime === "FORFETTARIO" ? (
          <fieldset className="cb-field">
            <legend>Stima dell&apos;imposta del forfettario</legend>
            <label className="cb-switch">
              <input
                type="checkbox"
                checked={form.taxEstimate !== null}
                onChange={(e) => setForm({ ...form, taxEstimate: e.target.checked ? { coefficient: "COSTRUZIONI", ratePercent: 15 } : null })}
              />
              <span>
                <strong>Mostra quanto mettere da parte</strong>
                <span>Una stima, da confermare con il tuo commercialista.</span>
              </span>
            </label>
            {form.taxEstimate ? (
              <>
                <label className="cb-field">
                  <span>Il tuo lavoro (coefficiente)</span>
                  <select
                    value={form.taxEstimate.coefficient}
                    onChange={(e) => setForm({ ...form, taxEstimate: { ...form.taxEstimate!, coefficient: e.target.value as typeof FORFETTARIO_COEFFICIENTS[number]["key"] } })}
                  >
                    {FORFETTARIO_COEFFICIENTS.map((c) => (
                      <option key={c.key} value={c.key}>
                        {c.label}: {c.percent}% ({c.hint})
                      </option>
                    ))}
                  </select>
                </label>
                <div className="cb-field">
                  <span>Aliquota</span>
                  <div className="cb-cats">
                    {([5, 15] as const).map((rate) => (
                      <button
                        key={rate}
                        type="button"
                        className={`cb-cat${form.taxEstimate?.ratePercent === rate ? " is-active" : ""}`}
                        aria-pressed={form.taxEstimate?.ratePercent === rate}
                        onClick={() => setForm({ ...form, taxEstimate: { ...form.taxEstimate!, ratePercent: rate } })}
                      >
                        {rate === 5 ? "5% (primi cinque anni)" : "15%"}
                      </button>
                    ))}
                  </div>
                  <span className="cb-field-help">Il 5% vale i primi cinque anni di attività, se hai i requisiti: te lo dice il commercialista.</span>
                </div>
              </>
            ) : null}
          </fieldset>
        ) : null}

        {data.regime === "VAT" ? (
          <div className="cb-field">
            <span>Aliquota IVA che usi di solito</span>
            <div className="cb-cats">
              {CASHBOOK_VAT_RATES.map((rate) => (
                <button key={rate} type="button" className={`cb-cat${form.vatRatePercent === rate ? " is-active" : ""}`} aria-pressed={form.vatRatePercent === rate} onClick={() => setForm({ ...form, vatRatePercent: rate })}>
                  {rate}%
                </button>
              ))}
            </div>
            <span className="cb-field-help">Serve a separare l&apos;IVA dalle entrate.</span>
          </div>
        ) : null}

        {data.regime === "OTHER" ? (
          <p className="cb-field-help">
            Per la stima dell&apos;imposta completa i <Link href="/dashboard/fiscale">Dati fiscali</Link>: ci serve sapere se sei nel forfettario.
          </p>
        ) : null}

        {error ? (
          <p className="cb-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="cb-modal-actions">
          <span />
          <div className="cb-modal-buttons">
            <Button variant="secondary" onPress={onClose} disabled={busy}>
              Annulla
            </Button>
            <Button variant="primary" onPress={() => void save()} disabled={busy}>
              {busy ? "Salvataggio…" : "Salva"}
            </Button>
          </div>
        </div>
      </div>
    </ModalDialog>
  );
}
