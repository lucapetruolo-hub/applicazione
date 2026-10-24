/**
 * Tetto giornaliero alle chiamate a pagamento verso Google che partono da
 * rotte aperte a tutti (docs/CHANGELOG.md §293): il limite per IP non basta
 * contro chi usa tanti indirizzi IP. In memoria, come i limiti per IP (un
 * solo servizio Render); il conteggio riparte a mezzanotte (ora UTC) e dopo
 * un riavvio. `GOOGLE_PUBLIC_DAILY_LIMIT` su Render cambia il tetto di tutte
 * le voci (0 = nessuna chiamata).
 */
export class DailyBudget {
  private day = "";
  private used = 0;
  private warned = false;

  constructor(
    private readonly defaultLimit: number,
    private readonly onExhausted?: () => void,
  ) {}

  private limit(): number {
    const raw = process.env.GOOGLE_PUBLIC_DAILY_LIMIT?.trim();
    const parsed = raw ? Number(raw) : NaN;
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : this.defaultLimit;
  }

  /** `true` se la chiamata rientra nel tetto di oggi (e la conta). */
  take(now: Date = new Date()): boolean {
    const today = now.toISOString().slice(0, 10);
    if (today !== this.day) {
      this.day = today;
      this.used = 0;
      this.warned = false;
    }
    if (this.used >= this.limit()) {
      if (!this.warned) {
        this.warned = true;
        this.onExhausted?.();
      }
      return false;
    }
    this.used += 1;
    return true;
  }
}
