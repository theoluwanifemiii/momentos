-- Extend recurrence options for moments.
ALTER TYPE "MomentRecurrence" ADD VALUE IF NOT EXISTS 'DAILY';
ALTER TYPE "MomentRecurrence" ADD VALUE IF NOT EXISTS 'MONTHLY';
ALTER TYPE "MomentRecurrence" ADD VALUE IF NOT EXISTS 'QUARTERLY';
ALTER TYPE "MomentRecurrence" ADD VALUE IF NOT EXISTS 'BI_YEARLY';

-- Store additional recurrence configuration and message-randomization preference.
ALTER TABLE "moments"
ADD COLUMN "customIntervalDays" INTEGER,
ADD COLUMN "randomizeMessage" BOOLEAN NOT NULL DEFAULT false;
