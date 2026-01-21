-- Add columns for first and last name
ALTER TABLE "waitlist_entries" ADD COLUMN "firstName" TEXT;
ALTER TABLE "waitlist_entries" ADD COLUMN "lastName" TEXT;

-- Backfill from fullName when present
UPDATE "waitlist_entries"
SET "firstName" = split_part("fullName", ' ', 1),
    "lastName" = CASE
      WHEN position(' ' in "fullName") > 0 THEN substring("fullName" from position(' ' in "fullName") + 1)
      ELSE ''
    END;

-- Enforce non-null columns
ALTER TABLE "waitlist_entries" ALTER COLUMN "firstName" SET NOT NULL;
ALTER TABLE "waitlist_entries" ALTER COLUMN "lastName" SET NOT NULL;

-- Drop legacy column
ALTER TABLE "waitlist_entries" DROP COLUMN "fullName";
