"use client";

import { useMemo, useState } from "react";
import { Check, Plus, X } from "lucide-react";
import { agendaWeekTemplateSchema, type AgendaWeekTemplate, type WeekTemplateSlot } from "@professionisti/shared";
import { WEEKDAY_FULL_LABELS } from "@/app/dashboard/agenda/_components/agendaHelpers";
import { ItalianTimeInput } from "@/components/ItalianTimeInput";

/** Lunedì per primo, come in tutto il calendario. */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
const WEEKDAY_SHORT = WEEKDAY_FULL_LABELS.map((label) => label.slice(0, 3));
const MAX_RANGES = 4;

type Range = { start: string; end: string };
type Mode = { allowsHome: boolean; allowsOnline: boolean; perSlot: number };

const PRESETS: { id: string; label: string; ranges: Range[] }[] = [
  { id: "split", label: "Mattina e pomeriggio", ranges: [{ start: "08:00", end: "13:00" }, { start: "14:00", end: "20:00" }] },
  { id: "continuous", label: "Orario continuato", ranges: [{ start: "08:00", end: "17:00" }] },
  { id: "morning", label: "Solo la mattina", ranges: [{ start: "08:00", end: "13:00" }] },
];

/** Stato dell'editor: giorni di lavoro, orari di tutti i giorni e i giorni con orari diversi. */
type Draft = { workDays: number[]; base: Range[]; special: Record<number, Range[]>; mode: Mode };

const rangesKey = (ranges: Range[]) => ranges.map((r) => `${r.start}-${r.end}`).join(",");

function shortTime(time: string): string {
  const [h, m] = time.split(":");
  return m === "00" ? String(Number(h)) : `${Number(h)}.${m}`;
}

export function rangesLabel(ranges: Range[]): string {
  return ranges.map((r) => `${shortTime(r.start)}–${shortTime(r.end)}`).join(" e ");
}

function minutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** Dalla settimana salvata ai tre passi: gli orari più comuni diventano "tutti i giorni", gli altri "giorni diversi". */
export function draftFromTemplate(template: AgendaWeekTemplate): Draft {
  const workDays = WEEK_ORDER.filter((day) => (template.days[day] ?? []).length > 0);
  const counts = new Map<string, number>();
  for (const day of workDays) {
    const key = rangesKey(template.days[day]!);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const baseDay = workDays.find((day) => rangesKey(template.days[day]!) === [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]);
  const base = baseDay !== undefined ? template.days[baseDay]!.map(({ start, end }) => ({ start, end })) : PRESETS[0]!.ranges;
  const special: Record<number, Range[]> = {};
  for (const day of workDays) {
    if (rangesKey(template.days[day]!) !== rangesKey(base)) special[day] = template.days[day]!.map(({ start, end }) => ({ start, end }));
  }
  const first = workDays.length ? template.days[workDays[0]!]![0] : undefined;
  const mode: Mode = {
    allowsHome: first?.allowsHome ?? true,
    allowsOnline: first?.allowsOnline ?? false,
    perSlot: (first?.allowsHome ? first.homeMax : first?.onlineMax) ?? 1,
  };
  return { workDays, base, special, mode };
}

export function templateFromDraft(draft: Draft): AgendaWeekTemplate {
  const toSlot = (r: Range): WeekTemplateSlot => ({
    start: r.start,
    end: r.end,
    allowsHome: draft.mode.allowsHome,
    allowsOnline: draft.mode.allowsOnline,
    homeMax: draft.mode.allowsHome ? draft.mode.perSlot : null,
    onlineMax: draft.mode.allowsOnline ? draft.mode.perSlot : null,
  });
  return {
    days: [0, 1, 2, 3, 4, 5, 6].map((day) =>
      draft.workDays.includes(day) ? [...(draft.special[day] ?? draft.base)].sort((a, b) => a.start.localeCompare(b.start)).map(toSlot) : [],
    ),
  };
}

/** "dal lunedì al sabato, 8–13 e 14–20": giorni di lavoro e orari più comuni, per l'avviso degli orari di partenza (§364). */
export function starterDaysLabel(template: AgendaWeekTemplate): string {
  const { workDays, base } = draftFromTemplate(template);
  if (workDays.length === 0) return "nessun giorno";
  const names = workDays.map((day) => WEEKDAY_FULL_LABELS[day]!.toLowerCase());
  const positions = workDays.map((day) => WEEK_ORDER.indexOf(day));
  const consecutive = positions.every((pos, i) => i === 0 || pos === positions[i - 1]! + 1);
  const days =
    workDays.length === 1
      ? names[0]!
      : consecutive && workDays.length > 2
        ? `dal ${names[0]} al ${names[names.length - 1]}`
        : `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}`;
  // "14–20" non si spezza a capo sul telefono.
  return `${days}, ${rangesLabel(base).replaceAll("–", "\u2060–\u2060")}`;
}

function rangesError(ranges: Range[]): string | null {
  if (ranges.some((r) => r.end <= r.start)) return "L'orario di fine deve essere dopo quello di inizio.";
  const sorted = [...ranges].sort((a, b) => a.start.localeCompare(b.start));
  for (let i = 1; i < sorted.length; i++) if (sorted[i]!.start < sorted[i - 1]!.end) return "Due orari dello stesso giorno si sovrappongono.";
  return null;
}

function nextRange(ranges: Range[]): Range {
  const last = ranges[ranges.length - 1];
  if (!last) return { start: "09:00", end: "13:00" };
  const start = Math.min(minutes(last.end) + 60, 22 * 60);
  const end = Math.min(start + 120, 23 * 60 + 59);
  const fmt = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  return { start: fmt(start), end: fmt(end) };
}

/**
 * "Lun" a vista, "Lunedì" per chi usa un lettore di schermo: il resto del nome
 * resta nel testo ma senza dimensione (con `sr-only` si leggeva "Lun edì").
 */
function DayName({ day }: { day: number }) {
  const full = WEEKDAY_FULL_LABELS[day]!;
  return (
    <>
      {full.slice(0, 3)}
      <span className="ag-wt-rest">{full.slice(3)}</span>
    </>
  );
}

/** Righe "Dalle … alle …" con la crocetta per togliere un orario e "Aggiungi un orario". */
function RangesEditor({ ranges, onChange, label }: { ranges: Range[]; onChange: (next: Range[]) => void; label: string }) {
  const error = rangesError(ranges);
  return (
    <div className="ag-wt-ranges">
      {ranges.map((range, index) => (
        <div key={index} className="ag-wt-range">
          <label>
            <span className="ag-muted ag-wt-word" aria-hidden>
              Dalle
            </span>
            <ItalianTimeInput
              className="ag-input"
              wrapperClassName="ag-wt-time"
              padX={8}
              value={range.start}
              step={900}
              ariaLabel={`${label}: inizio ${index + 1}° orario`}
              onChange={(value) => onChange(ranges.map((r, i) => (i === index ? { ...r, start: value } : r)))}
            />
          </label>
          <label>
            <span className="ag-muted ag-wt-word" aria-hidden>
              alle
            </span>
            <span className="ag-muted ag-wt-dash" aria-hidden>
              –
            </span>
            <ItalianTimeInput
              className="ag-input"
              wrapperClassName="ag-wt-time"
              padX={8}
              value={range.end}
              step={900}
              ariaLabel={`${label}: fine ${index + 1}° orario`}
              onChange={(value) => onChange(ranges.map((r, i) => (i === index ? { ...r, end: value } : r)))}
            />
          </label>
          {ranges.length > 1 ? (
            <button type="button" className="ag-wt-remove" aria-label={`Togli l'orario ${rangesLabel([range])}`} onClick={() => onChange(ranges.filter((_, i) => i !== index))}>
              <X size={18} aria-hidden />
            </button>
          ) : null}
        </div>
      ))}
      {ranges.length < MAX_RANGES ? (
        <button type="button" className="ag-wt-add" onClick={() => onChange([...ranges, nextRange(ranges)])}>
          <Plus size={16} aria-hidden /> Aggiungi un orario
        </button>
      ) : null}
      {error ? (
        <p className="ag-wt-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Anteprima "Come la vedono i clienti" (solo da computer). */
function WeekPreview({ template }: { template: AgendaWeekTemplate }) {
  const all = template.days.flat();
  const from = Math.min(8 * 60, ...all.map((s) => minutes(s.start)));
  const to = Math.max(19 * 60, ...all.map((s) => minutes(s.end)));
  const span = to - from;
  const hours: number[] = [];
  for (let h = Math.ceil(from / 60); h <= Math.floor(to / 60); h += 2) hours.push(h);
  return (
    <div className="ag-wt-preview" aria-hidden>
      <div className="ag-wt-preview-hours">
        {hours.map((h) => (
          <span key={h} style={{ top: `${((h * 60 - from) / span) * 100}%` }}>
            {h}
          </span>
        ))}
      </div>
      {WEEK_ORDER.map((day) => (
        <div key={day} className="ag-wt-preview-day">
          <span className="ag-wt-preview-label">{WEEKDAY_SHORT[day]}</span>
          <div className="ag-wt-preview-col">
            {(template.days[day] ?? []).length === 0 ? <span className="ag-wt-preview-free">Libero</span> : null}
            {(template.days[day] ?? []).map((slot) => (
              <div
                key={slot.start}
                className="ag-wt-preview-block"
                style={{ top: `${((minutes(slot.start) - from) / span) * 100}%`, height: `${((minutes(slot.end) - minutes(slot.start)) / span) * 100}%` }}
              >
                {shortTime(slot.start)}–{shortTime(slot.end)}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Settimana tipo di "Orari di lavoro" in tre passi (proposta A scelta
 * dall'utente, docs/CHANGELOG.md §323): che giorni, in che orari, quale
 * giorno ha orari diversi. Salvata per "Tutti i mesi" vale per tutte le
 * settimane, oppure per un mese solo (§327): il server
 * riempie i prossimi 63 giorni e ogni notte quelli nuovi; i giorni cambiati
 * a mano in "Giorno per giorno" restano come sono.
 */
export function WeekTemplateEditor({
  template,
  active,
  starter = false,
  onKeepStarter,
  online = true,
  onEnableOnline,
  months,
  onSave,
  saving,
}: {
  template: AgendaWeekTemplate;
  active: boolean;
  /** Orari di partenza messi alla creazione del profilo e non ancora confermati (§364). */
  starter?: boolean;
  onKeepStarter?: () => void;
  /** Il profilo offre la consulenza online: senza, "Online" non si propone (§365). */
  online?: boolean;
  /** Riattiva l'online nel profilo da qui (§367); true se è andato a buon fine. */
  onEnableOnline?: () => Promise<boolean>;
  /** Mesi che si possono scegliere per salvare la settimana solo lì: `key` AAAA-MM. */
  months: { key: string; label: string }[];
  onSave: (next: AgendaWeekTemplate, month: string | null) => Promise<boolean>;
  saving: boolean;
}) {
  const [draft, setDraft] = useState<Draft>(() => draftFromTemplate(template));
  const [openDay, setOpenDay] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  // "" = tutti i mesi; altrimenti un mese solo (richiesta dell'utente, docs/CHANGELOG.md §327).
  const [scope, setScope] = useState("");
  const [savedMonth, setSavedMonth] = useState<string | null>(null);
  const [enablingOnline, setEnablingOnline] = useState(false);
  const [onlineNotice, setOnlineNotice] = useState<"enabled" | "error" | null>(null);
  // Una settimana cambiata da fuori (es. "Aggiungi alla settimana tipo" da
  // Richieste in zona) arriva con un nuovo `key` e riparte da qui.
  const savedKey = JSON.stringify(template);

  const next = useMemo(() => templateFromDraft(draft), [draft]);
  const valid = agendaWeekTemplateSchema.safeParse(next).success && (draft.mode.allowsHome || draft.mode.allowsOnline);
  const dirty = JSON.stringify(next) !== savedKey;
  const totalMinutes = next.days.flat().reduce((sum, s) => sum + minutes(s.end) - minutes(s.start), 0);
  const hoursText = totalMinutes % 60 ? `${Math.floor(totalMinutes / 60)} ore e ${totalMinutes % 60} minuti` : `${totalMinutes / 60} ore`;
  const activePreset = PRESETS.find((p) => rangesKey(p.ranges) === rangesKey(draft.base))?.id ?? null;
  const specialDays = WEEK_ORDER.filter((day) => draft.workDays.includes(day) && draft.special[day]);
  const sameDays = WEEK_ORDER.filter((day) => draft.workDays.includes(day) && !draft.special[day]);

  const update = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  function toggleDay(day: number) {
    const workDays = draft.workDays.includes(day) ? draft.workDays.filter((d) => d !== day) : [...draft.workDays, day];
    const special = { ...draft.special };
    if (!workDays.includes(day)) delete special[day];
    update({ workDays, special });
  }
  async function enableOnline() {
    if (!onEnableOnline || enablingOnline) return;
    setEnablingOnline(true);
    const ok = await onEnableOnline();
    setEnablingOnline(false);
    setOnlineNotice(ok ? "enabled" : "error");
    if (!ok) return;
    setDraft((d) => ({ ...d, mode: { ...d.mode, allowsOnline: true } }));
  }
  function setSpecial(day: number, ranges: Range[] | null) {
    const special = { ...draft.special };
    if (ranges) special[day] = ranges;
    else delete special[day];
    update({ special });
  }

  return (
    <section className="ag-card ag-wt" aria-labelledby="ag-wt-title">
      <h2 id="ag-wt-title" style={{ fontSize: 19 }}>
        La tua settimana
      </h2>
      <p className="ag-muted" style={{ fontSize: 14, marginTop: 4 }}>
        Vale per tutti i mesi o per il mese che scegli in fondo. Un giorno diverso lo cambi in &quot;Giorno per giorno&quot;.
      </p>
      {starter ? (
        <div className="ag-banner info ag-wt-starter" role="status">
          <span>
            <b>Orari di partenza.</b> Li abbiamo messi noi e i clienti li vedono già: cambiali qui sotto e salva, quando vuoi.
          </span>
          {onKeepStarter ? (
            <button type="button" className="ag-btn sm" onClick={onKeepStarter}>
              Vanno bene così
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="ag-wt-body">
        <div className="ag-wt-steps">
          <fieldset className="ag-wt-step">
            <legend>1. Che giorni lavori?</legend>
            <div className="ag-wt-days">
              {WEEK_ORDER.map((day) => {
                const on = draft.workDays.includes(day);
                return (
                  <button key={day} type="button" className={`ag-wt-day${on ? " is-on" : ""}`} aria-pressed={on} onClick={() => toggleDay(day)}>
                    <DayName day={day} />
                  </button>
                );
              })}
            </div>
          </fieldset>

          <fieldset className="ag-wt-step">
            <legend>2. In che orari?</legend>
            <div className="ag-wt-presets" role="radiogroup" aria-label="Orari di tutti i giorni">
              {PRESETS.map((preset) => (
                <label key={preset.id} className={`ag-wt-preset${activePreset === preset.id ? " is-on" : ""}`}>
                  <input type="radio" name="ag-wt-preset" checked={activePreset === preset.id} onChange={() => update({ base: preset.ranges })} />
                  <span>
                    <b>{preset.label}</b>
                    <span className="ag-muted">{rangesLabel(preset.ranges)}</span>
                  </span>
                </label>
              ))}
            </div>
            <p className="ag-wt-hint ag-muted">{activePreset ? "Puoi ritoccare gli orari:" : "I tuoi orari:"}</p>
            <RangesEditor ranges={draft.base} onChange={(base) => update({ base })} label="Tutti i giorni" />
            <div className="ag-wt-mode">
              <span className="ag-muted">Come lavori</span>
              <button
                type="button"
                className={`ag-wt-chip${draft.mode.allowsHome ? " is-on" : ""}`}
                aria-pressed={draft.mode.allowsHome}
                onClick={() => update({ mode: { ...draft.mode, allowsHome: !draft.mode.allowsHome } })}
              >
                {draft.mode.allowsHome ? <Check size={15} aria-hidden /> : null} A domicilio
              </button>
              {/* Si vede ancora se una settimana vecchia ha l'online acceso, per poterlo spegnere. */}
              {online || draft.mode.allowsOnline ? (
                <button
                  type="button"
                  className={`ag-wt-chip${draft.mode.allowsOnline ? " is-on" : ""}`}
                  aria-pressed={draft.mode.allowsOnline}
                  onClick={() => update({ mode: { ...draft.mode, allowsOnline: !draft.mode.allowsOnline } })}
                >
                  {draft.mode.allowsOnline ? <Check size={15} aria-hidden /> : null} Online
                </button>
              ) : onEnableOnline ? (
                // Online spento nel profilo: si riattiva da qui (richiesta dell'utente, §367).
                <button type="button" className="ag-wt-chip is-add" onClick={() => void enableOnline()} disabled={enablingOnline} aria-label="Attiva l'online: lavori anche in videochiamata">
                  <Plus size={15} aria-hidden /> {enablingOnline ? "Attivo…" : "Online"}
                </button>
              ) : null}
              <label className="ag-wt-per-slot">
                <span className="ag-muted">Clienti per orario</span>
                <select className="ag-input" value={draft.mode.perSlot} onChange={(e) => update({ mode: { ...draft.mode, perSlot: Number(e.target.value) } })}>
                  {[1, 2, 3, 4, 5, 10, 20].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {onlineNotice ? (
              <p className="ag-wt-hint ag-muted" role="status">
                {onlineNotice === "enabled" ? "Online attivato anche nel profilo. Salva per aggiungerlo agli orari." : "Online non attivato, riprova."}
              </p>
            ) : null}
            {!draft.mode.allowsHome && !draft.mode.allowsOnline ? (
              <p className="ag-wt-error" role="alert">
                Scegli almeno A domicilio oppure Online.
              </p>
            ) : null}
          </fieldset>

          <fieldset className="ag-wt-step">
            <legend>3. Un giorno ha orari diversi?</legend>
            {specialDays.length === 0 && !adding ? <p className="ag-muted ag-wt-hint">No, tutti i giorni di lavoro hanno gli stessi orari.</p> : null}
            {specialDays.map((day) =>
              openDay === day ? (
                <div key={day} className="ag-wt-special is-open">
                  <b>{WEEKDAY_FULL_LABELS[day]}</b>
                  <RangesEditor ranges={draft.special[day]!} onChange={(ranges) => setSpecial(day, ranges)} label={WEEKDAY_FULL_LABELS[day]!} />
                  <div className="ag-wt-special-actions">
                    <button type="button" className="ag-btn sm" onClick={() => setOpenDay(null)}>
                      Fatto
                    </button>
                    <button
                      type="button"
                      className="ag-btn sm ag-wt-ghost"
                      onClick={() => {
                        setSpecial(day, null);
                        setOpenDay(null);
                      }}
                    >
                      Come gli altri giorni
                    </button>
                  </div>
                </div>
              ) : (
                <div key={day} className="ag-wt-special">
                  <span>
                    <b>{WEEKDAY_FULL_LABELS[day]}</b>
                    <span className="ag-muted"> · {rangesLabel(draft.special[day]!)}</span>
                  </span>
                  <button type="button" className="ag-btn sm" onClick={() => setOpenDay(day)} aria-label={`Cambia gli orari di ${WEEKDAY_FULL_LABELS[day]?.toLowerCase()}`}>
                    Cambia
                  </button>
                </div>
              ),
            )}
            {adding ? (
              <div className="ag-wt-pick" role="group" aria-label="Quale giorno?">
                <span className="ag-muted">Quale giorno?</span>
                <div className="ag-wt-days">
                  {sameDays.map((day) => (
                    <button
                      key={day}
                      type="button"
                      className="ag-wt-day"
                      onClick={() => {
                        setSpecial(day, draft.base);
                        setOpenDay(day);
                        setAdding(false);
                      }}
                    >
                      <DayName day={day} />
                    </button>
                  ))}
                  <button type="button" className="ag-btn sm ag-wt-ghost" onClick={() => setAdding(false)}>
                    Annulla
                  </button>
                </div>
              </div>
            ) : sameDays.length > 0 && draft.workDays.length > 1 ? (
              <button type="button" className="ag-wt-add" onClick={() => setAdding(true)}>
                <Plus size={16} aria-hidden /> Aggiungi un giorno diverso
              </button>
            ) : null}
          </fieldset>
        </div>

        <div className="ag-wt-aside">
          <h3>Come la vedono i clienti</h3>
          <WeekPreview template={next} />
        </div>
      </div>

      <div className="ag-wt-footer">
        <span className="ag-muted" aria-live="polite">
          {draft.workDays.length === 0 ? "Nessun giorno di lavoro" : `${hoursText} a settimana`}
          {" · "}
          {saving
            ? "Salvo..."
            : savedMonth
              ? `Salvata per ${savedMonth}`
              : dirty || !active
                ? "Non ancora salvata"
                : "Salvata, vale per tutti i mesi"}
        </span>
        <div className="ag-wt-save">
          <label className="ag-wt-scope">
            <span className="ag-muted">Vale per</span>
            <select className="ag-input" value={scope} onChange={(e) => setScope(e.target.value)}>
              <option value="">Tutti i mesi</option>
              {months.map((m) => (
                <option key={m.key} value={m.key}>
                  Solo {m.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="ag-btn primary"
            disabled={!valid || saving || (!scope && !dirty && active)}
            onClick={async () => {
              const ok = await onSave(next, scope || null);
              if (ok) setSavedMonth(scope ? (months.find((m) => m.key === scope)?.label ?? null) : null);
            }}
          >
            Salva la settimana
          </button>
        </div>
      </div>
    </section>
  );
}
