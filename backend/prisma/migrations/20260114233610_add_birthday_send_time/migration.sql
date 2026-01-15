-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "birthdayLastRunAt" TIMESTAMP(3),
ADD COLUMN     "birthdaySendHour" INTEGER NOT NULL DEFAULT 9,
ADD COLUMN     "birthdaySendMinute" INTEGER NOT NULL DEFAULT 0;
