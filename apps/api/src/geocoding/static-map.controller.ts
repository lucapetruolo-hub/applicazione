import { Controller, Get, Query, Res } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Response } from "express";
import { StaticMapService, parseStaticMapQuery } from "./static-map.service";

/** Immagine fissa della mappa per chi non ha accettato i servizi Google (docs/CHANGELOG.md §265). */
@Controller("maps")
export class StaticMapController {
  constructor(private readonly staticMapService: StaticMapService) {}

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get("static")
  async staticMap(@Query() query: { size?: string; m?: string; c?: string; z?: string; r?: string }, @Res() res: Response) {
    const { buffer, contentType } = await this.staticMapService.image(parseStaticMapQuery(query));
    res.setHeader("Content-Type", contentType);
    // Stessa mappa per gli stessi parametri: il browser la riusa per un giorno.
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.send(buffer);
  }
}
