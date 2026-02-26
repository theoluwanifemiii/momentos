CREATE TYPE "FeedbackType" AS ENUM ('BUG_REPORT', 'FEATURE_REQUEST', 'SUGGESTION');

CREATE TABLE "feedback_entries" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "userId" TEXT,
  "type" "FeedbackType" NOT NULL,
  "subject" TEXT,
  "message" TEXT NOT NULL,
  "pagePath" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "feedback_entries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "feedback_entries_organizationId_createdAt_idx"
ON "feedback_entries"("organizationId", "createdAt");

CREATE INDEX "feedback_entries_type_createdAt_idx"
ON "feedback_entries"("type", "createdAt");

ALTER TABLE "feedback_entries"
ADD CONSTRAINT "feedback_entries_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "feedback_entries"
ADD CONSTRAINT "feedback_entries_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
