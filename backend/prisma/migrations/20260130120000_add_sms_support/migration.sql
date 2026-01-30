-- Add SMS settings to organization
ALTER TABLE "organizations" ADD COLUMN "smsEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "organizations" ADD COLUMN "senderId" TEXT DEFAULT 'MomentOS';

-- Add delivery channel enum
DO $$ BEGIN
  CREATE TYPE "delivery_channel" AS ENUM ('email', 'sms', 'whatsapp');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Add channel to delivery logs
ALTER TABLE "delivery_logs" ADD COLUMN "channel" "delivery_channel" NOT NULL DEFAULT 'email';

-- Update templates to support multiple channels
ALTER TABLE "templates" ADD COLUMN "channels" "delivery_channel"[] NOT NULL DEFAULT ARRAY['email']::"delivery_channel"[];
