import { Body, Controller, Headers, HttpCode, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { isBotUserAgent, siteFailureEventSchema, siteStepEventSchema, type SiteFailureEvent, type SiteStepEvent } from "@professionisti/shared";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { SiteCountsService } from "./site-counts.service";

/**
 * Conteggi mandati dal browser (docs/CHANGELOG.md §372): un passo della
 * richiesta raggiunto, un invio non riuscito. Pubblici e senza dati della
 * persona; i robot non contano. Il browser non li manda per admin e per
 * chi ha scelto "Non contare questo browser". Indirizzi senza parole come
 * "track" o "analytics", che i blocchi della pubblicità fermano.
 */
@Controller("site")
export class SiteCountsController {
  constructor(private readonly siteCounts: SiteCountsService) {}

  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Post("step")
  @HttpCode(204)
  async step(@Body(new ZodValidationPipe(siteStepEventSchema)) body: SiteStepEvent, @Headers("user-agent") userAgent?: string): Promise<void> {
    if (isBotUserAgent(userAgent)) return;
    await this.siteCounts.recordStep(body.step, body.categorySlug, body.origin).catch(() => undefined);
  }

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post("failure")
  @HttpCode(204)
  async failure(@Body(new ZodValidationPipe(siteFailureEventSchema)) body: SiteFailureEvent, @Headers("user-agent") userAgent?: string): Promise<void> {
    if (isBotUserAgent(userAgent)) return;
    await this.siteCounts.recordFailure(body.form, body.kind).catch(() => undefined);
  }
}
