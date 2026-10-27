import { Inject, Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import type { PrismaClient } from "@professionisti/database";
import { ONLINE_APP_FEE_PERCENT } from "@professionisti/shared";
import { PRISMA } from "../prisma/prisma.module";

// Regola globale di default, seminata all'avvio se non esiste già alcuna
// regola (stesso principio di CategoriesSeedService: un ambiente nuovo non
// deve mai trovarsi senza NESSUNA regola di commissione — una commissione
// "assente" verrebbe letta come 0%, silenziosamente sbagliato). Trattenuta
// unica del 7% IVA esclusa sui pagamenti online, a carico del professionista
// e con dentro carta e bonifici di Stripe (decisione dell'utente del
// 27/10/2026, docs/CHANGELOG.md §377; prima 5% più i costi di Stripe, §168):
// resta un DATO in tabella, modificabile da /admin senza deploy.
const DEFAULT_GLOBAL_RULE_NAME = "Trattenuta unica (default)";
const DEFAULT_GLOBAL_RULE_BASIS_POINTS = ONLINE_APP_FEE_PERCENT * 100;
// Regola di default di prima (§168): se è ancora quella in vigore, all'avvio
// si chiude e la sostituisce la trattenuta unica. Mai modificata sul posto.
const PREVIOUS_DEFAULT_RULE = { name: "Commissione standard (default)", percentageBasisPoints: 500 };

@Injectable()
export class PlatformFeeRulesService implements OnModuleInit {
  private readonly logger = new Logger(PlatformFeeRulesService.name);

  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  async onModuleInit() {
    const anyRule = await this.prisma.platformFeeRule.findFirst();
    if (!anyRule) {
      await this.createDefaultRule();
      return;
    }
    const now = new Date();
    const current = await this.prisma.platformFeeRule.findFirst({
      where: { categoryId: null, professionalProfileId: null, effectiveFrom: { lte: now }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }] },
      orderBy: { effectiveFrom: "desc" },
    });
    if (
      current &&
      current.name === PREVIOUS_DEFAULT_RULE.name &&
      current.percentageBasisPoints === PREVIOUS_DEFAULT_RULE.percentageBasisPoints &&
      current.fixedFeeEurCents === 0
    ) {
      await this.prisma.platformFeeRule.update({ where: { id: current.id }, data: { effectiveTo: now } });
      await this.createDefaultRule();
    }
  }

  private async createDefaultRule() {
    await this.prisma.platformFeeRule.create({
      data: { name: DEFAULT_GLOBAL_RULE_NAME, percentageBasisPoints: DEFAULT_GLOBAL_RULE_BASIS_POINTS },
    });
    this.logger.log(`Regola di commissione globale di default creata (${DEFAULT_GLOBAL_RULE_BASIS_POINTS / 100}% + IVA).`);
  }

  /**
   * Risolve la regola applicabile a un professionista/categoria in un dato
   * istante — priorità: regola specifica del professionista > regola
   * specifica della categoria > regola globale (entrambi i campi di scope
   * null). Tra più regole valide nello stesso scope, vince quella con
   * `effectiveFrom` più recente (mai in place: una regola nuova non
   * modifica quelle già "congelate" sui JobPayment esistenti via
   * `appliedFeeRuleId`, solo i nuovi calcoli la useranno).
   */
  async resolveRule(params: { professionalProfileId: string; categoryId?: string | null; at?: Date }) {
    const at = params.at ?? new Date();
    const baseWhere = {
      effectiveFrom: { lte: at },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: at } }],
    };

    const professionalRule = await this.prisma.platformFeeRule.findFirst({
      where: { ...baseWhere, professionalProfileId: params.professionalProfileId },
      orderBy: { effectiveFrom: "desc" },
    });
    if (professionalRule) return professionalRule;

    if (params.categoryId) {
      const categoryRule = await this.prisma.platformFeeRule.findFirst({
        where: { ...baseWhere, categoryId: params.categoryId, professionalProfileId: null },
        orderBy: { effectiveFrom: "desc" },
      });
      if (categoryRule) return categoryRule;
    }

    const globalRule = await this.prisma.platformFeeRule.findFirst({
      where: { ...baseWhere, categoryId: null, professionalProfileId: null },
      orderBy: { effectiveFrom: "desc" },
    });
    return globalRule;
  }

  /** Applica una regola a un importo lordo (commissione IVA esclusa) — mai una divisione/percentuale scritta a mano altrove nel progetto. */
  computeFee(grossAmountEurCents: number, rule: { percentageBasisPoints: number; fixedFeeEurCents: number; minFeeEurCents: number | null; maxFeeEurCents: number | null } | null): number {
    if (!rule) return 0;
    let fee = Math.round((grossAmountEurCents * rule.percentageBasisPoints) / 10_000) + rule.fixedFeeEurCents;
    if (rule.minFeeEurCents !== null) fee = Math.max(fee, rule.minFeeEurCents);
    if (rule.maxFeeEurCents !== null) fee = Math.min(fee, rule.maxFeeEurCents);
    return Math.max(0, Math.min(fee, grossAmountEurCents));
  }

  async listRules() {
    return this.prisma.platformFeeRule.findMany({
      orderBy: { effectiveFrom: "desc" },
      include: { category: { select: { slug: true, label: true } }, professionalProfile: { select: { businessName: true } } },
    });
  }

  async createRule(input: {
    name: string;
    percentageBasisPoints: number;
    fixedFeeEurCents: number;
    minFeeEurCents?: number | null;
    maxFeeEurCents?: number | null;
    categoryId?: string | null;
    professionalProfileId?: string | null;
    effectiveFrom?: string;
  }) {
    return this.prisma.platformFeeRule.create({
      data: {
        name: input.name,
        percentageBasisPoints: input.percentageBasisPoints,
        fixedFeeEurCents: input.fixedFeeEurCents,
        minFeeEurCents: input.minFeeEurCents ?? null,
        maxFeeEurCents: input.maxFeeEurCents ?? null,
        categoryId: input.categoryId ?? null,
        professionalProfileId: input.professionalProfileId ?? null,
        effectiveFrom: input.effectiveFrom ? new Date(input.effectiveFrom) : new Date(),
      },
    });
  }

  /** Chiude una regola (mai cancellata: resta collegata ai JobPayment storici via appliedFeeRuleId). */
  async closeRule(id: string) {
    return this.prisma.platformFeeRule.update({ where: { id }, data: { effectiveTo: new Date() } });
  }
}
