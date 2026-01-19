-- CreateTable
CREATE TABLE "onboarding_progress" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "completedSteps" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "testEmailSentAt" TIMESTAMP(3),
    "automationActivatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "onboarding_progress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "onboarding_progress_organizationId_key" ON "onboarding_progress"("organizationId");

-- AddForeignKey
ALTER TABLE "onboarding_progress" ADD CONSTRAINT "onboarding_progress_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
