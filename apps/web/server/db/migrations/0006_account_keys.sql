CREATE TABLE "account_keys" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"kid" "bytea" NOT NULL,
	"claimed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"claimed_by_device_label" text,
	CONSTRAINT "ck_account_keys_kid_len" CHECK (octet_length("account_keys"."kid") = 16)
);
--> statement-breakpoint
ALTER TABLE "records" ADD COLUMN "kid" "bytea";--> statement-breakpoint
ALTER TABLE "account_keys" ADD CONSTRAINT "account_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_account_keys_user" ON "account_keys" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "records" ADD CONSTRAINT "ck_records_kid_len" CHECK ("records"."kid" is null or octet_length("records"."kid") = 16);