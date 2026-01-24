-- AlterTable
ALTER TABLE "templates" ADD COLUMN     "isSystem" BOOLEAN NOT NULL DEFAULT false;

UPDATE "templates"
SET "isSystem" = true
WHERE "name" IN (
  'Simple Birthday',
  'Professional Birthday',
  'Fun & Colorful',
  'Modern Gradient Birthday',
  'Minimal & Elegant',
  'Fun & Colorful (Party Theme)',
  'Corporate Professional',
  'Warm & Personal (Community Style)'
);
