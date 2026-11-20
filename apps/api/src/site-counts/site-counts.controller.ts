import { Body, Controller, Get, Headers, HttpCode, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import {
  boardUseEventSchema,
  faqFeedbackEventSchema,
  isBotUserAgent,
  priceToolStepEventSchema,
  siteFailureEventSchema,
  siteProfileViewEventSchema,
  siteStepEventSchema,
  type BoardUseEvent,
  type FaqFeedbackEvent,
  type PriceToolStepEvent,
  type SiteFailureEvent,
  type SiteProfileViewEvent,
  type SiteStepEvent,
} from "@professionisti/shared";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { SiteCountsService } from "./site-counts.service";
import { ContactFaqService } from "./contact-faq.service";

/**
 * Conteggi mandati dal browser (docs/CHANGELOG.md §372): un passo della
 * richiesta raggiunto, un invio non riuscito. Pubblici e senza dati della
 * persona; i robot non contano. Il browser non li manda per admin e per
 * chi ha scelto "Non contare questo browser". Indirizzi senza parole come
 * "track" o "analytics", che i blocchi della pubblicità fermano.
 */
@Controller("site")
export class SiteCountsController {
  constructor(
    private readonly siteCounts: SiteCountsService,
    private readonly contactFaq: ContactFaqService,
  ) {}

  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Post("step")
  @HttpCode(204)
  async step(@Body(new ZodValidationPipe(siteStepEventSchema)) body: SiteStepEvent, @Headers("user-agent") userAgent?: string): Promise<void> {
    if (isBotUserAgent(userAgent)) return;
    await this.siteCounts.recordStep(body.step, body.categorySlug, body.origin, { source: body.source, device: body.device }).catch(() => undefined);
  }

  /** Un passo dalle voci di "Quanto costa" (§399). */
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Post("price-tool")
  @HttpCode(204)
  async priceTool(@Body(new ZodValidationPipe(priceToolStepEventSchema)) body: PriceToolStepEvent, @Headers("user-agent") userAgent?: string): Promise<void> {
    if (isBotUserAgent(userAgent)) return;
    await this.siteCounts.recordPriceToolStep(body.step).catch(() => undefined);
  }

  /** Un'azione in "Lavori cercati" (docs/changelog/2026-11-20-misure-lavori-cercati.md). */
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Post("board")
  @HttpCode(204)
  async board(@Body(new ZodValidationPipe(boardUseEventSchema)) body: BoardUseEvent, @Headers("user-agent") userAgent?: string): Promise<void> {
    if (isBotUserAgent(userAgent)) return;
    await this.siteCounts.recordBoardUse(body.action).catch(() => undefined);
  }

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post("failure")
  @HttpCode(204)
  async failure(@Body(new ZodValidationPipe(siteFailureEventSchema)) body: SiteFailureEvent, @Headers("user-agent") userAgent?: string): Promise<void> {
    if (isBotUserAgent(userAgent)) return;
    await this.siteCounts.recordFailure(body.form, body.kind).catch(() => undefined);
  }

  /** Profilo pubblico aperto, solo il dispositivo (§402). */
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Post("profile-view")
  @HttpCode(204)
  async profileView(@Body(new ZodValidationPipe(siteProfileViewEventSchema)) body: SiteProfileViewEvent, @Headers("user-agent") userAgent?: string): Promise<void> {
    if (isBotUserAgent(userAgent)) return;
    await this.siteCounts.recordProfileView(body.device).catch(() => undefined);
  }

  /** "Ti è stata utile?" sotto una domanda frequente (docs/changelog/2026-11-16-domande-frequenti.md). */
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post("faq-feedback")
  @HttpCode(204)
  async faqFeedback(@Body(new ZodValidationPipe(faqFeedbackEventSchema)) body: FaqFeedbackEvent, @Headers("user-agent") userAgent?: string): Promise<void> {
    if (isBotUserAgent(userAgent)) return;
    await this.siteCounts.recordFaqFeedback(body.faqId, body.helpful).catch(() => undefined);
  }

  /** Le tre domande frequenti sotto "Chi sei?" in Contatti, per chi cerca e per i professionisti. */
  @Get("contact-faq")
  contactFaqPicks() {
    return this.contactFaq.picks();
  }
}
