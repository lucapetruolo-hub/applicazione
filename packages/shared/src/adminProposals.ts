import type { AdminScope } from "./adminRoles";

/**
 * Proposte da approvare in Admin (richiesta di Luca,
 * docs/changelog/2026-11-03-automazioni-admin.md): il sito prepara la
 * modifica e il motivo, l'admin preme "Approva". Niente parte da solo.
 * "Approva" chiama lo stesso servizio del pulsante a mano, con lo stesso
 * permesso e lo stesso registro azioni. Mai per soldi, sospensioni,
 * verifica dell'identità o boost: restano decisioni caso per caso.
 */
export const ADMIN_PROPOSAL_KINDS = [
  "EXAMPLE_PHRASE",
  "DICTIONARY_WORD",
  "DICTIONARY_SERVICE_WORD",
  "STANDARD_SERVICE",
  "MERGE_SERVICE_NAME",
  "PROFILE_REMINDER",
  "PAUSE_SUGGESTION",
  "TEST_ACCOUNTS",
  "GENERAL_REQUESTS_REOPEN",
  "GENERAL_REQUESTS_CLOSE",
] as const;
export type AdminProposalKind = (typeof ADMIN_PROPOSAL_KINDS)[number];

export type AdminProposalKindInfo = {
  /** Etichetta corta sopra la scheda. */
  label: string;
  /** Lo stesso permesso del pulsante a mano. */
  scope: AdminScope;
  /** Testo del pulsante "Approva". */
  approveLabel: string;
  /** Dove si annulla, con il pulsante di sempre. `null`: non si annulla (lo dice la scheda). */
  undo: { label: string; href: string } | null;
  /** Chiede una conferma in più prima di eseguire (cancella dati per sempre). */
  confirm?: string;
};

export const ADMIN_PROPOSAL_KINDS_INFO: Record<AdminProposalKind, AdminProposalKindInfo> = {
  EXAMPLE_PHRASE: {
    label: "Frase d'esempio in home",
    scope: "MODERATION",
    approveLabel: "Aggiungi la frase",
    undo: { label: "Si toglie da Mestieri richiesti", href: "/admin/mestieri-richiesti" },
  },
  DICTIONARY_WORD: {
    label: "Parola per il dizionario",
    scope: "MODERATION",
    approveLabel: "Insegna la parola",
    undo: { label: "Si toglie da Mestieri richiesti", href: "/admin/mestieri-richiesti" },
  },
  DICTIONARY_SERVICE_WORD: {
    label: "Parola per una prestazione",
    scope: "MODERATION",
    approveLabel: "Insegna la parola",
    undo: { label: "Si toglie da Mestieri richiesti", href: "/admin/mestieri-richiesti" },
  },
  STANDARD_SERVICE: {
    label: "Prestazione da suggerire",
    scope: "MODERATION",
    approveLabel: "Aggiungi alle suggerite",
    undo: { label: "Si toglie da Prestazioni per mestiere", href: "/admin/mestieri-richiesti?scheda=prestazioni" },
  },
  MERGE_SERVICE_NAME: {
    label: "Nomi da unire",
    scope: "MODERATION",
    approveLabel: "Unisci",
    undo: { label: "Si separa da Prestazioni per mestiere", href: "/admin/mestieri-richiesti?scheda=prestazioni" },
  },
  PROFILE_REMINDER: {
    label: "Email: profilo da completare",
    scope: "MODERATION",
    approveLabel: "Manda l'email",
    undo: null,
  },
  PAUSE_SUGGESTION: {
    label: "Email: consiglio di mettersi in pausa",
    scope: "MODERATION",
    approveLabel: "Manda l'email",
    undo: null,
  },
  TEST_ACCOUNTS: {
    label: "Account di prova",
    scope: "SUPER",
    approveLabel: "Elimina gli account",
    undo: null,
    confirm: "Si eliminano per sempre, con quello che hanno creato. Confermi?",
  },
  GENERAL_REQUESTS_REOPEN: {
    label: "Richieste generali",
    scope: "MODERATION",
    approveLabel: "Riapri",
    undo: { label: "Si richiude da Richieste generali", href: "/admin/richieste-generali" },
  },
  GENERAL_REQUESTS_CLOSE: {
    label: "Richieste generali",
    scope: "MODERATION",
    approveLabel: "Chiudi",
    undo: { label: "Si riapre da Richieste generali", href: "/admin/richieste-generali" },
  },
};

/** Cosa cambia, mostrato prima di approvare. */
export type AdminProposalPreview =
  | { type: "lines"; lines: string[] }
  | {
      type: "email";
      /** L'email com'è per il primo destinatario: le altre cambiano solo nel nome e in cosa manca. */
      subject: string;
      title: string;
      paragraphs: string[];
      cta: string | null;
      recipients: { label: string; detail: string | null; href: string | null }[];
    };

export type AdminProposal = {
  id: string;
  kind: AdminProposalKind;
  title: string;
  why: string;
  preview: AdminProposalPreview;
  /** Non si annulla dopo (un'email partita, un account eliminato): la scheda lo dice. */
  irreversible: boolean;
  createdAt: string;
};

export type AdminProposalList = {
  /** Le più utili, al massimo ADMIN_PROPOSALS_VISIBLE. */
  items: AdminProposal[];
  /** Tutte quelle in attesa che questo admin può approvare. */
  total: number;
};

/** Una proposta fermata con "No, mai": si può rimettere in Da approvare. */
export type AdminRejectedProposal = {
  id: string;
  kind: AdminProposalKind;
  title: string;
  decidedAt: string | null;
  /** Chi ha detto "No, mai". */
  decidedBy: string | null;
};

/** Esito di "Riproponi": torna in Da approvare solo se vale ancora. */
export type AdminProposalRestore = { back: boolean };

export type AdminProposalAction = "approve" | "snooze" | "never";
export type AdminProposalDecision = { status: "APPROVED" | "SNOOZED" | "REJECTED"; result: string | null };

/** Quante proposte si vedono insieme (le altre arrivano dopo). */
export const ADMIN_PROPOSALS_VISIBLE = 5;
/** "Non ora": la proposta torna dopo questi giorni, se vale ancora. */
export const ADMIN_PROPOSAL_SNOOZE_DAYS = 14;
