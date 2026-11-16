CREATE TYPE "public"."license_plan" AS ENUM('monthly', 'yearly', 'lifetime');--> statement-breakpoint
CREATE TABLE "license_grants" (
	"order_ref" text PRIMARY KEY NOT NULL,
	"license_id" uuid NOT NULL,
	"plan" "license_plan" NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "license_grants" ADD CONSTRAINT "license_grants_license_id_licenses_id_fk" FOREIGN KEY ("license_id") REFERENCES "public"."licenses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Baris lama (ADR 15) adalah pembelian sekali beli = lifetime.
ALTER TABLE "purchases" ADD COLUMN "plan" "license_plan" DEFAULT 'lifetime' NOT NULL;--> statement-breakpoint
ALTER TABLE "purchases" ALTER COLUMN "plan" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "licenses" ADD COLUMN "plan" "license_plan" DEFAULT 'lifetime' NOT NULL;--> statement-breakpoint
ALTER TABLE "licenses" ALTER COLUMN "plan" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "licenses" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
INSERT INTO "license_grants" ("order_ref", "license_id", "plan", "granted_at") SELECT "order_ref", "id", 'lifetime', "created_at" FROM "licenses";--> statement-breakpoint
DROP INDEX "uq_licenses_order_ref";--> statement-breakpoint
DROP INDEX "idx_licenses_email";--> statement-breakpoint
CREATE UNIQUE INDEX "uq_licenses_email" ON "licenses" USING btree ("email");--> statement-breakpoint
ALTER TABLE "licenses" DROP COLUMN "order_ref";