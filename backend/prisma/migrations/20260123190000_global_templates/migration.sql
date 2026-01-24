-- Create join table for global templates assigned to organizations
CREATE TABLE "organization_templates" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "organization_templates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "organization_templates_organizationId_templateId_key"
ON "organization_templates"("organizationId", "templateId");

ALTER TABLE "organization_templates"
ADD CONSTRAINT "organization_templates_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "organization_templates"
ADD CONSTRAINT "organization_templates_templateId_fkey"
FOREIGN KEY ("templateId") REFERENCES "templates"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- Map org templates to canonical global templates by content signature
WITH ranked AS (
  SELECT
    id,
    "organizationId" AS organization_id,
    "isDefault" AS is_default,
    "isActive" AS is_active,
    "createdAt" AS created_at,
    ROW_NUMBER() OVER (
      PARTITION BY "name", "type", "subject", "content", "imageUrl"
      ORDER BY id
    ) AS rn,
    MIN(id) OVER (
      PARTITION BY "name", "type", "subject", "content", "imageUrl"
    ) AS canonical_id
  FROM "templates"
),
agg AS (
  SELECT
    organization_id,
    canonical_id,
    BOOL_OR(is_default) AS is_default,
    BOOL_OR(is_active) AS is_active,
    MIN(created_at) AS assigned_at
  FROM ranked
  GROUP BY organization_id, canonical_id
)
INSERT INTO "organization_templates" (
  "id",
  "organizationId",
  "templateId",
  "isDefault",
  "isActive",
  "assignedAt"
)
SELECT
  md5(random()::text || clock_timestamp()::text || organization_id || canonical_id),
  organization_id,
  canonical_id,
  is_default,
  is_active,
  assigned_at
FROM agg;

-- Repoint delivery logs to canonical templates
WITH ranked AS (
  SELECT
    id,
    MIN(id) OVER (
      PARTITION BY "name", "type", "subject", "content", "imageUrl"
    ) AS canonical_id
  FROM "templates"
)
UPDATE "delivery_logs" AS dl
SET "templateId" = ranked.canonical_id
FROM ranked
WHERE dl."templateId" = ranked.id;

-- Remove duplicate template rows
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY "name", "type", "subject", "content", "imageUrl"
      ORDER BY id
    ) AS rn
  FROM "templates"
)
DELETE FROM "templates"
USING ranked
WHERE "templates".id = ranked.id
  AND ranked.rn > 1;

-- Mark only the default 8 templates as system
UPDATE "templates"
SET "isSystem" = CASE
  WHEN "name" IN (
    'Simple Birthday',
    'Professional Birthday',
    'Fun & Colorful',
    'Modern Gradient Birthday',
    'Minimal & Elegant',
    'Fun & Colorful (Party Theme)',
    'Corporate Professional',
    'Warm & Personal (Community Style)'
  ) THEN true
  ELSE false
END;

-- Drop org-owned columns from templates
ALTER TABLE "templates" DROP CONSTRAINT "templates_organizationId_fkey";
ALTER TABLE "templates" DROP COLUMN "isDefault";
ALTER TABLE "templates" DROP COLUMN "organizationId";
