import { Body, Controller, Post, Req, UseGuards } from "@nestjs/common";
import { reviewSchema, type ReviewInput } from "@professionisti/shared";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { JwtAuthGuard, type AuthenticatedRequest } from "../auth/jwt-auth.guard";
import { ReviewsService } from "./reviews.service";

@Controller("reviews")
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  create(@Req() req: AuthenticatedRequest, @Body(new ZodValidationPipe(reviewSchema)) body: ReviewInput) {
    return this.reviewsService.create(req.user.userId, body);
  }
}
