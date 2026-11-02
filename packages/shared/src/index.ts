// I messaggi d'errore di zod 3 (src/zod.ts) li carica ogni file con schemi
// (`import "./zod"`), non questo indice: importato qui, zod finiva nel
// JavaScript di ogni pagina del sito anche senza un modulo
// (docs/changelog/2026-11-02-nextjs-16.md). L'API carica comunque tutti i
// file da dist/, quindi la configurazione resta attiva prima di ogni
// validazione.

export * from "./availability";
export * from "./categories";
export * from "./cities";
export * from "./data/comuni";
export * from "./frazioni";
export * from "./dashboard";
export * from "./fiscalValidation";
export * from "./moderation";
export * from "./adminRoles";
export * from "./adminRolesSchemas";
export * from "./plans";
export * from "./professionals";
export * from "./schemas";
export * from "./notifications";
export * from "./notificationPreferencesSchema";
export * from "./completion";
export * from "./jobIssues";
export * from "./onlinePayments";
export * from "./onlineLimit";
export * from "./bankDisputes";
export * from "./profileInvites";
export * from "./scheduleChange";
export * from "./brand";
export * from "./termsChanges";
export * from "./professionalVerification";
export * from "./generalRequests";
export * from "./requestTiming";
export * from "./phoneCountries";
export * from "./requestDeadline";
export * from "./fiscalCompleteness";
export * from "./identityVerification";
export * from "./identityVerificationSchema";
export * from "./addressSuggestions";
export * from "./dac7";
export * from "./appointmentTime";
export * from "./safeRedirect";
export * from "./agendaTools";
export * from "./password";
export * from "./professionalUrl";
export * from "./categorySeo";
export * from "./categoryPrices";
export * from "./trafficSource";
export * from "./trafficSourceSchema";
export * from "./trafficSources";
export * from "./requestWithdraw";
export * from "./cancellationNotice";
export * from "./professionalStats";
export * from "./accounting";
export * from "./siteStats";
export * from "./siteCounting";
export * from "./serviceSearch";
export * from "./problemMatch";
export * from "./serviceNames";
export * from "./problemMatchSchemas";
export * from "./problemSafetyTexts";
export * from "./whatsapp";
export * from "./appointmentReply";
export * from "./adminQueue";
export * from "./adminSignals";
