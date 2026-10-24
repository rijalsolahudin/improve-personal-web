ALTER TABLE "devices" ADD COLUMN "installation_id" uuid;--> statement-breakpoint
CREATE INDEX "idx_devices_user_installation" ON "devices" USING btree ("user_id","installation_id");