-- CreateEnum
CREATE TYPE "ErrorSeverity" AS ENUM ('INFO', 'WARN', 'ERROR', 'CRITICAL');

-- CreateTable
CREATE TABLE "system_error_logs" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "severity" "ErrorSeverity" NOT NULL DEFAULT 'ERROR',
    "message" TEXT NOT NULL,
    "organizationId" TEXT,
    "channel" "DeliveryChannel",
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_error_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "system_error_logs_source_createdAt_idx" ON "system_error_logs"("source", "createdAt");

-- CreateIndex
CREATE INDEX "system_error_logs_category_createdAt_idx" ON "system_error_logs"("category", "createdAt");

-- CreateIndex
CREATE INDEX "system_error_logs_organizationId_createdAt_idx" ON "system_error_logs"("organizationId", "createdAt");

-- AddForeignKey
ALTER TABLE "system_error_logs"
ADD CONSTRAINT "system_error_logs_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
