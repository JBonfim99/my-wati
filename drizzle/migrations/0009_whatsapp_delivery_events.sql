CREATE TABLE "whatsapp_delivery_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" bigint NOT NULL,
	"phone_number_id" text NOT NULL,
	"wamid" text,
	"recipient_id" uuid,
	"source" text NOT NULL,
	"delivery_status" text,
	"errors" jsonb,
	"payload" jsonb NOT NULL,
	"webhook_ts" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "whatsapp_delivery_events" ADD CONSTRAINT "whatsapp_delivery_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "whatsapp_delivery_events" ADD CONSTRAINT "whatsapp_delivery_events_recipient_id_campaign_recipients_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."campaign_recipients"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "wde_tenant_wamid_idx" ON "whatsapp_delivery_events" USING btree ("tenant_id","wamid");
--> statement-breakpoint
CREATE INDEX "wde_tenant_created_idx" ON "whatsapp_delivery_events" USING btree ("tenant_id","created_at" DESC);
--> statement-breakpoint
CREATE INDEX "wde_recipient_idx" ON "whatsapp_delivery_events" USING btree ("recipient_id");
