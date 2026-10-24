-- CreateEnum
CREATE TYPE "TrafficSource" AS ENUM ('GOOGLE', 'OTHER_SEARCH', 'SOCIAL', 'DIRECT', 'OTHER');

-- AlterTable
ALTER TABLE "guided_requests" ADD COLUMN     "trafficSource" "TrafficSource";
