/**
 * Memoria breve per i numeri di riepilogo pubblici (numeri della home, prezzi
 * medi, lavori più cercati, conteggi per mestiere), docs/changelog/2026-11-16-traffico-elevato.md.
 * Con tante visite insieme la stessa domanda al database partiva centinaia di
 * volte al minuto per un risultato che cambia poco: qui si tiene per
 * `ttlMs` e chi arriva mentre la risposta è in preparazione aspetta quella,
 * senza farne partire un'altra. Mai per profili o risultati della ricerca:
 * un profilo tolto non deve restare visibile (docs/CHANGELOG.md, pagine
 * `force-dynamic`). Un errore non resta in memoria: la volta dopo si riprova.
 */
export class ShortCache<T> {
  private readonly entries = new Map<string, { value: T; expiresAt: number }>();
  private readonly pending = new Map<string, Promise<T>>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries = 500,
    private readonly now: () => number = Date.now,
  ) {}

  async get(key: string, load: () => Promise<T>): Promise<T> {
    const entry = this.entries.get(key);
    if (entry && entry.expiresAt > this.now()) return entry.value;
    const running = this.pending.get(key);
    if (running) return running;
    const promise = load()
      .then((value) => {
        if (this.entries.size >= this.maxEntries) this.entries.delete(this.entries.keys().next().value as string);
        this.entries.set(key, { value, expiresAt: this.now() + this.ttlMs });
        return value;
      })
      .finally(() => this.pending.delete(key));
    this.pending.set(key, promise);
    return promise;
  }

  /** Dopo una modifica fatta dall'admin: la prossima lettura chiede di nuovo al database. */
  clear(): void {
    this.entries.clear();
  }
}

/** Durata di serie: un minuto. */
export const SUMMARY_CACHE_MS = 60_000;
