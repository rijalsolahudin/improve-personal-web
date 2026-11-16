CREATE TYPE "public"."purchase_status" AS ENUM('pending', 'paid', 'failed');--> statement-breakpoint
CREATE TABLE "purchases" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"amount" integer NOT NULL,
	"status" "purchase_status" DEFAULT 'pending' NOT NULL,
	"mayar_id" text,
	"payment_url" text,
	"expires_at" timestamp with time zone NOT NULL,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_purchases_mayar_id" ON "purchases" USING btree ("mayar_id");--> statement-breakpoint
CREATE INDEX "idx_purchases_email" ON "purchases" USING btree ("email");