ALTER TYPE "campaign_status" ADD VALUE 'scheduled';
--> statement-breakpoint
ALTER TYPE "campaign_status" ADD VALUE 'cancelled';
--> statement-breakpoint
UPDATE "campaigns"
SET "status" = 'scheduled'
WHERE "scheduled_at" IS NOT NULL
  AND "status" = 'queued';
