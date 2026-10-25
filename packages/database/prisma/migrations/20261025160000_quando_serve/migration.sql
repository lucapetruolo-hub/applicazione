-- Quando serve il lavoro, scelto dal cliente (docs/CHANGELOG.md §340).
CREATE TYPE "RequestTiming" AS ENUM ('TODAY', 'WEEK', 'CALM');

ALTER TABLE "guided_requests" ADD COLUMN "timing" "RequestTiming";
