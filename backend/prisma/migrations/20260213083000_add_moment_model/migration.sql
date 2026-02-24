-- CreateEnum
CREATE TYPE "MomentCategory" AS ENUM (
    'BIRTHDAY',
    'ANNIVERSARY',
    'GRADUATION',
    'PROMOTION_CAREER_MILESTONE',
    'SPIRITUAL_MILESTONE',
    'REMEMBRANCE_DAY',
    'CUSTOM'
);

-- CreateEnum
CREATE TYPE "MomentRecurrence" AS ENUM ('ONE_TIME', 'ANNUAL', 'CUSTOM');

-- CreateEnum
CREATE TYPE "MomentOwnerType" AS ENUM ('ORGANIZATION', 'USER');

-- CreateEnum
CREATE TYPE "MomentStatus" AS ENUM ('ACTIVE', 'PAUSED');

-- AlterTable
ALTER TABLE "delivery_logs"
ADD COLUMN "momentId" TEXT;

-- CreateTable
CREATE TABLE "moments" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" "MomentCategory" NOT NULL,
    "eventDate" TIMESTAMP(3) NOT NULL,
    "recurrenceRule" "MomentRecurrence" NOT NULL DEFAULT 'ANNUAL',
    "deliveryChannels" "DeliveryChannel"[] NOT NULL DEFAULT ARRAY['email']::"DeliveryChannel"[],
    "templateId" TEXT,
    "ownerType" "MomentOwnerType" NOT NULL DEFAULT 'ORGANIZATION',
    "ownerOrganizationId" TEXT,
    "ownerUserId" TEXT,
    "status" "MomentStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "moments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "moment_recipients" (
    "id" TEXT NOT NULL,
    "momentId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "moment_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "delivery_logs_momentId_idx" ON "delivery_logs"("momentId");

-- CreateIndex
CREATE INDEX "moments_ownerOrganizationId_status_idx" ON "moments"("ownerOrganizationId", "status");

-- CreateIndex
CREATE INDEX "moments_ownerUserId_status_idx" ON "moments"("ownerUserId", "status");

-- CreateIndex
CREATE INDEX "moments_eventDate_recurrenceRule_status_idx" ON "moments"("eventDate", "recurrenceRule", "status");

-- CreateIndex
CREATE UNIQUE INDEX "moment_recipients_momentId_personId_key" ON "moment_recipients"("momentId", "personId");

-- CreateIndex
CREATE INDEX "moment_recipients_personId_idx" ON "moment_recipients"("personId");

-- AddForeignKey
ALTER TABLE "delivery_logs"
ADD CONSTRAINT "delivery_logs_momentId_fkey"
FOREIGN KEY ("momentId") REFERENCES "moments"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moments"
ADD CONSTRAINT "moments_templateId_fkey"
FOREIGN KEY ("templateId") REFERENCES "templates"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moments"
ADD CONSTRAINT "moments_ownerOrganizationId_fkey"
FOREIGN KEY ("ownerOrganizationId") REFERENCES "organizations"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moments"
ADD CONSTRAINT "moments_ownerUserId_fkey"
FOREIGN KEY ("ownerUserId") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moment_recipients"
ADD CONSTRAINT "moment_recipients_momentId_fkey"
FOREIGN KEY ("momentId") REFERENCES "moments"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moment_recipients"
ADD CONSTRAINT "moment_recipients_personId_fkey"
FOREIGN KEY ("personId") REFERENCES "people"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
