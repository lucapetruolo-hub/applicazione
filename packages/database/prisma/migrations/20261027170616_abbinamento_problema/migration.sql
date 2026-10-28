-- CreateEnum
CREATE TYPE "ProblemTakeoverStatus" AS ENUM ('OPEN', 'DONE');

-- CreateTable
CREATE TABLE "problem_descriptions" (
    "id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "city" TEXT,
    "categories" TEXT[],
    "safety" TEXT,
    "outOfService" TEXT,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "problem_descriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "problem_words" (
    "id" TEXT NOT NULL,
    "word" TEXT NOT NULL,
    "categorySlug" TEXT,
    "outOfService" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "problem_words_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "problem_takeovers" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "city" TEXT,
    "outOfService" TEXT,
    "status" "ProblemTakeoverStatus" NOT NULL DEFAULT 'OPEN',
    "handledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "problem_takeovers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_name_aliases" (
    "key" TEXT NOT NULL,
    "canonical" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_name_aliases_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "problem_descriptions_createdAt_idx" ON "problem_descriptions"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "problem_words_word_key" ON "problem_words"("word");

-- CreateIndex
CREATE INDEX "problem_takeovers_status_createdAt_idx" ON "problem_takeovers"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "problem_takeovers" ADD CONSTRAINT "problem_takeovers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
