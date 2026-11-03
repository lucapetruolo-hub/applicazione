import { z } from "zod";
import "./zod";

/** "Approva", "Non ora", "No, mai" su una proposta (docs/changelog/2026-11-03-automazioni-admin.md). */
export const adminProposalDecisionSchema = z.object({ action: z.enum(["approve", "snooze", "never"]) });
export type AdminProposalDecisionInput = z.infer<typeof adminProposalDecisionSchema>;
