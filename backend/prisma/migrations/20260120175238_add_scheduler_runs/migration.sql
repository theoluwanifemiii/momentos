-- CreateTable
CREATE TABLE "scheduler_runs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "runDate" TEXT NOT NULL,
    "runTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scheduler_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "scheduler_runs_organizationId_runDate_key" ON "scheduler_runs"("organizationId", "runDate");

-- AddForeignKey
ALTER TABLE "scheduler_runs" ADD CONSTRAINT "scheduler_runs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
