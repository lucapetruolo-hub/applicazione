/**
 * Pagina in arrivo (collaudo 08/11 E8-02, docs/changelog/2026-11-08-seo-e-velocita.md):
 * al posto del vuoto mentre si carica l'accesso o il JavaScript della pagina,
 * la sagoma della pagina con la riga "Caricamento…". Arriva già nell'HTML del
 * server, quindi su rete lenta si vede subito, prima che il JavaScript sia
 * scaricato. La riga è letta anche dal lettore di schermo.
 *
 * HTML semplice con le classi di globals.css (`.page-loading`), niente
 * componenti Tamagui e sagome ferme: sul telefono lento della prova Lighthouse
 * la sagoma animata e fatta di componenti rallentava l'avvio della pagina vera
 * ("Le mie richieste", TBT oltre 500 ms).
 *
 * `list`: titolo e qualche scheda (richieste, agenda, messaggi…).
 * `form`: colonna stretta con qualche campo e il pulsante (accesso, iscrizione, pagine aperte da un'email).
 */
export function PageLoading({ variant = "list" }: { variant?: "list" | "form" }) {
  const form = variant === "form";
  return (
    <div className={`page-loading${form ? " page-loading--form" : ""}`} aria-busy="true">
      <div className="page-loading-inner">
        <span className="page-loading-bar page-loading-title" />
        <span className="page-loading-bar page-loading-line" />
        {form ? (
          <>
            {[0, 1, 2].map((i) => (
              <span key={i} className="page-loading-field">
                <span className="page-loading-bar page-loading-label" />
                <span className="page-loading-bar page-loading-input" />
              </span>
            ))}
            <span className="page-loading-bar page-loading-button" />
          </>
        ) : (
          [0, 1, 2].map((i) => (
            <span key={i} className="page-loading-card">
              <span className="page-loading-bar page-loading-pill" />
              <span className="page-loading-bar page-loading-card-title" />
              <span className="page-loading-bar page-loading-card-line" />
            </span>
          ))
        )}
        <p role="status" className="page-loading-note">
          Caricamento…
        </p>
      </div>
    </div>
  );
}

/**
 * Sagoma dei primi campi della richiesta di preventivo (passi, tipo di
 * intervento, descrizione, pulsante), stessa idea di `PageLoading`.
 */
export function GuidedRequestSkeleton() {
  return (
    <div className="page-loading-form-shape" aria-busy="true">
      <span className="page-loading-steps">
        <span className="page-loading-bar page-loading-dot" />
        <span className="page-loading-bar page-loading-step" />
        <span className="page-loading-bar page-loading-dot" />
        <span className="page-loading-bar page-loading-step" />
        <span className="page-loading-bar page-loading-dot" />
      </span>
      <span className="page-loading-field">
        <span className="page-loading-bar page-loading-label" />
        <span className="page-loading-bar page-loading-toggle" />
      </span>
      <span className="page-loading-field">
        <span className="page-loading-bar page-loading-label" />
        <span className="page-loading-bar page-loading-textarea" />
      </span>
      <span className="page-loading-bar page-loading-button" />
      <p role="status" className="page-loading-note">
        Stiamo preparando il modulo…
      </p>
    </div>
  );
}
