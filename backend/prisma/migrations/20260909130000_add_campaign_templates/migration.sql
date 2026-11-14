-- Campaign-only templates. Kept out of "templates" because that table is also
-- rendered by Moments, and a {{body}} slot there would leak into moment emails.
CREATE TABLE "campaign_templates" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subject" TEXT,
    "content" TEXT NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaign_templates_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "campaign_templates_organizationId_isActive_idx"
    ON "campaign_templates"("organizationId", "isActive");

ALTER TABLE "campaign_templates"
    ADD CONSTRAINT "campaign_templates_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Campaigns point at a campaign template. The legacy "templateId" column stays
-- so campaigns created before this migration keep sending exactly as they did.
ALTER TABLE "campaigns" ADD COLUMN "campaignTemplateId" TEXT;

ALTER TABLE "campaigns"
    ADD CONSTRAINT "campaigns_campaignTemplateId_fkey"
    FOREIGN KEY ("campaignTemplateId") REFERENCES "campaign_templates"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
